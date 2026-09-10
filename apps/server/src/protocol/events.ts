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
