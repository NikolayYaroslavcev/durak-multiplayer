import type { ClientGameState } from '@game/game-core';
import type { MatchFoundPayload } from '../src/protocol/dto';
import { byRole, matchPlayers } from './matchHelpers';
import { createTestApp, delay, waitForConnect, waitForEvent, type TestApp } from './testApp';

describe('matchmaking', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('pairs two queued players into exactly one room', async () => {
    const createRoomSpy = jest.spyOn(testApp.gameService, 'createRoom');

    const a = testApp.createClient();
    const b = testApp.createClient();
    await Promise.all([waitForConnect(a), waitForConnect(b)]);

    const matchAPromise = waitForEvent<MatchFoundPayload>(a, 'match_found');
    const matchBPromise = waitForEvent<MatchFoundPayload>(b, 'match_found');
    const stateAPromise = waitForEvent<ClientGameState>(a, 'game_state_update');
    const stateBPromise = waitForEvent<ClientGameState>(b, 'game_state_update');

    a.emit('join_queue');
    // give the server a tick to process A before B arrives, matching the plan's "one waits" flow
    await delay(20);
    b.emit('join_queue');

    const [matchA, matchB] = await Promise.all([matchAPromise, matchBPromise]);

    expect(matchA.roomId).toBe(matchB.roomId);
    expect(matchA.playerId).not.toBe(matchB.playerId);
    expect(matchA.sessionToken).not.toBe(matchB.sessionToken);
    expect(matchA.sessionToken.length).toBeGreaterThanOrEqual(16);

    expect(createRoomSpy).toHaveBeenCalledTimes(1);

    const [stateA, stateB] = await Promise.all([stateAPromise, stateBPromise]);
    expect(stateA.yourHand).toHaveLength(6);
    expect(stateB.yourHand).toHaveLength(6);
    expect(stateA.status.phase).toBe('in_progress');
  });

  it('ignores a leave_queue that arrives right after the player was already matched', async () => {
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');

    // Simulates the client's "cancel search" click racing with the server already having
    // matched it a moment earlier — leaveQueue() must be a safe no-op here, not something
    // that tears down the room that was just created.
    pair.a.emit('leave_queue');

    const updatePromise = waitForEvent<ClientGameState>(attacker.opponentSocket, 'game_state_update');
    attacker.socket.emit('make_move', { type: 'attack', card: attacker.state.yourHand[0] });
    const updated = await updatePromise;

    expect(updated.table).toHaveLength(1);
    expect(testApp.gameService.getRoom(pair.roomId)).toBeDefined();
  });

  it('does not match a player who already left the queue', async () => {
    const a = testApp.createClient();
    const b = testApp.createClient();
    await Promise.all([waitForConnect(a), waitForConnect(b)]);

    a.emit('join_queue');
    await delay(20);
    a.emit('leave_queue');
    await delay(20);
    b.emit('join_queue');

    const raced = await Promise.race([
      waitForEvent(b, 'match_found', 5000)
        .then(() => 'matched' as const)
        .catch(() => 'never' as const),
      delay(300).then(() => 'timeout' as const),
    ]);

    expect(raced).toBe('timeout');
  });
});
