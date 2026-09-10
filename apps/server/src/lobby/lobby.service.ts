import { Injectable, Logger } from '@nestjs/common';

type QueueEntry = {
  playerId: string;
  socketId: string;
};

export class AlreadyInQueueError extends Error {}

/**
 * In-memory 1v1 matchmaking queue.
 *
 * `joinQueue` is intentionally synchronous end-to-end (no `await` between reading and
 * mutating `queue`) so that two near-simultaneous `join_queue` events — handled one at a
 * time by Node's single-threaded event loop — can never both observe an empty queue and
 * both end up waiting, or both pop the same opponent.
 */
@Injectable()
export class LobbyService {
  private readonly logger = new Logger(LobbyService.name);
  private readonly queue: QueueEntry[] = [];

  /**
   * Returns the waiting opponent if one was found (and removes them from the queue),
   * or `null` if this player is now the one waiting.
   */
  joinQueue(playerId: string, socketId: string): QueueEntry | null {
    if (this.queue.some((entry) => entry.playerId === playerId)) {
      throw new AlreadyInQueueError();
    }

    const opponent = this.queue.shift();
    if (!opponent) {
      this.queue.push({ playerId, socketId });
      this.logger.log(`player ${playerId} joined matchmaking queue`);
      return null;
    }

    this.logger.log(`matched players ${opponent.playerId} and ${playerId}`);
    return opponent;
  }

  leaveQueue(playerId: string): void {
    const index = this.queue.findIndex((entry) => entry.playerId === playerId);
    if (index === -1) return;
    this.queue.splice(index, 1);
    this.logger.log(`player ${playerId} left matchmaking queue`);
  }
}
