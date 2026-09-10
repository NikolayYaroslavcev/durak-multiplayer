import { canBeat } from './rules';
import type { GameState, Move, PlayerId } from './types';

const MAX_TABLE_ATTACKS = 6;

function unresolvedSlots(state: GameState) {
  return state.table.filter((slot) => !slot.defend);
}

/** Number of attack cards allowed on the table this round: min(6, defender's hand size at round start). */
function attackLimit(state: GameState, defenderId: PlayerId): number {
  const defendedCount = state.table.filter((slot) => slot.defend).length;
  const defenderStartHandSize = state.players[defenderId].hand.length + defendedCount;
  return Math.min(MAX_TABLE_ATTACKS, defenderStartHandSize);
}

export function getValidMoves(state: GameState, playerId: PlayerId): Move[] {
  if (state.status.phase !== 'in_progress') return [];

  const { attackerId, defenderId } = state.status;
  if (playerId !== attackerId && playerId !== defenderId) return [];

  const moves: Move[] = [];

  if (playerId === attackerId) {
    const hand = state.players[attackerId].hand;
    const tableRanks = new Set(
      state.table.flatMap((slot) => [slot.attack.rank, ...(slot.defend ? [slot.defend.rank] : [])]),
    );
    const canAddAttack = state.table.length < attackLimit(state, defenderId);

    if (state.table.length === 0) {
      for (const c of hand) {
        moves.push({ type: 'attack', playerId, card: c });
      }
    } else if (canAddAttack) {
      for (const c of hand) {
        if (tableRanks.has(c.rank)) {
          moves.push({ type: 'attack', playerId, card: c });
        }
      }
    }

    if (state.table.length > 0 && unresolvedSlots(state).length === 0) {
      moves.push({ type: 'endAttack', playerId });
    }
  }

  if (playerId === defenderId) {
    const hand = state.players[defenderId].hand;
    const unresolved = unresolvedSlots(state);

    for (const slot of unresolved) {
      for (const c of hand) {
        if (canBeat(c, slot.attack, state.trumpSuit)) {
          moves.push({ type: 'defend', playerId, card: c, against: slot.attack });
        }
      }
    }

    if (unresolved.length > 0) {
      moves.push({ type: 'takeCards', playerId });
    }
  }

  return moves;
}
