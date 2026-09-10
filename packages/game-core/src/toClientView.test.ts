import { describe, expect, it } from 'vitest';
import { toClientView } from './index';
import { card, makeState } from './testUtils';

describe('toClientView', () => {
  it("exposes the requesting player's own hand in full", () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 6), card('♦', 10)],
    });

    const view = toClientView(state, 'A');
    expect(view.yourHand).toEqual([card('♥', 6), card('♦', 10)]);
  });

  it("replaces the opponent's hand with only a count, never leaking the actual cards", () => {
    // Cards below are unique to each side's hand — none appear in trump or table,
    // so any trace of them in the opponent's view must have leaked from the hidden hand.
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      attackerHand: [card('♥', 11), card('♦', 12)],
      defenderHand: [card('♠', 13), card('♣', 14), card('♣', 8)],
      trumpCard: card('♦', 6),
      table: [{ attack: card('♥', 7) }],
    });

    const viewA = toClientView(state, 'A');
    expect(viewA.opponentCardCount).toBe(3);
    const serializedA = JSON.stringify(viewA);
    for (const c of state.players['B'].hand) {
      expect(serializedA).not.toContain(JSON.stringify(c));
    }

    const viewB = toClientView(state, 'B');
    expect(viewB.opponentCardCount).toBe(2);
    const serializedB = JSON.stringify(viewB);
    for (const c of state.players['A'].hand) {
      expect(serializedB).not.toContain(JSON.stringify(c));
    }
  });

  it('never reveals deck card order, only deckCount', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      deck: [card('♦', 6), card('♦', 7), card('♦', 8)],
    });

    const view = toClientView(state, 'A');
    expect(view.deckCount).toBe(3);
    expect((view as unknown as Record<string, unknown>).deck).toBeUndefined();
  });

  it('exposes the trump card and the table to both players', () => {
    const state = makeState({
      attackerId: 'A',
      defenderId: 'B',
      trumpCard: card('♠', 6),
      table: [{ attack: card('♥', 7), defend: card('♥', 10) }],
    });

    const view = toClientView(state, 'A');
    expect(view.trumpCard).toEqual(card('♠', 6));
    expect(view.table).toEqual([{ attack: card('♥', 7), defend: card('♥', 10) }]);
  });

  it("reports the requesting player's role", () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });

    expect(toClientView(state, 'A').yourTurnRole).toBe('attacker');
    expect(toClientView(state, 'B').yourTurnRole).toBe('defender');
  });

  it('reports a null role once the game has finished', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });
    const finished = {
      ...state,
      status: { phase: 'finished' as const, result: 'win' as const, winnerId: 'A' },
    };

    expect(toClientView(finished, 'A').yourTurnRole).toBeNull();
    expect(toClientView(finished, 'B').yourTurnRole).toBeNull();
  });

  it('passes through the game status', () => {
    const state = makeState({ attackerId: 'A', defenderId: 'B' });

    expect(toClientView(state, 'A').status).toEqual(state.status);
  });
});
