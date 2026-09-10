export type Suit = '♠' | '♥' | '♦' | '♣';

/** 11 = J, 12 = Q, 13 = K, 14 = A */
export type Rank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type PlayerId = string;

export type PlayerHand = {
  hand: Card[];
};

export type TableSlot = {
  attack: Card;
  defend?: Card;
};

export type GameStatus =
  | {
      phase: 'in_progress';
      attackerId: PlayerId;
      defenderId: PlayerId;
    }
  | {
      phase: 'finished';
      result: 'win';
      winnerId: PlayerId;
    }
  | {
      phase: 'finished';
      result: 'draw';
    };

export type GameState = {
  players: Record<PlayerId, PlayerHand>;
  deck: Card[];
  trumpSuit: Suit;
  trumpCard: Card;
  table: TableSlot[];
  discardCount: number;
  status: GameStatus;
};

export type Move =
  | {
      type: 'attack';
      playerId: PlayerId;
      card: Card;
    }
  | {
      type: 'defend';
      playerId: PlayerId;
      card: Card;
      against: Card;
    }
  | {
      type: 'takeCards';
      playerId: PlayerId;
    }
  | {
      type: 'endAttack';
      playerId: PlayerId;
    };

export type ClientGameState = {
  yourHand: Card[];
  opponentCardCount: number;
  deckCount: number;
  trumpCard: Card;
  table: TableSlot[];
  status: GameStatus;
  yourTurnRole: 'attacker' | 'defender' | null;
};
