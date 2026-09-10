/**
 * Client-side mirror of the Socket.IO wire contract owned by
 * `apps/server/src/protocol`. `apps/web` cannot import from `apps/server`
 * (only `@game/game-core` is a shared package), so the event names and
 * payload shapes are duplicated here deliberately — this file must stay in
 * sync with the server's protocol by hand, not by import.
 */
import type { Card, ClientGameState } from '@game/game-core';

/**
 * Mirrors the server's `MoveIntent` (apps/server/src/protocol/schemas.ts) for the same
 * reason as the rest of this file: apps/web cannot import from apps/server. This describes
 * only the wire shape of an intent — legality is decided exclusively by the server.
 */
export type MoveIntent =
  | { type: 'attack'; card: Card }
  | { type: 'defend'; card: Card; against: Card }
  | { type: 'takeCards' }
  | { type: 'endAttack' };

export const SOCKET_EVENTS = {
  JOIN_QUEUE: 'join_queue',
  LEAVE_QUEUE: 'leave_queue',
  MATCH_FOUND: 'match_found',
  MAKE_MOVE: 'make_move',
  GAME_STATE_UPDATE: 'game_state_update',
  RECONNECT: 'reconnect',
  OPPONENT_DISCONNECTED: 'opponent_disconnected',
  OPPONENT_RECONNECTED: 'opponent_reconnected',
  ERROR: 'error',
  MOVE_REJECTED: 'move_rejected',
} as const;

export type MatchFoundPayload = {
  roomId: string;
  sessionToken: string;
  playerId: string;
};

export type GameStateUpdatePayload = ClientGameState;

export type MoveRejectedPayload = {
  code: string;
  message: string;
};

export type ErrorPayload = {
  code: string;
  message: string;
};

export type ReconnectPayload = {
  sessionToken: string;
};
