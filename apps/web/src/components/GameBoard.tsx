'use client';

import dynamic from 'next/dynamic';
import type { ClientGameState } from '@game/game-core';
import type { MoveIntent } from '@/lib/protocol';

const PhaserGameCanvas = dynamic(() => import('./PhaserGameCanvas').then((m) => m.PhaserGameCanvas), {
  ssr: false,
  loading: () => <div className="game-canvas game-canvas--loading">Загружаем игровое поле…</div>,
});

export function GameBoard({
  state,
  playerId,
  opponentConnected,
  onMove,
}: {
  state: ClientGameState;
  /** Our own playerId — used only to label the result banner, never to gate anything. */
  playerId: string | null;
  opponentConnected: boolean;
  /** Sends a move intent to the server; the board never applies a move itself. */
  onMove: (intent: MoveIntent) => void;
}) {
  return (
    <div className="board">
      {!opponentConnected && <p className="banner banner--warning">Соперник отключился, ожидаем возвращения…</p>}

      <div className="game-canvas-frame">
        <PhaserGameCanvas state={state} onMove={onMove} />
      </div>

      <Controls state={state} onMove={onMove} />

      <ResultBanner state={state} playerId={playerId} />
    </div>
  );
}

function Controls({ state, onMove }: { state: ClientGameState; onMove: (intent: MoveIntent) => void }) {
  if (state.status.phase !== 'in_progress') return null;
  return (
    <div className="controls">
      {state.yourTurnRole === 'defender' && <button onClick={() => onMove({ type: 'takeCards' })}>Взять карты</button>}
      {state.yourTurnRole === 'attacker' && (
        <button onClick={() => onMove({ type: 'endAttack' })}>Закончить ход</button>
      )}
    </div>
  );
}

function ResultBanner({ state, playerId }: { state: ClientGameState; playerId: string | null }) {
  if (state.status.phase !== 'finished') return null;
  if (state.status.result === 'draw') return <p className="banner banner--result">Ничья</p>;
  const youWon = state.status.winnerId === playerId;
  return <p className="banner banner--result">{youWon ? 'Вы победили!' : 'Вы проиграли'}</p>;
}
