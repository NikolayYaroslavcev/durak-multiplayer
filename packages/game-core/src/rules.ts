import type { Card, Suit } from './types';

export function isTrump(card: Card, trumpSuit: Suit): boolean {
  return card.suit === trumpSuit;
}

/** Can `defendCard` beat `attackCard` under standard durak rules? */
export function canBeat(defendCard: Card, attackCard: Card, trumpSuit: Suit): boolean {
  if (defendCard.suit === attackCard.suit) {
    return defendCard.rank > attackCard.rank;
  }
  return isTrump(defendCard, trumpSuit) && !isTrump(attackCard, trumpSuit);
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
