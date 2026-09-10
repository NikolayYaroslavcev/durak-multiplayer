import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SocketProvider } from '@/lib/socket-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Дурак — Mini Multiplayer Game Platform',
  description: 'Lobby, matchmaking и игровая комната для карточной игры «Дурак»',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SocketProvider>{children}</SocketProvider>
      </body>
    </html>
  );
}
