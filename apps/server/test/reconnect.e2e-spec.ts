import type { ClientGameState } from '@game/game-core';
import { byRole, matchPlayers } from './matchHelpers';
import { createTestApp, waitForConnect, waitForEvent, type TestApp } from './testApp';
import type { ErrorPayload } from '../src/protocol/dto';

describe('disconnect / reconnect', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('full flow: disconnect -> opponent notified -> reconnect with fresh state -> opponent notified -> game continues', async () => {
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');
    const defender = byRole(pair, 'defender');

    const openingCard = attacker.state.yourHand[0];
    attacker.socket.emit('make_move', { type: 'attack', card: openingCard });
    await waitForEvent(defender.socket, 'game_state_update');

    const opponentDisconnectedPromise = waitForEvent(defender.socket, 'opponent_disconnected');
    attacker.socket.close();
    await opponentDisconnectedPromise;

    const reconnected = testApp.createClient();
    await waitForConnect(reconnected);

    const opponentReconnectedPromise = waitForEvent(defender.socket, 'opponent_reconnected');
    const statePromise = waitForEvent<ClientGameState>(reconnected, 'game_state_update');
    reconnected.emit('reconnect', { sessionToken: attacker.match.sessionToken });

    const [state] = await Promise.all([statePromise, opponentReconnectedPromise]);
    expect(state.status.phase).toBe('in_progress');
    expect(state.yourHand).toHaveLength(5); // one card already spent on the opening attack
    expect(state.table).toHaveLength(1);

    // game keeps going after reconnect
    const nextUpdatePromise = waitForEvent<ClientGameState>(defender.socket, 'game_state_update');
    defender.socket.emit('make_move', { type: 'takeCards' });
    const afterTake = await nextUpdatePromise;
    expect(afterTake.table).toHaveLength(0);
  });

  it('rejects reconnect with an unknown session token', async () => {
    const socket = testApp.createClient();
    await waitForConnect(socket);

    socket.emit('reconnect', { sessionToken: 'f'.repeat(64) });
    const err = await waitForEvent<ErrorPayload>(socket, 'error');
    expect(err.code).toBe('INVALID_SESSION');
  });

  it('rejects a malformed reconnect payload', async () => {
    const socket = testApp.createClient();
    await waitForConnect(socket);

    socket.emit('reconnect', { token: 'wrong-field-name' });
    const err = await waitForEvent<ErrorPayload>(socket, 'error');
    expect(err.code).toBe('MALFORMED_PAYLOAD');
  });

  it('treats a second connection for the same player as reconnect, without duplicating the room', async () => {
    const pair = await matchPlayers(testApp);
    const attacker = byRole(pair, 'attacker');
    const defender = byRole(pair, 'defender');

    // NOTE: attacker.socket ("old") is deliberately left open — this simulates a second tab
    // connecting before the first one has disconnected.
    const duplicate = testApp.createClient();
    await waitForConnect(duplicate);

    const oldSocketDisconnected = waitForEvent(attacker.socket, 'disconnect');
    const newStatePromise = waitForEvent<ClientGameState>(duplicate, 'game_state_update');
    duplicate.emit('reconnect', { sessionToken: attacker.match.sessionToken });

    const newState = await newStatePromise;
    expect(newState.yourHand).toHaveLength(6);
    await oldSocketDisconnected;

    const room = testApp.gameService.getRoom(pair.roomId);
    expect(room?.players).toHaveLength(2);

    // the new connection is now the only valid one for this player
    const movePromise = waitForEvent<ClientGameState>(defender.socket, 'game_state_update');
    duplicate.emit('make_move', { type: 'attack', card: newState.yourHand[0] });
    await movePromise;
  });
});
