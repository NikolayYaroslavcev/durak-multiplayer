import type { Card, GameState, Move, PlayerId } from '@game/game-core';
import type { MoveIntent } from '../protocol/schemas';
import type { ErrorCode } from '../protocol/errors';

function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Finds the move in `validMoves` (as returned by game-core's `getValidMoves`) that matches
 * the client's requested intent, comparing every field relevant to each move type — not
 * just `type`. This does not decide legality; it only looks up a move game-core has
 * already deemed legal, so no game rules are duplicated here.
 */
export function findMatchingMove(validMoves: Move[], intent: MoveIntent): Move | undefined {
  return validMoves.find((move) => {
    if (move.type !== intent.type) return false;
    switch (move.type) {
      case 'attack':
        return intent.type === 'attack' && cardsEqual(move.card, intent.card);
      case 'defend':
        return (
          intent.type === 'defend' && cardsEqual(move.card, intent.card) && cardsEqual(move.against, intent.against)
        );
      case 'takeCards':
        return intent.type === 'takeCards';
      case 'endAttack':
        return intent.type === 'endAttack';
    }
  });
}

/**
 * Best-effort human-readable reason for why `intent` was not among the valid moves.
 * This only classifies an already-rejected move for a friendlier client message — it
 * never decides whether a move is legal (that's game-core's `getValidMoves`/`applyMove`).
 */
export function diagnoseRejection(state: GameState, playerId: PlayerId, intent: MoveIntent): ErrorCode {
  if (state.status.phase !== 'in_progress') return 'GAME_FINISHED';

  const { attackerId, defenderId } = state.status;
  const isAttacker = playerId === attackerId;
  const isDefender = playerId === defenderId;
  const hand = state.players[playerId]?.hand ?? [];
  const unresolved = state.table.filter((slot) => !slot.defend);

  if (intent.type === 'attack' || intent.type === 'endAttack') {
    if (!isAttacker) return 'NOT_YOUR_TURN';
  }
  if (intent.type === 'defend' || intent.type === 'takeCards') {
    if (!isDefender) return 'NOT_YOUR_TURN';
  }

  switch (intent.type) {
    case 'attack': {
      if (!hand.some((c) => cardsEqual(c, intent.card))) return 'CARD_NOT_IN_HAND';
      if (state.table.length === 0) return 'INVALID_ATTACK';
      const tableRanks = new Set(state.table.flatMap((s) => [s.attack.rank, ...(s.defend ? [s.defend.rank] : [])]));
      if (!tableRanks.has(intent.card.rank)) return 'INVALID_THROW_IN';
      return 'ATTACK_LIMIT_REACHED';
    }
    case 'defend': {
      if (!hand.some((c) => cardsEqual(c, intent.card))) return 'CARD_NOT_IN_HAND';
      return 'INVALID_DEFENSE';
    }
    case 'takeCards': {
      if (unresolved.length === 0) return 'UNRESOLVED_ATTACK';
      return 'INVALID_DEFENSE';
    }
    case 'endAttack': {
      if (unresolved.length > 0) return 'UNRESOLVED_ATTACK';
      return 'INVALID_ATTACK';
    }
  }
}
