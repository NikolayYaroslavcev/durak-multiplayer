import { describe, expect, it } from 'vitest';
import { applyMove } from './index';
import { card, makeState } from './testUtils';

describe('applyMove — takeCards', () => {
  it('moves all table cards into the defender hand and clears the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♦', 7)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }, { attack: card('♣', 6) }],
    });

    const next = applyMove(state, { type: 'takeCards', playerId: 'B' });

    expect(next.table).toEqual([]);
    expect(next.players['B'].hand).toEqual(
      expect.arrayContaining([card('♦', 7), card('♥', 6), card('♥', 9), card('♣', 6)]),
    );
    expect(next.players['B'].hand).toHaveLength(4);
  });

  it('keeps the same attacker/defender roles for the next round', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 8)],
      table: [{ attack: card('♥', 6) }],
    });

    const next = applyMove(state, { type: 'takeCards', playerId: 'B' });

    expect(next.status).toMatchObject({ phase: 'in_progress', attackerId: 'A', defenderId: 'B' });
  });

  it('rejects takeCards when the table has no undefended attack', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    expect(() => applyMove(state, { type: 'takeCards', playerId: 'B' })).toThrow();
  });

  it('draws both players up to 6 cards after takeCards, attacker first', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 8), card('♣', 9)],
      defenderHand: [],
      deck: [
        card('♦', 6),
        card('♦', 7),
        card('♦', 8),
        card('♦', 9),
        card('♦', 10),
        card('♦', 11),
        card('♦', 12),
        card('♦', 13),
        card('♦', 14),
      ],
      table: [{ attack: card('♥', 6) }],
    });

    const next = applyMove(state, { type: 'takeCards', playerId: 'B' });

    expect(next.players['A'].hand).toHaveLength(6);
    // defender took 1 table card, then draws from what's left of the deck up to 6
    expect(next.players['B'].hand).toHaveLength(6);
    expect(next.deck).toHaveLength(0);
  });

  it('is a pure function that does not mutate the input state', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♦', 7)],
      table: [{ attack: card('♥', 6) }],
    });
    const before = JSON.parse(JSON.stringify(state));

    applyMove(state, { type: 'takeCards', playerId: 'B' });

    expect(state).toEqual(before);
  });
});
