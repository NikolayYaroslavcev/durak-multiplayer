'use client';

import { useRouter } from 'next/navigation';
import { GameBoard } from '@/components/GameBoard';
import { useSocketContext } from '@/lib/socket-context';

export function GameRoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const {
    status,
    roomId: activeRoomId,
    playerId,
    gameState,
    opponentConnected,
    restoringSession,
    notice,
    clearNotice,
    makeMove,
    leaveRoom,
  } = useSocketContext();

  const isActiveRoom = activeRoomId === roomId;

  const handleLeaveToLobby = (): void => {
    leaveRoom();
    router.push('/');
  };

  return (
    <main>
      <div className="status-bar">
        <span>
          <span className={`status-dot status-dot--${status}`} />
          {status === 'disconnected' ? 'Переподключение…' : 'Подключено'}
        </span>
        <button className="link-button" onClick={handleLeaveToLobby}>
          В лобби
        </button>
      </div>

      {notice && (
        <p className="banner banner--error" onClick={clearNotice} role="button" tabIndex={0}>
          {notice.message}
        </p>
      )}

      {restoringSession && !isActiveRoom && <p className="lobby__spinner">Восстанавливаем игру…</p>}

      {!restoringSession && !isActiveRoom && (
        <div className="lobby">
          <p>Эта игра здесь недоступна.</p>
          <button className="primary" onClick={handleLeaveToLobby}>
            Вернуться в лобби
          </button>
        </div>
      )}

      {isActiveRoom && gameState && (
        <GameBoard state={gameState} playerId={playerId} opponentConnected={opponentConnected} onMove={makeMove} />
      )}

      {isActiveRoom && !gameState && <p className="lobby__spinner">Загружаем состояние игры…</p>}
    </main>
  );
}
