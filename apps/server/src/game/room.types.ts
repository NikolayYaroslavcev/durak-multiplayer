import type { GameState, PlayerId } from '@game/game-core';

export type PlayerSession = {
  playerId: PlayerId;
  sessionToken: string;
  socketId: string | null;
  connected: boolean;
  /** Set while waiting for this player to reconnect after a disconnect. */
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  /** True once this player's grace period has elapsed without a reconnect. */
  expired: boolean;
};

export type GameSession = {
  roomId: string;
  gameState: GameState;
  players: [PlayerSession, PlayerSession];
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};
