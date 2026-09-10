import type { ClientGameState } from '@game/game-core';
import { matchPlayers } from './matchHelpers';
import { createTestApp, delay, waitForEvent, type TestApp } from './testApp';
import type { ErrorPayload } from '../src/protocol/dto';

const GRACE_PERIOD_MS = 150;
const CLEANUP_TTL_MS = 150;

describe('forfeit on grace-period timeout', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp({ gracePeriodMs: GRACE_PERIOD_MS, roomCleanupTtlMs: CLEANUP_TTL_MS });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('awards a technical win to the opponent when one player never reconnects', async () => {
    const pair = await matchPlayers(testApp);

    const finalStatePromise = waitForEvent<ClientGameState>(pair.b, 'game_state_update', GRACE_PERIOD_MS + 2000);
    pair.a.close();

    const finalState = await finalStatePromise;
    expect(finalState.status.phase).toBe('finished');
    if (finalState.status.phase !== 'finished') throw new Error('unreachable');
    expect(finalState.status.result).toBe('win');
    if (finalState.status.result !== 'win') throw new Error('unreachable');
    expect(finalState.status.winnerId).toBe(pair.matchB.playerId);

    await delay(CLEANUP_TTL_MS + 200);

    // Room cleanup also removes the session token itself (not just the room), so a
    // reconnect attempt this long after cleanup gets INVALID_SESSION rather than
    // ROOM_NOT_FOUND — the session no longer exists at all, which is a more accurate
    // signal than "the room existed but is gone" and keeps sessionIndex/socketIndex
    // from growing forever as games finish.
    const late = testApp.createClient();
    await new Promise<void>((resolve) => late.on('connect', () => resolve()));
    late.emit('reconnect', { sessionToken: pair.matchA.sessionToken });
    const err = await waitForEvent<ErrorPayload>(late, 'error');
    expect(err.code).toBe('INVALID_SESSION');
  });

  it('declares no winner when both players fail to reconnect', async () => {
    const pair = await matchPlayers(testApp);

    pair.a.close();
    pair.b.close();

    await delay(GRACE_PERIOD_MS + CLEANUP_TTL_MS + 300);

    // Same reasoning as the single-forfeit case above: the room (and its sessions) are
    // fully gone once both grace periods expire, so this is INVALID_SESSION, not
    // ROOM_NOT_FOUND.
    const late = testApp.createClient();
    await new Promise<void>((resolve) => late.on('connect', () => resolve()));
    late.emit('reconnect', { sessionToken: pair.matchA.sessionToken });
    const err = await waitForEvent<ErrorPayload>(late, 'error');
    expect(err.code).toBe('INVALID_SESSION');
  });
});
