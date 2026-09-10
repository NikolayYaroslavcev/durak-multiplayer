import { getValidMoves } from './moves';
import { cardsEqual } from './rules';
import { drawUpTo6 } from './state';
import type { Card, GameState, GameStatus, Move, PlayerId } from './types';

export class InvalidMoveError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid move: ${reason}`);
    this.reason = reason;
    this.name = 'InvalidMoveError';
  }
}

function movesEqual(a: Move, b: Move): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;
  switch (a.type) {
    case 'attack':
      return b.type === 'attack' && cardsEqual(a.card, b.card);
    case 'defend':
      return b.type === 'defend' && cardsEqual(a.card, b.card) && cardsEqual(a.against, b.against);
    case 'takeCards':
      return b.type === 'takeCards';
    case 'endAttack':
      return b.type === 'endAttack';
  }
}

/** Defense-in-depth: even though callers are expected to only submit moves from getValidMoves,
 *  applyMove independently re-derives the legal moves and rejects anything not among them. */
function assertValid(state: GameState, move: Move): void {
  const valid = getValidMoves(state, move.playerId);
  if (!valid.some((v) => movesEqual(v, move))) {
    throw new InvalidMoveError(`"${move.type}" is not a legal move for ${move.playerId} in the current state`);
  }
}

export function applyMove(state: GameState, move: Move): GameState {
  assertValid(state, move);

  switch (move.type) {
    case 'attack':
      return applyAttack(state, move);
    case 'defend':
      return applyDefend(state, move);
    case 'takeCards':
      return applyTakeCards(state, move);
    case 'endAttack':
      return applyEndAttack(state);
  }
}

function tableCards(state: GameState): Card[] {
  return state.table.flatMap((slot) => (slot.defend ? [slot.attack, slot.defend] : [slot.attack]));
}

/** Win/draw is only decided once the deck is empty and someone's hand is too — checked after each round's draw phase. */
function computeStatus(
  attackerId: PlayerId,
  defenderId: PlayerId,
  players: GameState['players'],
  deck: readonly Card[],
): GameStatus {
  const attackerEmpty = players[attackerId].hand.length === 0;
  const defenderEmpty = players[defenderId].hand.length === 0;
  const deckEmpty = deck.length === 0;

  if (deckEmpty && attackerEmpty && defenderEmpty) return { phase: 'finished', result: 'draw' };
  if (deckEmpty && attackerEmpty) return { phase: 'finished', result: 'win', winnerId: attackerId };
  if (deckEmpty && defenderEmpty) return { phase: 'finished', result: 'win', winnerId: defenderId };
  return { phase: 'in_progress', attackerId, defenderId };
}

/** Draws the next round's attacker up to 6 first, then its defender, from the given deck. */
function drawRound(
  attackerId: PlayerId,
  attackerHand: readonly Card[],
  defenderId: PlayerId,
  defenderHand: readonly Card[],
  deck: readonly Card[],
): { players: GameState['players']; deck: Card[] } {
  const attackerDraw = drawUpTo6(attackerHand, deck);
  const defenderDraw = drawUpTo6(defenderHand, attackerDraw.deck);
  return {
    players: {
      [attackerId]: { hand: attackerDraw.hand },
      [defenderId]: { hand: defenderDraw.hand },
    },
    deck: defenderDraw.deck,
  };
}

function applyAttack(state: GameState, move: Extract<Move, { type: 'attack' }>): GameState {
  const hand = state.players[move.playerId].hand;
  return {
    ...state,
    players: {
      ...state.players,
      [move.playerId]: { hand: hand.filter((c) => !cardsEqual(c, move.card)) },
    },
    table: [...state.table, { attack: move.card }],
  };
}

function applyDefend(state: GameState, move: Extract<Move, { type: 'defend' }>): GameState {
  const hand = state.players[move.playerId].hand;
  const table = state.table.map((slot) =>
    !slot.defend && cardsEqual(slot.attack, move.against) ? { ...slot, defend: move.card } : slot,
  );

  return {
    ...state,
    players: {
      ...state.players,
      [move.playerId]: { hand: hand.filter((c) => !cardsEqual(c, move.card)) },
    },
    table,
  };
}

function applyTakeCards(state: GameState, _move: Extract<Move, { type: 'takeCards' }>): GameState {
  if (state.status.phase !== 'in_progress') throw new InvalidMoveError('game is finished');
  const { attackerId, defenderId } = state.status;

  const defenderHandAfterTake = [...state.players[defenderId].hand, ...tableCards(state)];
  const { players, deck } = drawRound(
    attackerId,
    state.players[attackerId].hand,
    defenderId,
    defenderHandAfterTake,
    state.deck,
  );

  return {
    ...state,
    players,
    deck,
    table: [],
    status: computeStatus(attackerId, defenderId, players, deck),
  };
}

function applyEndAttack(state: GameState): GameState {
  if (state.status.phase !== 'in_progress') throw new InvalidMoveError('game is finished');
  const { attackerId: prevAttackerId, defenderId: prevDefenderId } = state.status;
  const discarded = tableCards(state).length;

  // roles swap: the defender who just finished defending attacks next round
  const nextAttackerId = prevDefenderId;
  const nextDefenderId = prevAttackerId;

  const { players, deck } = drawRound(
    nextAttackerId,
    state.players[nextAttackerId].hand,
    nextDefenderId,
    state.players[nextDefenderId].hand,
    state.deck,
  );

  return {
    ...state,
    players,
    deck,
    table: [],
    discardCount: state.discardCount + discarded,
    status: computeStatus(nextAttackerId, nextDefenderId, players, deck),
  };
}
