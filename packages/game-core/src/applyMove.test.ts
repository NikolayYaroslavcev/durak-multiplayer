import { describe, expect, it } from 'vitest';
import { applyMove, InvalidMoveError } from './index';
import { card, makeState } from './testUtils';

describe('applyMove — attack', () => {
  it('moves the attacked card from hand onto the table', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6), card('♦', 10)],
    });

    const next = applyMove(state, { type: 'attack', playerId: 'A', card: card('♥', 6) });

    expect(next.players['A'].hand).toEqual([card('♦', 10)]);
    expect(next.table).toEqual([{ attack: card('♥', 6) }]);
  });

  it('does not mutate the input state', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6)],
    });
    const before = JSON.parse(JSON.stringify(state));

    applyMove(state, { type: 'attack', playerId: 'A', card: card('♥', 6) });

    expect(state).toEqual(before);
  });

  it('rejects an attack from a card not in hand', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6)],
    });

    expect(() => applyMove(state, { type: 'attack', playerId: 'A', card: card('♦', 10) })).toThrow(InvalidMoveError);
  });

  it('rejects an attack from the defender (not their turn)', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 6)],
    });

    expect(() => applyMove(state, { type: 'attack', playerId: 'B', card: card('♥', 6) })).toThrow(InvalidMoveError);
  });

  it('rejects any move once the game is finished', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });
    const finished = {
      ...state,
      status: { phase: 'finished' as const, result: 'win' as const, winnerId: 'A' },
    };

    expect(() => applyMove(finished, { type: 'attack', playerId: 'A', card: card('♥', 6) })).toThrow(InvalidMoveError);
  });
});

describe('applyMove — defend', () => {
  it('attaches the defending card to the matching table slot and removes it from hand', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 9), card('♦', 7)],
      table: [{ attack: card('♥', 6) }],
    });

    const next = applyMove(state, {
      type: 'defend',
      playerId: 'B',
      card: card('♥', 9),
      against: card('♥', 6),
    });

    expect(next.table).toEqual([{ attack: card('♥', 6), defend: card('♥', 9) }]);
    expect(next.players['B'].hand).toEqual([card('♦', 7)]);
  });

  it('rejects defending with a card that cannot beat the attack', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 6)],
      table: [{ attack: card('♥', 9) }],
    });

    expect(() =>
      applyMove(state, { type: 'defend', playerId: 'B', card: card('♥', 6), against: card('♥', 9) }),
    ).toThrow(InvalidMoveError);
  });

  it('rejects defending with a card not in hand', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [],
      table: [{ attack: card('♥', 6) }],
    });

    expect(() =>
      applyMove(state, { type: 'defend', playerId: 'B', card: card('♥', 9), against: card('♥', 6) }),
    ).toThrow(InvalidMoveError);
  });
});
