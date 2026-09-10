'use client';

import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { ClientGameState } from '@game/game-core';
import type { MoveIntent } from '@/lib/protocol';
import { DurakScene, SCENE_HEIGHT, SCENE_KEY, SCENE_WIDTH, type BridgeRef, type DurakBridge } from '@/game/DurakScene';

// React StrictMode's mount->cleanup->mount runs this effect twice synchronously in dev.
// Phaser.Game boots (and inserts its <canvas>) asynchronously and can't be cancelled
// mid-flight, so naively destroying on cleanup and creating fresh on remount briefly
// leaves two live Phaser.Game instances fighting over the same container. Instead, the
// second (real) mount reuses the game the first (StrictMode-phantom) mount already
// started, so at most one Phaser.Game — and one <canvas> — ever exists per container.
const pendingGames = new WeakMap<HTMLDivElement, { game: Phaser.Game; epoch: number }>();

/**
 * Owns the Phaser.Game lifecycle only. React still owns the socket connection and the
 * authoritative `ClientGameState` (via SocketProvider) — this component just hands the
 * latest state to the scene for rendering and forwards click-driven intents back up.
 */
export function PhaserGameCanvas({ state, onMove }: { state: ClientGameState; onMove: (intent: MoveIntent) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<DurakBridge>({ state, onMove, sceneRef: null });
  bridgeRef.current.onMove = onMove;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bridge = bridgeRef.current;

    let entry = pendingGames.get(container);
    if (!entry) {
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        transparent: true,
        banner: false,
        audio: { noAudio: true },
      });
      game.scene.add(SCENE_KEY, DurakScene, false);
      entry = { game, epoch: 0 };
      pendingGames.set(container, entry);
    }
    const { game } = entry;
    entry.epoch += 1;
    const myEpoch = entry.epoch;

    let live = true;
    game.events.once(Phaser.Core.Events.READY, () => {
      if (!live) return;
      game.scene.start(SCENE_KEY, { bridgeRef: bridgeRef as BridgeRef });
    });

    return () => {
      live = false;
      bridge.sceneRef = null;
      // Deferred so a synchronous StrictMode remount can bump the epoch first and
      // claim the still-live game instead of having it destroyed out from under it.
      queueMicrotask(() => {
        if (pendingGames.get(container)?.epoch === myEpoch) {
          pendingGames.delete(container);
          game.destroy(true);
        }
      });
    };
  }, []);

  useEffect(() => {
    bridgeRef.current.state = state;
    bridgeRef.current.sceneRef?.applyState(state);
  }, [state]);

  return <div ref={containerRef} className="game-canvas" />;
}
