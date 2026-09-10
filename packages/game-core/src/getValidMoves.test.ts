import { describe, expect, it } from 'vitest';
import { getValidMoves } from './index';
import { card, makeState } from './testUtils';

describe('getValidMoves', () => {
  it('returns no moves for the player not on turn to act as attacker when table is empty', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6)],
      defenderHand: [card('♥', 7)],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves).toEqual([]);
  });

  it('lets the attacker attack with any card from hand when table is empty', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6), card('♦', 10)],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves).toContainEqual({ type: 'attack', playerId: 'A', card: card('♥', 6) });
    expect(moves).toContainEqual({ type: 'attack', playerId: 'A', card: card('♦', 10) });
    expect(moves).toHaveLength(2);
  });

  it('lets the defender defend with a higher card of the same suit', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 9), card('♦', 6)],
      table: [{ attack: card('♥', 6) }],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves).toContainEqual({
      type: 'defend',
      playerId: 'B',
      card: card('♥', 9),
      against: card('♥', 6),
    });
  });

  it('does not offer a lower same-suit card as a valid defend', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 6)],
      table: [{ attack: card('♥', 9) }],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves.filter((m) => m.type === 'defend')).toEqual([]);
  });

  it('lets a trump beat a non-trump attack card', () => {
    const state = makeState({
      trumpSuit: '♠',
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♠', 6)],
      table: [{ attack: card('♥', 14) }],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves).toContainEqual({
      type: 'defend',
      playerId: 'B',
      card: card('♠', 6),
      against: card('♥', 14),
    });
  });

  it('does not let a non-trump beat a trump attack card', () => {
    const state = makeState({
      trumpSuit: '♠',
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 14)],
      table: [{ attack: card('♠', 6) }],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves.filter((m) => m.type === 'defend')).toEqual([]);
  });

  it('offers takeCards to the defender whenever there is an undefended attack', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      defenderHand: [card('♥', 9)],
      table: [{ attack: card('♥', 6) }],
    });

    const moves = getValidMoves(state, 'B');
    expect(moves).toContainEqual({ type: 'takeCards', playerId: 'B' });
  });

  it('does not offer endAttack to the attacker while an attack is undefended', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      table: [{ attack: card('♥', 6) }],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves.filter((m) => m.type === 'endAttack')).toEqual([]);
  });

  it('offers endAttack to the attacker once the table is fully defended', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      table: [{ attack: card('♥', 6), defend: card('♥', 9) }],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves).toContainEqual({ type: 'endAttack', playerId: 'A' });
  });

  it('rejects a card the player does not hold', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6)],
    });

    const moves = getValidMoves(state, 'A');
    expect(moves).not.toContainEqual({ type: 'attack', playerId: 'A', card: card('♦', 10) });
  });

  it('returns no moves once the game is finished', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });
    const finished = { ...state, status: { phase: 'finished' as const, result: 'win' as const, winnerId: 'A' } };

    expect(getValidMoves(finished, 'A')).toEqual([]);
    expect(getValidMoves(finished, 'B')).toEqual([]);
  });
});
