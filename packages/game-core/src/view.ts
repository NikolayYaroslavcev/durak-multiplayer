import { getOpponentId } from './state';
import type { ClientGameState, GameState, PlayerId } from './types';

export function toClientView(state: GameState, playerId: PlayerId): ClientGameState {
  const opponentId = getOpponentId(state, playerId);

  const yourTurnRole =
    state.status.phase === 'in_progress' ? (state.status.attackerId === playerId ? 'attacker' : 'defender') : null;

  return {
    yourHand: [...state.players[playerId].hand],
    opponentCardCount: state.players[opponentId].hand.length,
    deckCount: state.deck.length,
    trumpCard: state.trumpCard,
    table: state.table.map((slot) => ({ ...slot })),
    status: state.status,
    yourTurnRole,
  };
}
