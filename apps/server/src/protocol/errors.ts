/**
 * Stable reason codes sent to clients. Not exhaustive — extend as needed.
 * Never include stack traces or server-internal details in client-facing payloads.
 */
export type ErrorCode =
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'INVALID_DEFENSE'
  | 'INVALID_ATTACK'
  | 'INVALID_THROW_IN'
  | 'ATTACK_LIMIT_REACHED'
  | 'UNRESOLVED_ATTACK'
  | 'GAME_FINISHED'
  | 'ROOM_NOT_FOUND'
  | 'NOT_IN_ROOM'
  | 'INVALID_SESSION'
  | 'MALFORMED_PAYLOAD'
  | 'ALREADY_IN_QUEUE';
