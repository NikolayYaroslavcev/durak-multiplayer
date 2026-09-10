import type { Card } from '@game/game-core';
import { matchPlayers } from './matchHelpers';
import { createTestApp, type TestApp } from './testApp';

/** Recursively scans a payload for any `{suit, rank}` object matching one of `forbiddenCards`. */
function findLeakedCard(payload: unknown, forbiddenCards: Card[]): Card | undefined {
  const forbidden = new Set(forbiddenCards.map((c) => `${c.suit}:${c.rank}`));
  const seen = new Set<unknown>();

  function walk(node: unknown): Card | undefined {
    if (node === null || typeof node !== 'object') return undefined;
    if (seen.has(node)) return undefined;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return undefined;
    }

    const obj = node as Record<string, unknown>;
    if (typeof obj.suit === 'string' && typeof obj.rank === 'number') {
      if (forbidden.has(`${obj.suit}:${obj.rank}`)) return obj as unknown as Card;
    }
    for (const value of Object.values(obj)) {
      const hit = walk(value);
      if (hit) return hit;
    }
    return undefined;
  }

  return walk(payload);
}

describe('hidden state over the wire', () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await createTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("never sends a player's own opponent's hand or the deck order", async () => {
    const { stateA, stateB } = await matchPlayers(testApp);

    // Sanity: the two hands are actually disjoint (proves this test can catch a real leak).
    const overlap = stateA.yourHand.filter((cardA) =>
      stateB.yourHand.some((cardB) => cardA.suit === cardB.suit && cardA.rank === cardB.rank),
    );
    expect(overlap).toHaveLength(0);

    expect(findLeakedCard(stateA, stateB.yourHand)).toBeUndefined();
    expect(findLeakedCard(stateB, stateA.yourHand)).toBeUndefined();

    expect(stateA.opponentCardCount).toBe(stateB.yourHand.length);
    expect(stateB.opponentCardCount).toBe(stateA.yourHand.length);

    expect('deck' in stateA).toBe(false);
    expect('deck' in stateB).toBe(false);
    expect(typeof stateA.deckCount).toBe('number');
  });
});
