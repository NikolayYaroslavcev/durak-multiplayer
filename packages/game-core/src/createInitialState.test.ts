import { describe, expect, it } from 'vitest';
import { createInitialState } from './index';
import type { Card } from './types';

// deterministic rng: cycles through a fixed sequence in [0, 1)
function seqRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function cardKey(card: Card): string {
  return `${card.suit}${card.rank}`;
}

describe('createInitialState', () => {
  it('creates a 36-card deck total across deck + hands, with no duplicates', () => {
    const state = createInitialState(['A', 'B'], seqRng(1));

    const all: Card[] = [...state.players['A'].hand, ...state.players['B'].hand, ...state.deck];

    expect(all).toHaveLength(36);
    const keys = all.map(cardKey);
    expect(new Set(keys).size).toBe(36);
  });

  it('deals exactly 6 cards to each player', () => {
    const state = createInitialState(['A', 'B'], seqRng(2));

    expect(state.players['A'].hand).toHaveLength(6);
    expect(state.players['B'].hand).toHaveLength(6);
  });

  it('determines a trump suit and a visible trump card of that suit', () => {
    const state = createInitialState(['A', 'B'], seqRng(3));

    expect(state.trumpCard.suit).toBe(state.trumpSuit);
    expect(state.deck.some((c) => cardKey(c) === cardKey(state.trumpCard))).toBe(true);
  });

  it('is deterministic for a given rng', () => {
    const s1 = createInitialState(['A', 'B'], seqRng(42));
    const s2 = createInitialState(['A', 'B'], seqRng(42));

    expect(s1.players['A'].hand).toEqual(s2.players['A'].hand);
    expect(s1.players['B'].hand).toEqual(s2.players['B'].hand);
    expect(s1.trumpCard).toEqual(s2.trumpCard);
  });

  it('starts in_progress with two distinct player roles', () => {
    const state = createInitialState(['A', 'B'], seqRng(4));

    expect(state.status.phase).toBe('in_progress');
    if (state.status.phase === 'in_progress') {
      expect([state.status.attackerId, state.status.defenderId].sort()).toEqual(['A', 'B']);
      expect(state.status.attackerId).not.toBe(state.status.defenderId);
    }
  });

  it('starts with an empty table and zero discard', () => {
    const state = createInitialState(['A', 'B'], seqRng(5));

    expect(state.table).toEqual([]);
    expect(state.discardCount).toBe(0);
  });
});
