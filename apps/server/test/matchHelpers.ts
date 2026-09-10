import type { ClientGameState } from '@game/game-core';
import type { Socket as ClientSocket } from 'socket.io-client';
import type { MatchFoundPayload } from '../src/protocol/dto';
import { delay, waitForConnect, waitForEvent, type TestApp } from './testApp';

export type MatchedPair = {
  a: ClientSocket;
  b: ClientSocket;
  matchA: MatchFoundPayload;
  matchB: MatchFoundPayload;
  stateA: ClientGameState;
  stateB: ClientGameState;
  roomId: string;
};

/** Connects two clients and drives them through matchmaking to the initial game state. */
export async function matchPlayers(testApp: TestApp): Promise<MatchedPair> {
  const a = testApp.createClient();
  const b = testApp.createClient();
  await Promise.all([waitForConnect(a), waitForConnect(b)]);

  // Register every listener before triggering anything: match_found and the initial
  // game_state_update are emitted back-to-back by the server, so attaching the second
  // listener only after awaiting the first risks missing an event that already arrived.
  const matchAPromise = waitForEvent<MatchFoundPayload>(a, 'match_found');
  const matchBPromise = waitForEvent<MatchFoundPayload>(b, 'match_found');
  const stateAPromise = waitForEvent<ClientGameState>(a, 'game_state_update');
  const stateBPromise = waitForEvent<ClientGameState>(b, 'game_state_update');

  a.emit('join_queue');
  await delay(20);
  b.emit('join_queue');

  const [matchA, matchB] = await Promise.all([matchAPromise, matchBPromise]);
  const [stateA, stateB] = await Promise.all([stateAPromise, stateBPromise]);

  return { a, b, matchA, matchB, stateA, stateB, roomId: matchA.roomId };
}

export type RoleView = {
  socket: ClientSocket;
  match: MatchFoundPayload;
  state: ClientGameState;
  opponentSocket: ClientSocket;
};

/** The player-role view (client socket + match/state info) for whichever side is currently attacker/defender. */
export function byRole(pair: MatchedPair, role: 'attacker' | 'defender'): RoleView {
  if (pair.stateA.yourTurnRole === role) {
    return { socket: pair.a, match: pair.matchA, state: pair.stateA, opponentSocket: pair.b };
  }
  return { socket: pair.b, match: pair.matchB, state: pair.stateB, opponentSocket: pair.a };
}
