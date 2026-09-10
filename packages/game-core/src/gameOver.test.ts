import { describe, expect, it } from 'vitest';
import { applyMove, getValidMoves } from './index';
import { card, makeState } from './testUtils';

describe('game over', () => {
  it('declares the attacker the winner when they empty their hand via endAttack with an empty deck', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [],
      defenderHand: [card('♣', 9)],
      deck: [],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    // roles swap on endAttack: A becomes defender next round, but A already has 0 cards
    // and the deck is empty, so A wins immediately regardless of role.
    expect(next.status).toEqual({ phase: 'finished', result: 'win', winnerId: 'A' });
  });

  it('declares a draw when both players empty their hands in the same round with an empty deck', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [],
      defenderHand: [],
      deck: [],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    expect(next.status).toEqual({ phase: 'finished', result: 'draw' });
  });

  it('does not end the game while the deck can still refill hands', () => {
    // endAttack swaps roles: B (1 card) attacks next and needs 5 to reach 6,
    // A (0 cards) defends next. A 6-card deck leaves exactly 1 card for A —
    // not a full hand, but nonempty, so the game must not end yet.
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [],
      defenderHand: [card('♣', 9)],
      deck: [card('♦', 6), card('♦', 7), card('♦', 8), card('♦', 9), card('♦', 10), card('♦', 11)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    expect(next.status.phase).toBe('in_progress');
    expect(next.players['A'].hand).toHaveLength(1);
  });

  it('rejects any move once the game has finished', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });
    const finished = {
      ...state,
      status: { phase: 'finished' as const, result: 'win' as const, winnerId: 'A' },
    };

    expect(() => applyMove(finished, { type: 'takeCards', playerId: 'B' })).toThrow();
  });

  it('offers no valid moves to either player once the game has finished', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });
    const finished = {
      ...state,
      status: { phase: 'finished' as const, result: 'draw' as const },
    };

    expect(getValidMoves(finished, 'A')).toEqual([]);
    expect(getValidMoves(finished, 'B')).toEqual([]);
  });
});
