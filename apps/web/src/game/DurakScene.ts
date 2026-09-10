import * as Phaser from 'phaser';
import type { Card, ClientGameState, TableSlot } from '@game/game-core';
import type { MoveIntent } from '@/lib/protocol';

/**
 * Phaser owns rendering and pointer input only — it draws whatever `ClientGameState` it was
 * last given and turns a card/table click into a `MoveIntent` sent upward. It holds no game
 * rules and no "is this legal" logic of its own: every intent goes through `onMove` to the
 * server via the existing Socket.IO protocol, and the next redraw only ever reflects the
 * state the server actually confirmed (`applyState`), never a local guess.
 */

export const SCENE_KEY = 'durak-scene';
export const SCENE_WIDTH = 760;
export const SCENE_HEIGHT = 480;

const CARD_W = 68;
const CARD_H = 96;
const CARD_RADIUS = 8;

const COLORS = {
  face: 0xf6f2e7,
  faceBorder: 0xcfc7ad,
  back: 0x1f3650,
  backBorder: 0x16283b,
  accent: 0xe8b23d,
} as const;

const RANK_LABELS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦';
}

function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Evenly spaces `count` items around `centerX`, overlapping them once they'd exceed `maxWidth`. */
function layoutPositions(count: number, centerX: number, maxWidth: number, itemWidth: number): number[] {
  if (count === 0) return [];
  const naturalWidth = count * itemWidth + (count - 1) * 8;
  const totalWidth = Math.min(naturalWidth, maxWidth);
  const step = count > 1 ? (totalWidth - itemWidth) / (count - 1) : 0;
  const startX = centerX - totalWidth / 2 + itemWidth / 2;
  return Array.from({ length: count }, (_, i) => startX + i * step);
}

export type DurakBridge = {
  state: ClientGameState;
  onMove: (intent: MoveIntent) => void;
  sceneRef: DurakScene | null;
};

export type BridgeRef = { current: DurakBridge };

export class DurakScene extends Phaser.Scene {
  private bridge!: BridgeRef;
  private lastState!: ClientGameState;
  private selectedAttack: Card | null = null;

  constructor() {
    super(SCENE_KEY);
  }

  init(data: { bridgeRef: BridgeRef }): void {
    this.bridge = data.bridgeRef;
  }

  create(): void {
    this.bridge.current.sceneRef = this;
    this.applyState(this.bridge.current.state);
  }

  /** Called from React whenever a fresh `game_state_update` arrives. */
  applyState(state: ClientGameState): void {
    this.selectedAttack = null;
    this.lastState = state;
    this.render(state);
  }

  private emitMove(intent: MoveIntent): void {
    this.bridge.current.onMove(intent);
  }

  private selectAttack(card: Card): void {
    this.selectedAttack = card;
    this.render(this.lastState);
  }

  private render(state: ClientGameState): void {
    this.children.removeAll(true);

    const inProgress = state.status.phase === 'in_progress';
    const isAttacker = state.yourTurnRole === 'attacker';
    const isDefender = state.yourTurnRole === 'defender';
    const unresolved = state.table.filter((slot) => !slot.defend);

    this.renderOpponentHand(state.opponentCardCount);
    this.renderDeckAndTrump(state.deckCount, state.trumpCard);
    if (inProgress) this.renderTurnIndicator(isAttacker);
    this.renderTable(state.table, inProgress && isDefender, unresolved);
    this.renderOwnHand(state.yourHand, inProgress, isAttacker, isDefender, unresolved);
  }

  private renderOpponentHand(count: number): void {
    const y = 86;
    const xs = layoutPositions(count, SCENE_WIDTH / 2, 620, CARD_W);
    xs.forEach((x) => this.drawCard(x, y, { faceUp: false }));
  }

  private renderDeckAndTrump(deckCount: number, trumpCard: Card): void {
    const x = 92;
    const y = 240;
    this.drawCard(x, y, { faceUp: true, card: trumpCard });
    this.add
      .text(x, y + CARD_H / 2 + 18, `Колода: ${deckCount}`, { fontSize: '14px', color: '#9db3a3' })
      .setOrigin(0.5);
  }

  private renderTurnIndicator(isAttacker: boolean): void {
    const label = isAttacker ? 'Вы атакуете' : 'Вы защищаетесь';
    this.add
      .text(SCENE_WIDTH - 24, 14, label, { fontSize: '15px', fontStyle: 'bold', color: '#e8b23d' })
      .setOrigin(1, 0.5);
  }

  private renderTable(table: TableSlot[], defenderCanSelect: boolean, unresolved: TableSlot[]): void {
    const y = 240;
    const centerX = SCENE_WIDTH / 2;
    const groupWidth = CARD_W + 16;

    if (table.length === 0) {
      this.add.text(centerX, y, 'Стол пуст', { fontSize: '14px', color: '#9db3a3' }).setOrigin(0.5);
      return;
    }

    const xs = layoutPositions(table.length, centerX, 560, groupWidth);
    table.forEach((slot, i) => {
      const gx = xs[i];
      const isUnresolved = !slot.defend;
      const highlighted = isUnresolved && !!this.selectedAttack && cardsEqual(this.selectedAttack, slot.attack);
      this.drawCard(gx, y, {
        faceUp: true,
        card: slot.attack,
        highlighted,
        interactive: defenderCanSelect && isUnresolved && unresolved.length > 1,
        onClick: () => this.selectAttack(slot.attack),
      });
      if (slot.defend) {
        this.drawCard(gx + 16, y - 14, { faceUp: true, card: slot.defend });
      }
    });
  }

  private renderOwnHand(
    hand: Card[],
    interactive: boolean,
    isAttacker: boolean,
    isDefender: boolean,
    unresolved: TableSlot[],
  ): void {
    const y = 404;
    const xs = layoutPositions(hand.length, SCENE_WIDTH / 2, 700, CARD_W);
    const canClick = interactive && (isAttacker || isDefender);

    hand.forEach((card, i) => {
      this.drawCard(xs[i], y, {
        faceUp: true,
        card,
        interactive: canClick,
        onClick: canClick ? () => this.handleHandCardClick(card, isAttacker, unresolved) : undefined,
      });
    });
  }

  private handleHandCardClick(card: Card, isAttacker: boolean, unresolved: TableSlot[]): void {
    if (isAttacker) {
      this.emitMove({ type: 'attack', card });
      return;
    }
    const against = unresolved.length === 1 ? unresolved[0].attack : this.selectedAttack;
    if (!against) return;
    this.emitMove({ type: 'defend', card, against });
  }

  private drawCard(
    x: number,
    y: number,
    opts: { faceUp: boolean; card?: Card; interactive?: boolean; highlighted?: boolean; onClick?: () => void },
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 140, ease: 'Quad.easeOut' });

    const g = this.add.graphics();
    const borderColor = opts.highlighted ? COLORS.accent : opts.faceUp ? COLORS.faceBorder : COLORS.backBorder;
    g.fillStyle(opts.faceUp ? COLORS.face : COLORS.back, 1);
    g.lineStyle(opts.highlighted ? 3 : 1, borderColor, 1);
    g.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    g.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    container.add(g);

    if (opts.faceUp && opts.card) {
      const color = isRed(opts.card) ? '#c0392b' : '#1a1a1a';
      const rankText = this.add
        .text(0, -CARD_H / 2 + 20, rankLabel(opts.card.rank), { fontSize: '18px', fontStyle: 'bold', color })
        .setOrigin(0.5);
      const suitText = this.add.text(0, 10, opts.card.suit, { fontSize: '26px', color }).setOrigin(0.5);
      container.add([rankText, suitText]);
    }

    if (opts.interactive) {
      container.setSize(CARD_W, CARD_H);
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        this.tweens.killTweensOf(container);
        this.tweens.add({ targets: container, scale: 1.06, duration: 100, ease: 'Quad.easeOut' });
      });
      container.on('pointerout', () => {
        this.tweens.killTweensOf(container);
        this.tweens.add({ targets: container, scale: 1, duration: 100, ease: 'Quad.easeOut' });
      });
      if (opts.onClick) container.on('pointerdown', opts.onClick);
    }

    return container;
  }
}
