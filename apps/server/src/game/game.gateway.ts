import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { toClientView } from '@game/game-core';
import { AlreadyInQueueError, LobbyService } from '../lobby/lobby.service';
import { SOCKET_EVENTS } from '../protocol/events';
import type { ErrorCode } from '../protocol/errors';
import { moveIntentSchema, reconnectPayloadSchema } from '../protocol/schemas';
import type { ErrorPayload, MatchFoundPayload, MoveRejectedPayload } from '../protocol/dto';
import { GameService } from './game.service';
import type { GameSession } from './room.types';

/**
 * Allowed browser origins for the Socket.IO connection, as a comma-separated list in
 * `CORS_ORIGIN` (e.g. `https://app.example.com,https://staging.example.com`). Defaults to
 * the local Next.js dev server so `pnpm dev` keeps working with no env setup — a wildcard
 * would let any website open a socket to this server, which is unnecessary since the real
 * client origin is always known ahead of time.
 */
function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return ['http://localhost:3000'];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Thin Socket.IO transport layer: parses payload shape, resolves socket -> player/room
 * context, delegates to LobbyService/GameService, and sends personalized responses.
 * Contains no game rules and no game state machine of its own.
 */
@WebSocketGateway({ cors: { origin: corsOrigins() } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly lobbyService: LobbyService,
    private readonly gameService: GameService,
  ) {
    this.gameService.events.on('forfeit', ({ roomId }: { roomId: string }) => {
      this.pushGameStateToConnectedPlayers(roomId);
    });
  }

  handleConnection(socket: Socket): void {
    socket.data.playerId = randomUUID();
    this.logger.log(`socket connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const playerId = socket.data.playerId as string | undefined;
    if (playerId) this.lobbyService.leaveQueue(playerId);

    const result = this.gameService.handleDisconnect(socket.id);
    if (!result) return;

    this.logger.log(`player disconnected from room ${result.roomId}, grace period started`);
    if (result.opponentSocketId) {
      this.server.to(result.opponentSocketId).emit(SOCKET_EVENTS.OPPONENT_DISCONNECTED, {});
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.JOIN_QUEUE)
  handleJoinQueue(@ConnectedSocket() socket: Socket): void {
    const playerId = socket.data.playerId as string;

    let opponent: { playerId: string; socketId: string } | null;
    try {
      opponent = this.lobbyService.joinQueue(playerId, socket.id);
    } catch (err) {
      if (err instanceof AlreadyInQueueError) {
        this.emitError(socket, 'ALREADY_IN_QUEUE', 'already in matchmaking queue');
        return;
      }
      throw err;
    }

    if (!opponent) return; // now waiting in queue

    const room = this.gameService.createRoom(
      { playerId: opponent.playerId, socketId: opponent.socketId },
      { playerId, socketId: socket.id },
    );
    this.broadcastMatchFound(room);
  }

  @SubscribeMessage(SOCKET_EVENTS.LEAVE_QUEUE)
  handleLeaveQueue(@ConnectedSocket() socket: Socket): void {
    const playerId = socket.data.playerId as string;
    this.lobbyService.leaveQueue(playerId);
  }

  @SubscribeMessage(SOCKET_EVENTS.MAKE_MOVE)
  handleMakeMove(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): void {
    const parsed = moveIntentSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(`malformed make_move payload from socket ${socket.id}`);
      this.emitMoveRejected(socket, 'MALFORMED_PAYLOAD', 'invalid make_move payload shape');
      return;
    }

    const result = this.gameService.handleMove(socket.id, parsed.data);
    if (!result.ok) {
      this.emitMoveRejected(socket, result.code, result.message);
      return;
    }

    this.pushGameStateToConnectedPlayers(result.room.roomId);
  }

  @SubscribeMessage(SOCKET_EVENTS.RECONNECT)
  handleReconnect(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown): void {
    const parsed = reconnectPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      this.emitError(socket, 'MALFORMED_PAYLOAD', 'invalid reconnect payload shape');
      return;
    }

    const result = this.gameService.reconnect(parsed.data.sessionToken, socket.id);
    if (!result.ok) {
      this.emitError(socket, result.code, `reconnect failed: ${result.code}`);
      return;
    }

    socket.data.playerId = result.playerId;
    void socket.join(result.room.roomId);

    if (result.staleSocketId) {
      this.server.sockets.sockets.get(result.staleSocketId)?.disconnect(true);
    }

    socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, toClientView(result.room.gameState, result.playerId));

    if (result.wasDisconnected) {
      const opponent = result.room.players.find((p) => p.playerId !== result.playerId);
      if (opponent?.connected && opponent.socketId) {
        this.server.to(opponent.socketId).emit(SOCKET_EVENTS.OPPONENT_RECONNECTED, {});
      }
    }
  }

  private broadcastMatchFound(room: GameSession): void {
    for (const p of room.players) {
      const socket = p.socketId ? this.server.sockets.sockets.get(p.socketId) : undefined;
      if (!socket) continue;
      void socket.join(room.roomId);
      const payload: MatchFoundPayload = { roomId: room.roomId, sessionToken: p.sessionToken, playerId: p.playerId };
      socket.emit(SOCKET_EVENTS.MATCH_FOUND, payload);
      socket.emit(SOCKET_EVENTS.GAME_STATE_UPDATE, toClientView(room.gameState, p.playerId));
    }
    this.logger.log(`room ${room.roomId}: match_found sent to both players`);
  }

  private pushGameStateToConnectedPlayers(roomId: string): void {
    const room = this.gameService.getRoom(roomId);
    if (!room) return;
    for (const p of room.players) {
      if (!p.connected || !p.socketId) continue;
      this.server.to(p.socketId).emit(SOCKET_EVENTS.GAME_STATE_UPDATE, toClientView(room.gameState, p.playerId));
    }
  }

  private emitMoveRejected(socket: Socket, code: ErrorCode, message: string): void {
    const payload: MoveRejectedPayload = { code, message };
    socket.emit(SOCKET_EVENTS.MOVE_REJECTED, payload);
  }

  private emitError(socket: Socket, code: ErrorCode, message: string): void {
    const payload: ErrorPayload = { code, message };
    socket.emit(SOCKET_EVENTS.ERROR, payload);
  }
}
