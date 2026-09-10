import type { Card, GameState, PlayerId, Rank, Suit, TableSlot } from './types';

export function card(suit: Suit, rank: Rank): Card {
  return { suit, rank };
}

type Overrides = Partial<{
  attackerId: PlayerId;
  defenderId: PlayerId;
  attackerHand: Card[];
  defenderHand: Card[];
  deck: Card[];
  trumpSuit: Suit;
  trumpCard: Card;
  table: TableSlot[];
  discardCount: number;
}>;

/** Builds a minimal in_progress GameState for unit tests, with sensible defaults. */
export function makeState(overrides: Overrides = {}): GameState {
  const attackerId = overrides.attackerId ?? 'A';
  const defenderId = overrides.defenderId ?? 'B';
  const trumpSuit = overrides.trumpSuit ?? '♠';
  const trumpCard = overrides.trumpCard ?? card(trumpSuit, 6);

  return {
    players: {
      [attackerId]: { hand: overrides.attackerHand ?? [] },
      [defenderId]: { hand: overrides.defenderHand ?? [] },
    },
    deck: overrides.deck ?? [],
    trumpSuit,
    trumpCard,
    table: overrides.table ?? [],
    discardCount: overrides.discardCount ?? 0,
    status: { phase: 'in_progress', attackerId, defenderId },
  };
}
