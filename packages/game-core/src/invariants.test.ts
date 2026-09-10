import { describe, expect, it } from 'vitest';
import { applyMove, createInitialState, getValidMoves } from './index';
import type { Card, GameState } from './types';

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

/** deck + both hands + table cards + discard must always equal 36. */
function totalCards(state: GameState): number {
  const [p1, p2] = Object.values(state.players);
  const tableCount = state.table.reduce((sum, slot) => sum + (slot.defend ? 2 : 1), 0);
  return state.deck.length + p1.hand.length + p2.hand.length + tableCount + state.discardCount;
}

function allCardKeys(state: GameState): string[] {
  const [p1, p2] = Object.values(state.players);
  const tableCards = state.table.flatMap((slot) => (slot.defend ? [slot.attack, slot.defend] : [slot.attack]));
  return [...state.deck, ...p1.hand, ...p2.hand, ...tableCards].map(cardKey);
}

/** Deterministic bot: always prefers to resolve the table (defend/endAttack) before throwing more,
 * and takes cards only when it cannot defend. Enough to drive a full game to completion. */
function pickMove(state: GameState, playerId: string) {
  const moves = getValidMoves(state, playerId);
  const defend = moves.find((m) => m.type === 'defend');
  if (defend) return defend;
  const endAttack = moves.find((m) => m.type === 'endAttack');
  if (endAttack) return endAttack;
  const attack = moves.find((m) => m.type === 'attack');
  if (attack) return attack;
  const take = moves.find((m) => m.type === 'takeCards');
  if (take) return take;
  return null;
}

describe.each([1, 2, 3, 7, 11, 42, 99, 123])('invariants across a full simulated game (seed %i)', (seed) => {
  it('always keeps 36 cards accounted for, never mutates state, and terminates', () => {
    let state = createInitialState(['A', 'B'], seqRng(seed));
    expect(totalCards(state)).toBe(36);
    expect(new Set(allCardKeys(state)).size).toBe(36);

    let turns = 0;
    const maxTurns = 2000;

    while (state.status.phase === 'in_progress' && turns < maxTurns) {
      const { attackerId, defenderId } = state.status;
      const move = pickMove(state, attackerId) ?? pickMove(state, defenderId);
      if (!move) break;

      const before = JSON.parse(JSON.stringify(state));
      const next = applyMove(state, move);

      // immutability: the pre-move state must be byte-for-byte identical after the call
      expect(state).toEqual(before);

      // deck + hands + table + discardCount must always total 36 ...
      expect(totalCards(next)).toBe(36);
      // ... and no single physical card may appear twice among deck/hands/table
      // (discarded cards are legitimately untracked beyond their count, by design).
      const keys = allCardKeys(next);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.length).toBe(36 - next.discardCount);

      state = next;
      turns++;
    }

    expect(turns).toBeLessThan(maxTurns);
    expect(state.status.phase).toBe('finished');
  });

  it('after every round-ending move, each hand is topped up to at least 6 unless the deck ran out first', () => {
    let state = createInitialState(['A', 'B'], seqRng(seed));
    let turns = 0;

    while (state.status.phase === 'in_progress' && turns < 2000) {
      const { attackerId, defenderId } = state.status;
      const move = pickMove(state, attackerId) ?? pickMove(state, defenderId);
      if (!move) break;
      state = applyMove(state, move);

      if (move.type === 'takeCards' || move.type === 'endAttack') {
        for (const p of Object.values(state.players)) {
          expect(p.hand.length >= 6 || state.deck.length === 0).toBe(true);
        }
      }
      turns++;
    }
  });
});
