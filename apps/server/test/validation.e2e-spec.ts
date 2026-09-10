import type { Card, Rank, Suit } from '@game/game-core';
import { byRole, matchPlayers, type MatchedPair } from './matchHelpers';
import { createTestApp, waitForEvent, type TestApp } from './testApp';
import type { MoveRejectedPayload } from '../src/protocol/dto';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];

function allCards(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

function cardNotInHand(hand: Card[]): Card {
  const found = allCards().find((c) => !hand.some((h) => h.suit === c.suit && h.rank === c.rank));
  if (!found) throw new Error('expected at least one card outside a 6-card hand');
  return found;
}

describe('server-side move validation', () => {
  let testApp: TestApp;
  let pair: MatchedPair;

  beforeEach(async () => {
    testApp = await createTestApp();
    pair = await matchPlayers(testApp);
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('rejects a move from the wrong role (not your turn)', async () => {
    const defender = byRole(pair, 'defender');
    defender.socket.emit('make_move', { type: 'attack', card: defender.state.yourHand[0] });

    const rejection = await waitForEvent<MoveRejectedPayload>(defender.socket, 'move_rejected');
    expect(rejection.code).toBe('NOT_YOUR_TURN');
  });

  it('rejects a card the player does not hold', async () => {
    const attacker = byRole(pair, 'attacker');
    const bogusCard = cardNotInHand(attacker.state.yourHand);
    attacker.socket.emit('make_move', { type: 'attack', card: bogusCard });

    const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
    expect(rejection.code).toBe('CARD_NOT_IN_HAND');
  });

  it('rejects an illegal defense (wrong "against" reference)', async () => {
    const attacker = byRole(pair, 'attacker');
    const defender = byRole(pair, 'defender');

    const openingCard = attacker.state.yourHand[0];
    attacker.socket.emit('make_move', { type: 'attack', card: openingCard });
    await waitForEvent(defender.socket, 'game_state_update');

    const fabricatedAgainst: Card = { suit: openingCard.suit, rank: openingCard.rank === 6 ? 7 : 6 };
    defender.socket.emit('make_move', { type: 'defend', card: defender.state.yourHand[0], against: fabricatedAgainst });

    const rejection = await waitForEvent<MoveRejectedPayload>(defender.socket, 'move_rejected');
    expect(rejection.code).toBe('INVALID_DEFENSE');
  });

  it('rejects throwing in a rank that is not yet on the table', async () => {
    const attacker = byRole(pair, 'attacker');
    const openingCard = attacker.state.yourHand[0];
    attacker.socket.emit('make_move', { type: 'attack', card: openingCard });
    const afterOpen = await waitForEvent<import('@game/game-core').ClientGameState>(
      attacker.socket,
      'game_state_update',
    );

    const remainingHand = afterOpen.yourHand;
    const offRankCard = remainingHand.find((c) => c.rank !== openingCard.rank);
    if (!offRankCard) throw new Error('expected a hand card with a different rank than the opening card');

    attacker.socket.emit('make_move', { type: 'attack', card: offRankCard });
    const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
    expect(rejection.code).toBe('INVALID_THROW_IN');
  });

  it('rejects endAttack while an attack on the table is unresolved', async () => {
    const attacker = byRole(pair, 'attacker');
    attacker.socket.emit('make_move', { type: 'attack', card: attacker.state.yourHand[0] });
    await waitForEvent(attacker.socket, 'game_state_update');

    attacker.socket.emit('make_move', { type: 'endAttack' });
    const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
    expect(rejection.code).toBe('UNRESOLVED_ATTACK');
  });

  it('rejects any move once the game has finished', async () => {
    const room = testApp.gameService.getRoom(pair.roomId);
    if (!room) throw new Error('room not found');
    room.gameState = {
      ...room.gameState,
      status: { phase: 'finished', result: 'win', winnerId: pair.matchA.playerId },
    };

    pair.a.emit('make_move', { type: 'attack', card: pair.stateA.yourHand[0] });
    const rejection = await waitForEvent<MoveRejectedPayload>(pair.a, 'move_rejected');
    expect(rejection.code).toBe('GAME_FINISHED');
  });

  describe('malformed make_move payloads are rejected before reaching game-core', () => {
    const attackerOf = () => byRole(pair, 'attacker');

    it('rejects an unknown move type', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', { type: 'teleport' });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });

    it('rejects a missing card field', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', { type: 'attack' });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });

    it('rejects an invalid card shape', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', { type: 'attack', card: { suit: 'X', rank: 99 } });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });

    it('rejects a defend missing "against"', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', { type: 'defend', card: { suit: '♠', rank: 6 } });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });

    it('rejects invalid field types', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', { type: 'attack', card: { suit: '♠', rank: '6' } });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });

    it('rejects unexpected extra fields', async () => {
      const attacker = attackerOf();
      attacker.socket.emit('make_move', {
        type: 'attack',
        card: attacker.state.yourHand[0],
        gameState: { fake: true },
      });
      const rejection = await waitForEvent<MoveRejectedPayload>(attacker.socket, 'move_rejected');
      expect(rejection.code).toBe('MALFORMED_PAYLOAD');
    });
  });
});
