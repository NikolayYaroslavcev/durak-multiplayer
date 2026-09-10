import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { GameService, type GameServiceOptions } from '../src/game/game.service';

export type TestApp = {
  url: string;
  gameService: GameService;
  createClient: () => ClientSocket;
  close: () => Promise<void>;
};

export async function createTestApp(gameServiceOptions?: GameServiceOptions): Promise<TestApp> {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
  if (gameServiceOptions) {
    moduleBuilder.overrideProvider(GameService).useValue(new GameService(gameServiceOptions));
  }
  const moduleRef = await moduleBuilder.compile();

  const app: INestApplication = moduleRef.createNestApplication();
  await app.listen(0);

  const address = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const clients: ClientSocket[] = [];

  return {
    url,
    gameService: moduleRef.get(GameService),
    createClient: () => {
      const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
      clients.push(socket);
      return socket;
    },
    close: async () => {
      // socket.close() only *initiates* the close handshake; awaiting each client's
      // "disconnect" (or an already-closed socket resolving immediately) avoids a race
      // where the underlying transport is still tearing down when app.close() runs,
      // which otherwise intermittently leaves a handle open past the end of the test file.
      await Promise.all(
        clients.map(
          (c) =>
            new Promise<void>((resolve) => {
              if (c.disconnected) {
                resolve();
                return;
              }
              c.once('disconnect', () => resolve());
              c.close();
            }),
        ),
      );
      await app.close();
    },
  };
}

/** Resolves with the payload of the next occurrence of `event` on `socket`. */
export function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for "${event}"`));
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error('timed out waiting for connect')), 3000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
