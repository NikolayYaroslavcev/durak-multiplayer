import type { ClientGameState } from '@game/game-core';
import { byRole, matchPlayers } from './matchHelpers';
import { createTestApp, delay, waitForEvent, type TestApp } from './testApp';
import type { ErrorPayload } from '../src/protocol/dto';

describe('room lifecycle: cleanup and concurrency', () => {
  let testApp: TestApp;

  afterEach(async () => {
    await testApp.close();
  });

  it('cleans up session/socket indexes after a normal (non-forfeit) win, not just after forfeit', async () => {
    const CLEANUP_TTL_MS = 150;
    testApp = await createTestApp({ roomCleanupTtlMs: CLEANUP_TTL_MS });
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');

    // Force the room into "one move away from a win" the same way game-core's own
    // gameOver.test.ts does, but through the real matched room/players so the win goes
    // through GameService's normal handleMove -> scheduleRoomCleanup path.
    const room = testApp.gameService.getRoom(pair.roomId);
    if (!room || room.gameState.status.phase !== 'in_progress') throw new Error('room not in progress');
    const attackerId = attacker.match.playerId;
    const defenderId = room.gameState.status.defenderId;

    room.gameState = {
      ...room.gameState,
      players: {
        [attackerId]: { hand: [] },
        [defenderId]: { hand: [{ suit: '♣', rank: 9 }] },
      },
      deck: [],
      table: [{ attack: { suit: '♥', rank: 6 }, defend: { suit: '♥', rank: 9 } }],
    };

    const finalStatePromise = waitForEvent<ClientGameState>(attacker.socket, 'game_state_update');
    attacker.socket.emit('make_move', { type: 'endAttack' });
    const finalState = await finalStatePromise;
    expect(finalState.status.phase).toBe('finished');

    await delay(CLEANUP_TTL_MS + 200);

    const late = testApp.createClient();
    await new Promise<void>((resolve) => late.on('connect', () => resolve()));
    late.emit('reconnect', { sessionToken: attacker.match.sessionToken });
    const err = await waitForEvent<ErrorPayload>(late, 'error');
    // Same reasoning as the forfeit cleanup tests: the session itself is gone after
    // cleanup, regardless of whether the room ended by forfeit or by a normal win.
    expect(err.code).toBe('INVALID_SESSION');
  });

  it('processes two rapid-fire moves from the same client in order against progressively updated state', async () => {
    testApp = await createTestApp();
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');

    // Pin the attacker's hand to two same-rank cards so the second attack is guaranteed to
    // be a legal throw-in once the first has landed, instead of depending on a random deal
    // happening to contain a duplicate rank — this is the "double action" scenario: a
    // client firing a second make_move before seeing the server's response to the first.
    const room = testApp.gameService.getRoom(pair.roomId);
    if (!room) throw new Error('room not found');
    const attackerId = attacker.match.playerId;
    const first = { suit: '♠' as const, rank: 6 as const };
    const second = { suit: '♥' as const, rank: 6 as const };
    room.gameState.players[attackerId].hand = [first, second];

    // Both make_move calls fire before either response arrives, so both resulting
    // game_state_update events can already be in flight by the time we'd register a second
    // `.once()` listener — collect them by count with a single persistent listener instead.
    const secondUpdate = await new Promise<ClientGameState>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for the 2nd game_state_update')), 3000);
      let count = 0;
      attacker.opponentSocket.on('game_state_update', (state: ClientGameState) => {
        count += 1;
        if (count === 2) {
          clearTimeout(timer);
          resolve(state);
        }
      });

      attacker.socket.emit('make_move', { type: 'attack', card: first });
      attacker.socket.emit('make_move', { type: 'attack', card: second });
    });

    expect(secondUpdate.table).toHaveLength(2);
    expect(secondUpdate.opponentCardCount).toBe(0);
  });

  it('keeps the game alive when reconnect arrives late in the grace window, just before it would expire', async () => {
    const GRACE_PERIOD_MS = 300;
    testApp = await createTestApp({ gracePeriodMs: GRACE_PERIOD_MS, roomCleanupTtlMs: 150 });
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');
    const defender = byRole(pair, 'defender');

    const opponentDisconnectedPromise = waitForEvent(defender.socket, 'opponent_disconnected');
    attacker.socket.close();
    await opponentDisconnectedPromise;

    // Reconnect deliberately close to (but before) the grace deadline, to exercise the
    // "does the disconnect timer actually get cleared in time" path rather than the
    // comfortably-early case the other reconnect test already covers.
    await delay(GRACE_PERIOD_MS - 100);

    const reconnected = testApp.createClient();
    await new Promise<void>((resolve) => reconnected.on('connect', () => resolve()));
    const statePromise = waitForEvent<ClientGameState>(reconnected, 'game_state_update');
    reconnected.emit('reconnect', { sessionToken: attacker.match.sessionToken });
    const state = await statePromise;

    expect(state.status.phase).toBe('in_progress');

    // Well past the original grace deadline now — confirm the game was *not* forfeited
    // in the meantime (the reconnect must have cleared the timer, not raced past it).
    await delay(GRACE_PERIOD_MS);
    const room = testApp.gameService.getRoom(pair.roomId);
    expect(room?.gameState.status.phase).toBe('in_progress');
  });
});
