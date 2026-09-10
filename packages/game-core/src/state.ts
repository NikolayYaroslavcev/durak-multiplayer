import { createDeck, shuffle } from './deck';
import type { Card, GameState, PlayerId } from './types';

const HAND_SIZE = 6;

export function getOpponentId(state: GameState, playerId: PlayerId): PlayerId {
  const [a, b] = Object.keys(state.players);
  return playerId === a ? b : a;
}

function lowestTrumpRank(hand: readonly Card[], trumpSuit: Card['suit']): number {
  const trumps = hand.filter((c) => c.suit === trumpSuit);
  if (trumps.length === 0) return Infinity;
  return Math.min(...trumps.map((c) => c.rank));
}

function pickFirstAttacker(
  playerIds: [PlayerId, PlayerId],
  hands: [Card[], Card[]],
  trumpSuit: Card['suit'],
): PlayerId {
  const [rankA, rankB] = hands.map((hand) => lowestTrumpRank(hand, trumpSuit));
  if (rankA === Infinity && rankB === Infinity) return playerIds[0];
  return rankA <= rankB ? playerIds[0] : playerIds[1];
}

export function createInitialState(playerIds: [PlayerId, PlayerId], rng: () => number): GameState {
  const shuffled = shuffle(createDeck(), rng);

  const handA = shuffled.slice(0, HAND_SIZE);
  const handB = shuffled.slice(HAND_SIZE, HAND_SIZE * 2);
  const deck = shuffled.slice(HAND_SIZE * 2);

  const trumpCard = deck[deck.length - 1];
  const trumpSuit = trumpCard.suit;

  const attackerId = pickFirstAttacker(playerIds, [handA, handB], trumpSuit);
  const defenderId = attackerId === playerIds[0] ? playerIds[1] : playerIds[0];

  return {
    players: {
      [playerIds[0]]: { hand: handA },
      [playerIds[1]]: { hand: handB },
    },
    deck,
    trumpSuit,
    trumpCard,
    table: [],
    discardCount: 0,
    status: { phase: 'in_progress', attackerId, defenderId },
  };
}

/** Draws cards from the front of the deck up to HAND_SIZE. Returns new hand/deck, does not mutate inputs. */
export function drawUpTo6(hand: readonly Card[], deck: readonly Card[]): { hand: Card[]; deck: Card[] } {
  const needed = Math.max(0, HAND_SIZE - hand.length);
  const drawn = deck.slice(0, needed);
  return {
    hand: [...hand, ...drawn],
    deck: deck.slice(needed),
  };
}
