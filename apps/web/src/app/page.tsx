'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSocketContext } from '@/lib/socket-context';

export default function LobbyPage() {
  const router = useRouter();
  const { status, roomId, restoringSession, notice, joinQueue, leaveQueue, clearNotice } = useSocketContext();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (roomId) router.push(`/game/${roomId}`);
  }, [roomId, router]);

  const handleFindOpponent = (): void => {
    setSearching(true);
    joinQueue();
  };

  const handleCancel = (): void => {
    setSearching(false);
    leaveQueue();
  };

  return (
    <main>
      <StatusBar status={status} />

      <div className="lobby">
        <h1>Дурак</h1>

        {notice && (
          <p className="banner banner--error" onClick={clearNotice} role="button" tabIndex={0}>
            {notice.message}
          </p>
        )}

        {restoringSession ? (
          <p className="lobby__spinner">Восстанавливаем предыдущую игру…</p>
        ) : searching ? (
          <>
            <p className="lobby__spinner">Ищем соперника…</p>
            <button onClick={handleCancel}>Отменить поиск</button>
          </>
        ) : (
          <button className="primary" onClick={handleFindOpponent} disabled={status !== 'connected'}>
            Найти соперника
          </button>
        )}
      </div>
    </main>
  );
}

function StatusBar({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) {
  const label = { connecting: 'Подключение…', connected: 'Подключено', disconnected: 'Соединение потеряно' }[status];
  return (
    <div className="status-bar">
      <span>
        <span className={`status-dot status-dot--${status}`} />
        {label}
      </span>
    </div>
  );
}
