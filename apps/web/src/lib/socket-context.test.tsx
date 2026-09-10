import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketProvider, useSocketContext } from './socket-context';
import { loadSession, saveSession } from './session-storage';

/**
 * Minimal stand-in for a socket.io-client `Socket`. Deliberately does NOT reuse a plain
 * Node EventEmitter's `emit` for both directions: real socket.io keeps "emit to server"
 * (`socket.emit(...)`) and "receive from server" (`socket.on(...)` fired by incoming
 * packets) on separate paths — a client emit never loops back into its own listeners.
 * `serverPush` simulates an incoming server event; `emit` only records what was sent.
 */
const { FakeSocket, instances } = vi.hoisted(() => {
  class FakeSocket {
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    sent: Array<{ event: string; payload?: unknown }> = [];
    connected = false;
    disconnected = true;

    on(event: string, cb: (...args: unknown[]) => void): this {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(cb);
      return this;
    }

    once(event: string, cb: (...args: unknown[]) => void): this {
      const wrapped = (...args: unknown[]) => {
        this.listeners.get(event)?.delete(wrapped);
        cb(...args);
      };
      return this.on(event, wrapped);
    }

    emit(event: string, payload?: unknown): void {
      this.sent.push({ event, payload });
    }

    serverPush(event: string, payload?: unknown): void {
      for (const cb of this.listeners.get(event) ?? []) cb(payload);
    }

    close(): void {
      this.connected = false;
      this.disconnected = true;
    }
  }

  return { FakeSocket, instances: [] as InstanceType<typeof FakeSocket>[] };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const socket = new FakeSocket();
    instances.push(socket);
    return socket;
  }),
}));

function currentSocket() {
  const socket = instances.at(-1);
  if (!socket) throw new Error('no socket created yet');
  return socket;
}

function connect(socket: InstanceType<typeof FakeSocket>) {
  socket.connected = true;
  socket.disconnected = false;
  socket.serverPush('connect');
}

describe('SocketProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    instances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts connecting, with no restore, when there is no stored session', () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });

    expect(result.current.status).toBe('connecting');
    expect(result.current.restoringSession).toBe(false);
    expect(result.current.roomId).toBeNull();
  });

  it('flips to connected and does not attempt a reconnect when nothing was stored', async () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });

    act(() => connect(currentSocket()));

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(currentSocket().sent.find((s) => s.event === 'reconnect')).toBeUndefined();
  });

  it('saves the session and exposes room/player info on match_found', async () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));
    await waitFor(() => expect(result.current.status).toBe('connected'));

    act(() => {
      currentSocket().serverPush('match_found', { roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });
    });

    expect(result.current.roomId).toBe('room-1');
    expect(result.current.playerId).toBe('p1');
    expect(loadSession()).toEqual({ roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });
  });

  it('emits a reconnect request on connect when a session was already stored, and marks it restoring', () => {
    saveSession({ roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });

    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    // Set synchronously by the mount effect, before the socket ever connects.
    expect(result.current.restoringSession).toBe(true);

    act(() => connect(currentSocket()));

    expect(currentSocket().sent).toContainEqual({ event: 'reconnect', payload: { sessionToken: 'tok-123' } });
  });

  it('restores room/player from the stored session once game_state_update arrives after a reconnect', async () => {
    saveSession({ roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));

    const state = {
      yourHand: [],
      opponentCardCount: 6,
      deckCount: 20,
      trumpCard: { suit: '♠', rank: 6 },
      table: [],
      status: { phase: 'in_progress', attackerId: 'p1', defenderId: 'p2' },
      yourTurnRole: 'attacker',
    };
    act(() => currentSocket().serverPush('game_state_update', state));

    await waitFor(() => expect(result.current.restoringSession).toBe(false));
    expect(result.current.roomId).toBe('room-1');
    expect(result.current.playerId).toBe('p1');
    expect(result.current.gameState).toEqual(state);
  });

  it('clears the stored session and stops restoring when the server rejects the token as invalid', async () => {
    saveSession({ roomId: 'room-1', sessionToken: 'stale-token', playerId: 'p1' });
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));
    expect(result.current.restoringSession).toBe(true);

    act(() => {
      currentSocket().serverPush('error', { code: 'INVALID_SESSION', message: 'reconnect failed: INVALID_SESSION' });
    });

    await waitFor(() => expect(result.current.restoringSession).toBe(false));
    expect(loadSession()).toBeNull();
    expect(result.current.notice?.code).toBe('INVALID_SESSION');
  });

  it('clears the stored session when the room the token pointed to no longer exists', async () => {
    saveSession({ roomId: 'room-1', sessionToken: 'old-token', playerId: 'p1' });
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));

    act(() => {
      currentSocket().serverPush('error', { code: 'ROOM_NOT_FOUND', message: 'reconnect failed: ROOM_NOT_FOUND' });
    });

    await waitFor(() => expect(result.current.restoringSession).toBe(false));
    expect(loadSession()).toBeNull();
  });

  it('surfaces move_rejected as a notice without touching the stored session', () => {
    saveSession({ roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));

    act(() => {
      currentSocket().serverPush('move_rejected', { code: 'NOT_YOUR_TURN', message: 'not your turn' });
    });

    expect(result.current.notice).toEqual({ code: 'NOT_YOUR_TURN', message: 'not your turn' });
    expect(loadSession()).not.toBeNull();
  });

  it('clearNotice resets the notice', () => {
    saveSession({ roomId: 'room-1', sessionToken: 'tok-123', playerId: 'p1' });
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));
    act(() => currentSocket().serverPush('move_rejected', { code: 'NOT_YOUR_TURN', message: 'nope' }));
    expect(result.current.notice).not.toBeNull();

    act(() => result.current.clearNotice());
    expect(result.current.notice).toBeNull();
  });

  it('flips opponentConnected around opponent_disconnected / opponent_reconnected', () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));
    expect(result.current.opponentConnected).toBe(true);

    act(() => currentSocket().serverPush('opponent_disconnected'));
    expect(result.current.opponentConnected).toBe(false);

    act(() => currentSocket().serverPush('opponent_reconnected'));
    expect(result.current.opponentConnected).toBe(true);
  });

  it('sends make_move / join_queue / leave_queue as plain emits, never mutating gameState itself', () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));

    act(() => result.current.joinQueue());
    expect(currentSocket().sent).toContainEqual({ event: 'join_queue', payload: undefined });

    act(() => result.current.leaveQueue());
    expect(currentSocket().sent).toContainEqual({ event: 'leave_queue', payload: undefined });

    const intent = { type: 'attack' as const, card: { suit: '♠' as const, rank: 6 as const } };
    act(() => result.current.makeMove(intent));
    expect(currentSocket().sent).toContainEqual({ event: 'make_move', payload: intent });
    // The client never applies a move locally — gameState is untouched until the server replies.
    expect(result.current.gameState).toBeNull();
  });

  it('marks the connection disconnected on a socket "disconnect" event', () => {
    const { result } = renderHook(() => useSocketContext(), { wrapper: SocketProvider });
    act(() => connect(currentSocket()));
    expect(result.current.status).toBe('connected');

    act(() => currentSocket().serverPush('disconnect'));
    expect(result.current.status).toBe('disconnected');
  });
});
