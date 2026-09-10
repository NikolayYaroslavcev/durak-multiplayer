import { describe, expect, it } from 'vitest';
import { applyMove } from './index';
import { card, makeState } from './testUtils';

describe('applyMove — endAttack', () => {
  it('rejects endAttack while there is an undefended attack on the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      table: [{ attack: card('♥', 6) }],
    });

    expect(() => applyMove(state, { type: 'endAttack', playerId: 'A' })).toThrow();
  });

  it('sends all table cards to discard and clears the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 8)],
      defenderHand: [card('♣', 9)],
      table: [
        { attack: card('♥', 6), defend: card('♥', 9) },
        { attack: card('♦', 6), defend: card('♦', 9) },
      ],
      discardCount: 2,
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    expect(next.table).toEqual([]);
    expect(next.discardCount).toBe(6);
  });

  it('swaps attacker and defender roles for the next round', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 8)],
      defenderHand: [card('♣', 9)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    expect(next.status).toMatchObject({ phase: 'in_progress', attackerId: 'B', defenderId: 'A' });
  });

  it('draws the new attacker up to 6 first, then the new defender', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 8)],
      defenderHand: [],
      deck: [card('♦', 6), card('♦', 7)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const next = applyMove(state, { type: 'endAttack', playerId: 'A' });

    // new attacker is B (was defender, had 0 cards) — gets both deck cards first
    expect(next.players['B'].hand).toEqual([card('♦', 6), card('♦', 7)]);
    // new defender is A (was attacker, had 1 card, deck now empty) — draws nothing
    expect(next.players['A'].hand).toEqual([card('♣', 8)]);
    expect(next.deck).toEqual([]);
  });

  it('rejects endAttack from the defender', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    expect(() => applyMove(state, { type: 'endAttack', playerId: 'B' })).toThrow();
  });
});
