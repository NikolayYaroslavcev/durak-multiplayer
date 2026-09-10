'use client';

import type { ClientGameState } from '@game/game-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type ErrorPayload,
  type MatchFoundPayload,
  type MoveIntent,
  type MoveRejectedPayload,
} from './protocol';
import { clearSession, loadSession, saveSession } from './session-storage';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export type Notice = { code: string; message: string };

type SocketContextValue = {
  status: ConnectionStatus;
  /** Room we believe we're in — from a fresh match_found or a restored session. Null in the lobby. */
  roomId: string | null;
  /** Our own playerId, used only to tell "you" apart from `status.winnerId` — never a source of truth. */
  playerId: string | null;
  gameState: ClientGameState | null;
  opponentConnected: boolean;
  notice: Notice | null;
  /** True while attempting to resume a stored session after connect, before the first state arrives. */
  restoringSession: boolean;
  joinQueue: () => void;
  leaveQueue: () => void;
  makeMove: (intent: MoveIntent) => void;
  clearNotice: () => void;
  /** Forgets the current room locally so the lobby page stops redirecting back into it. */
  leaveRoom: () => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Starts false on both server and client to avoid a hydration mismatch from reading
  // localStorage during render; flipped synchronously in the effect below, before the
  // socket is even created, so it's still true before the first paint on the client.
  const [restoringSession, setRestoringSession] = useState(false);

  useEffect(() => {
    if (loadSession()) setRestoringSession(true);

    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    let pendingRestore: { roomId: string; playerId: string } | null = null;

    socket.on('connect', () => {
      setStatus('connected');
      const stored = loadSession();
      if (stored) {
        pendingRestore = { roomId: stored.roomId, playerId: stored.playerId };
        setRestoringSession(true);
        socket.emit(SOCKET_EVENTS.RECONNECT, { sessionToken: stored.sessionToken });
      } else {
        setRestoringSession(false);
      }
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on(SOCKET_EVENTS.MATCH_FOUND, (payload: MatchFoundPayload) => {
      saveSession({ roomId: payload.roomId, sessionToken: payload.sessionToken, playerId: payload.playerId });
      setOpponentConnected(true);
      setRoomId(payload.roomId);
      setPlayerId(payload.playerId);
    });

    socket.on(SOCKET_EVENTS.GAME_STATE_UPDATE, (payload: ClientGameState) => {
      if (pendingRestore) {
        setRoomId(pendingRestore.roomId);
        setPlayerId(pendingRestore.playerId);
        setOpponentConnected(true);
        pendingRestore = null;
      }
      setRestoringSession(false);
      setGameState(payload);
    });

    socket.on(SOCKET_EVENTS.OPPONENT_DISCONNECTED, () => {
      setOpponentConnected(false);
    });

    socket.on(SOCKET_EVENTS.OPPONENT_RECONNECTED, () => {
      setOpponentConnected(true);
    });

    socket.on(SOCKET_EVENTS.MOVE_REJECTED, (payload: MoveRejectedPayload) => {
      setNotice(payload);
    });

    socket.on(SOCKET_EVENTS.ERROR, (payload: ErrorPayload) => {
      if (pendingRestore && (payload.code === 'INVALID_SESSION' || payload.code === 'ROOM_NOT_FOUND')) {
        pendingRestore = null;
        clearSession();
        setRestoringSession(false);
      }
      setNotice(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinQueue = useCallback(() => {
    socketRef.current?.emit(SOCKET_EVENTS.JOIN_QUEUE);
  }, []);

  const leaveQueue = useCallback(() => {
    socketRef.current?.emit(SOCKET_EVENTS.LEAVE_QUEUE);
  }, []);

  const makeMove = useCallback((intent: MoveIntent) => {
    socketRef.current?.emit(SOCKET_EVENTS.MAKE_MOVE, intent);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const leaveRoom = useCallback(() => {
    clearSession();
    setRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setRestoringSession(false);
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({
      status,
      roomId,
      playerId,
      gameState,
      opponentConnected,
      notice,
      restoringSession,
      joinQueue,
      leaveQueue,
      makeMove,
      clearNotice,
      leaveRoom,
    }),
    [
      status,
      roomId,
      playerId,
      gameState,
      opponentConnected,
      notice,
      restoringSession,
      joinQueue,
      leaveQueue,
      makeMove,
      clearNotice,
      leaveRoom,
    ],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within a SocketProvider');
  return ctx;
}
