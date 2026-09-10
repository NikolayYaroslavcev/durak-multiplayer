import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { applyMove, createInitialState, getValidMoves, type GameState, type PlayerId } from '@game/game-core';
import type { ErrorCode } from '../protocol/errors';
import type { MoveIntent } from '../protocol/schemas';
import { diagnoseRejection, findMatchingMove } from './moveMatching';
import type { GameSession, PlayerSession } from './room.types';

/** How long a disconnected player has to reconnect before forfeiting. */
export const GRACE_PERIOD_MS = 90_000;
/** How long a finished room stays in memory (reachable for reconnect) before cleanup. */
export const ROOM_CLEANUP_TTL_MS = 30_000;

type SocketIndexEntry = { roomId: string; playerId: PlayerId };

export type MoveResult = { ok: true; room: GameSession } | { ok: false; code: ErrorCode; message: string };

export type ReconnectResult =
  | { ok: true; room: GameSession; playerId: PlayerId; wasDisconnected: boolean; staleSocketId: string | null }
  | { ok: false; code: ErrorCode };

export type DisconnectResult = { roomId: string; opponentPlayerId: PlayerId; opponentSocketId: string | null };

export type GameServiceOptions = {
  /** Overrides GRACE_PERIOD_MS — for tests only, so forfeit scenarios don't need real 90s waits. */
  gracePeriodMs?: number;
  /** Overrides ROOM_CLEANUP_TTL_MS — for tests only. */
  roomCleanupTtlMs?: number;
};

function randomToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Owns room lifecycle, GameState, session tokens, and disconnect/reconnect/forfeit
 * bookkeeping. Never re-implements game rules — every state transition goes through
 * `@game/game-core`'s `getValidMoves`/`applyMove`.
 *
 * Emits `forfeit` (payload: `{ roomId: string }`) on this.events when a room is decided
 * by grace-period timeout, so GameGateway (which owns the Socket.IO server instance) can
 * push the resulting state to the winner.
 */
@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly rooms = new Map<string, GameSession>();
  private readonly sessionIndex = new Map<string, SocketIndexEntry>();
  private readonly socketIndex = new Map<string, SocketIndexEntry>();
  private readonly gracePeriodMs: number;
  private readonly roomCleanupTtlMs: number;
  readonly events = new EventEmitter();

  constructor(@Optional() options?: GameServiceOptions) {
    this.gracePeriodMs = options?.gracePeriodMs ?? GRACE_PERIOD_MS;
    this.roomCleanupTtlMs = options?.roomCleanupTtlMs ?? ROOM_CLEANUP_TTL_MS;
  }

  createRoom(a: { playerId: PlayerId; socketId: string }, b: { playerId: PlayerId; socketId: string }): GameSession {
    const roomId = randomUUID();
    const gameState = createInitialState([a.playerId, b.playerId], Math.random);

    const players: [PlayerSession, PlayerSession] = [
      {
        playerId: a.playerId,
        sessionToken: randomToken(),
        socketId: a.socketId,
        connected: true,
        disconnectTimer: null,
        expired: false,
      },
      {
        playerId: b.playerId,
        sessionToken: randomToken(),
        socketId: b.socketId,
        connected: true,
        disconnectTimer: null,
        expired: false,
      },
    ];

    const room: GameSession = { roomId, gameState, players, cleanupTimer: null };
    this.rooms.set(roomId, room);
    for (const p of players) {
      this.sessionIndex.set(p.sessionToken, { roomId, playerId: p.playerId });
      this.socketIndex.set(p.socketId as string, { roomId, playerId: p.playerId });
    }

    this.logger.log(`room ${roomId} created for players ${a.playerId} and ${b.playerId}`);
    return room;
  }

  getRoom(roomId: string): GameSession | undefined {
    return this.rooms.get(roomId);
  }

  handleMove(socketId: string, intent: MoveIntent): MoveResult {
    const info = this.socketIndex.get(socketId);
    if (!info) return { ok: false, code: 'NOT_IN_ROOM', message: 'socket is not associated with an active room' };

    const room = this.rooms.get(info.roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'room no longer exists' };

    if (room.gameState.status.phase === 'finished') {
      return { ok: false, code: 'GAME_FINISHED', message: 'game has already finished' };
    }

    const validMoves = getValidMoves(room.gameState, info.playerId);
    const matched = findMatchingMove(validMoves, intent);
    if (!matched) {
      const code = diagnoseRejection(room.gameState, info.playerId, intent);
      this.logger.warn(`move rejected in room ${room.roomId}: player ${info.playerId} -> ${code}`);
      return { ok: false, code, message: `move rejected: ${code}` };
    }

    let nextState: GameState;
    try {
      nextState = applyMove(room.gameState, matched);
    } catch (err) {
      this.logger.error(`applyMove threw for a pre-validated move in room ${room.roomId}: ${(err as Error).message}`);
      return { ok: false, code: 'INVALID_ATTACK', message: 'move rejected by game engine' };
    }

    room.gameState = nextState;
    if (nextState.status.phase === 'finished') {
      this.clearDisconnectTimers(room);
      this.scheduleRoomCleanup(room.roomId);
      this.logger.log(`room ${room.roomId} finished (${nextState.status.result})`);
    }

    return { ok: true, room };
  }

  handleDisconnect(socketId: string): DisconnectResult | null {
    const info = this.socketIndex.get(socketId);
    if (!info) return null;

    const room = this.rooms.get(info.roomId);
    if (!room) {
      this.socketIndex.delete(socketId);
      return null;
    }

    const ps = this.findPlayer(room, info.playerId);
    // A newer socket has already superseded this one (duplicate-connection reconnect) —
    // this disconnect event is stale, ignore it.
    if (ps.socketId !== socketId) return null;

    ps.connected = false;
    ps.socketId = null;
    this.socketIndex.delete(socketId);
    this.logger.log(`player ${info.playerId} disconnected from room ${room.roomId}`);

    if (room.gameState.status.phase === 'finished') return null;

    ps.disconnectTimer = setTimeout(() => this.handleGraceExpired(room.roomId, info.playerId), this.gracePeriodMs);

    const opponent = this.findOpponent(room, info.playerId);
    return { roomId: room.roomId, opponentPlayerId: opponent.playerId, opponentSocketId: opponent.socketId };
  }

  reconnect(sessionToken: string, newSocketId: string): ReconnectResult {
    const entry = this.sessionIndex.get(sessionToken);
    if (!entry) return { ok: false, code: 'INVALID_SESSION' };

    const room = this.rooms.get(entry.roomId);
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' };

    const ps = this.findPlayer(room, entry.playerId);
    const previousSocketId = ps.socketId;
    const wasDisconnected = !ps.connected;

    if (ps.disconnectTimer) {
      clearTimeout(ps.disconnectTimer);
      ps.disconnectTimer = null;
    }
    ps.expired = false;
    ps.connected = true;
    ps.socketId = newSocketId;

    if (previousSocketId && previousSocketId !== newSocketId) {
      this.socketIndex.delete(previousSocketId);
    }
    this.socketIndex.set(newSocketId, { roomId: room.roomId, playerId: entry.playerId });

    this.logger.log(`player ${entry.playerId} reconnected to room ${room.roomId}`);

    return {
      ok: true,
      room,
      playerId: entry.playerId,
      wasDisconnected,
      staleSocketId: previousSocketId && previousSocketId !== newSocketId ? previousSocketId : null,
    };
  }

  private handleGraceExpired(roomId: string, playerId: PlayerId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const ps = this.findPlayer(room, playerId);
    if (ps.connected) return; // reconnected in the meantime; defensive, timer should already be cleared

    ps.disconnectTimer = null;
    ps.expired = true;

    if (room.gameState.status.phase === 'finished') return;

    const opponent = this.findOpponent(room, playerId);
    if (opponent.connected) {
      room.gameState = {
        ...room.gameState,
        status: { phase: 'finished', result: 'win', winnerId: opponent.playerId },
      };
      this.logger.log(`room ${roomId}: player ${playerId} forfeited by timeout, winner ${opponent.playerId}`);
      this.scheduleRoomCleanup(roomId);
      this.events.emit('forfeit', { roomId });
    } else if (opponent.expired) {
      this.logger.log(`room ${roomId}: both players failed to reconnect, closing without a winner`);
      this.removeRoom(roomId);
    }
    // else: opponent is also disconnected but their own grace period hasn't elapsed yet.
  }

  private scheduleRoomCleanup(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.cleanupTimer) return;
    room.cleanupTimer = setTimeout(() => {
      this.removeRoom(roomId);
      this.logger.log(`room ${roomId} cleaned up`);
    }, this.roomCleanupTtlMs);
  }

  private clearDisconnectTimers(room: GameSession): void {
    for (const p of room.players) {
      if (p.disconnectTimer) {
        clearTimeout(p.disconnectTimer);
        p.disconnectTimer = null;
      }
    }
  }

  /**
   * Fully removes a room and every index entry that points to it — `sessionIndex` and
   * `socketIndex` entries are otherwise never cleaned up, leaking two Map entries per
   * finished room for the lifetime of the process. Once a room is removed this way, a
   * reconnect attempt with its (now unknown) session token gets `INVALID_SESSION` rather
   * than `ROOM_NOT_FOUND` — the room and its session no longer exist at all, which is a
   * more accurate signal than "the room existed but is gone".
   */
  private removeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const p of room.players) {
      this.sessionIndex.delete(p.sessionToken);
      if (p.socketId) this.socketIndex.delete(p.socketId);
    }
    this.rooms.delete(roomId);
  }

  /** Clears every pending timer across all rooms — called by Nest on app shutdown so no
   *  disconnect/cleanup timer keeps the process (or a test worker) alive past teardown. */
  onModuleDestroy(): void {
    for (const room of this.rooms.values()) {
      this.clearDisconnectTimers(room);
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
    }
  }

  private findPlayer(room: GameSession, playerId: PlayerId): PlayerSession {
    const ps = room.players.find((p) => p.playerId === playerId);
    if (!ps) throw new Error(`player ${playerId} is not part of room ${room.roomId}`);
    return ps;
  }

  private findOpponent(room: GameSession, playerId: PlayerId): PlayerSession {
    const ps = room.players.find((p) => p.playerId !== playerId);
    if (!ps) throw new Error(`room ${room.roomId} has no opponent for ${playerId}`);
    return ps;
  }
}
