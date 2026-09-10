import { describe, expect, it } from 'vitest';
import { getValidMoves } from './index';
import { card, makeState } from './testUtils';

describe('getValidMoves — throw-in (подкидывание) limits', () => {
  it('allows throwing in a rank already present on the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♦', 6)],
      defenderHand: [card('♥', 10), card('♦', 10), card('♣', 10), card('♠', 10)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves).toContainEqual({ type: 'attack', playerId: 'A', card: card('♦', 6) });
  });

  it('forbids throwing in a rank absent from the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♦', 7)],
      defenderHand: [card('♥', 10), card('♦', 10), card('♣', 10), card('♠', 10)],
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves.filter((m) => m.type === 'attack')).toEqual([]);
  });

  it('forbids exceeding the 6 attack cards per round limit even with a matching rank', () => {
    const table = Array.from({ length: 6 }, () => ({
      attack: card('♥', 6),
      defend: card('♦', 6),
    }));
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 6)],
      defenderHand: Array.from({ length: 6 }, () => card('♠', 7)),
      table,
    });

    const moves = getValidMoves(state, 'A');
    expect(moves.filter((m) => m.type === 'attack')).toEqual([]);
  });

  it('forbids throwing in more cards than the defender held at the start of the round', () => {
    // defender started the round with exactly 1 card, already spent defending the sole
    // attack slot (0 left in hand). table.length (1) already equals that start size.
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♣', 6)],
      defenderHand: [],
      table: [{ attack: card('♥', 6), defend: card('♦', 6) }],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves.filter((m) => m.type === 'attack')).toEqual([]);
  });
});
