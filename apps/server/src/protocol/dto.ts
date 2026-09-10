import type { ClientGameState } from '@game/game-core';
import type { ErrorCode } from './errors';

export type MatchFoundPayload = {
  roomId: string;
  sessionToken: string;
  playerId: string;
};

export type GameStateUpdatePayload = ClientGameState;

export type MoveRejectedPayload = {
  code: ErrorCode;
  message: string;
};

export type ErrorPayload = {
  code: ErrorCode;
  message: string;
};

export type OpponentEventPayload = Record<string, never>;
