# Mini Multiplayer Game Platform ("Durak")

[Русский](README.md) · **English**

A take-home assignment for a React/TypeScript/Node.js developer position: a skeleton
of a multiplayer game platform (lobby → matchmaking → room → game), where the
first implemented game is a simplified two-player "Durak".

The architecture is designed so that the game logic (`packages/game-core`)
does not depend on React/Phaser/NestJS/Socket.IO and can be reused by a
second client or a second game in the future.

Details of the architectural decisions:
[docs/architecture-research.md](./docs/architecture-research.md).

![Mini Multiplayer Game Platform](docs/screenshot.png)

## Stack

- **`packages/game-core`**: pure game logic and domain types, with no
  external dependencies (TypeScript + Vitest).
- **`apps/server`**: NestJS + Socket.IO: lobby, matchmaking, rooms,
  server-authoritative move validation, session/reconnect (Jest + a real
  `socket.io-client` in integration tests).
- **`apps/web`**: Next.js (App Router) + React + Phaser: lobby, game
  room, state rendering and input (Vitest + Testing Library for the
  client logic).

## Architecture

```
Client (Next.js + React + Phaser)
        │  Socket.IO client
        ▼
Socket.IO Gateway (NestJS) — тонкий транспортный слой
        │
        ▼
LobbyService / GameService  ──uses──▶  game-core (чистые функции)
        │
        ▼
In-memory room store (Map<roomId, GameSession>)
```

- **`game-core`** is the only source of game rules: `createInitialState`,
  `getValidMoves`, `applyMove`, `toClientView`. Pure deterministic
  functions that do not mutate their input and have no network or UI dependencies.
- **`GameService`/`LobbyService`** hold `GameState` and the matchmaking queue
  in memory, call `game-core` for validation and transitions, and manage the
  room lifecycle, session tokens, and disconnect/reconnect/forfeit
  timers.
- **`GameGateway`** parses the shape of the incoming payload (zod), resolves
  socket → player/room, delegates to the services, and sends a personal
  `game_state_update` to each player. It contains no game rules.
- **React/Next.js** owns the Socket.IO connection (a single context for the whole
  app), the lobby, routing, the win/loss screen, and the reconnect UI.
- **Phaser** handles only rendering and pointer input: it turns a click on a
  card into a `MoveIntent` and draws whatever the server sent. It stores no
  game rules of its own and does not decide whether a move is legal.

## Server-authoritative and hidden state

- The full `GameState` exists only on the server; the client never
  receives it.
- The client sends an **intent** (`make_move`), not state, and the server decides
  whether to apply it.
- Every action is checked for legality twice: `GameGateway` validates the
  payload shape (zod schema), then `applyMove` in `game-core` independently
  re-runs `getValidMoves`, even if the service has already filtered the move
  (defense-in-depth).
- `toClientView(state, playerId)` is the only channel for revealing state:
  the player's own cards in full, the opponent's cards only as a count, and the
  deck order is never revealed.
- There are no optimistic updates on the client: Phaser and React re-render
  only when a `game_state_update` arrives from the server.

## Matchmaking, reconnect, forfeit

1. `join_queue`: if someone is already waiting in the queue, both players
   immediately receive `match_found` (with `roomId` and a personal
   `sessionToken`) and the first `game_state_update`.
2. When a connection drops, the room and `GameState` are not destroyed: the player
   is marked `disconnected`, the other player receives `opponent_disconnected`,
   and a grace period starts (90 seconds by default).
3. `reconnect` with a valid `sessionToken` returns the current personal
   state; if the reconnect happened after a real disconnect, the other player
   receives `opponent_reconnected`. Connecting again with the same token
   (a second tab opened) correctly displaces the old socket.
4. If the player does not return within the grace period and the opponent is active, a forfeit is recorded:
   `status` changes to `finished` and the room is closed by TTL. If both
   fail to return, the room is closed with no winner.
5. After the room is closed (by TTL or double forfeit), the server fully
   removes its session/socket records: the session really ceases to
   exist, rather than just becoming unreachable.

## Running locally

Requirements: Node.js ≥ 20, pnpm.

```bash
pnpm install
```

Copy the example env files (the default values already work for
local development without changes):

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

Start the server and the client in two terminals:

```bash
pnpm --filter @game/server dev    # NestJS + Socket.IO на :3001 (nest start --watch не настроен — см. ниже)
pnpm --filter @game/web dev       # Next.js на :3000
```

> `apps/server` has no separate `dev` script with watch mode. For
> local development, build and run: `pnpm --filter @game/server build && pnpm --filter @game/server start`,
> or `pnpm --filter @game/game-core build && npx ts-node apps/server/src/main.ts`
> if you need live reload.

Open `http://localhost:3000` in two separate tabs/browsers (or
incognito windows, so each has its own `localStorage`). Clicking "Найти
соперника" (Find an opponent) in both puts them into one game.

## Tests

```bash
pnpm --filter @game/game-core test   # 67 unit/property-тестов правил игры
pnpm --filter @game/server test      # 25 integration-тестов (реальный socket.io-client + NestJS)
pnpm --filter @game/web test         # unit-тесты клиентской логики (session, socket-состояния)
pnpm -r run typecheck                # строгий TypeScript по всем пакетам
pnpm lint                            # ESLint по всему workspace
```

What is covered:

- **game-core**: dealing, limits on piling on cards, all `applyMove` transitions,
  win/draw/unfinished states, hidden state in `toClientView`,
  immutability and deck integrity (36 cards) across full simulated
  games with different seeds.
- **server**: matchmaking (including the race between simultaneous `join_queue` calls and
  `leave_queue` right after a match), server-side validation of every move
  type and of malformed payloads, the full disconnect→reconnect→forfeit lifecycle,
  duplicate connections, repeated moves from the same client in a row (double
  action), reconnect right at the end of the grace period, and the fact that
  the session/socket indexes are actually cleaned up after a room closes
  (rather than the room merely being marked unreachable).
- **web**: session persistence in `localStorage` (including corrupted/
  incomplete data), `SocketProvider` states around `match_found`,
  session restoration and reconnect errors (`INVALID_SESSION`/
  `ROOM_NOT_FOUND` correctly clear the saved session).

## Environment variables

| Variable | Where | Purpose | Default |
|---|---|---|---|
| `PORT` | `apps/server` | Port the NestJS/Socket.IO server listens on | `3001` |
| `CORS_ORIGIN` | `apps/server` | Allowed origin(s) for Socket.IO (comma-separated) | `http://localhost:3000` |
| `NEXT_PUBLIC_SERVER_URL` | `apps/web` | URL of the server the client connects to | `http://localhost:3001` |

Examples are in `apps/server/.env.example` and `apps/web/.env.example`. The real
`.env`/`.env.local` files are not committed to git (see `.gitignore`).
