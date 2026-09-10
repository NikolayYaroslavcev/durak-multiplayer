'use client';

import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { ClientGameState } from '@game/game-core';
import type { MoveIntent } from '@/lib/protocol';
import { DurakScene, SCENE_HEIGHT, SCENE_KEY, SCENE_WIDTH, type BridgeRef, type DurakBridge } from '@/game/DurakScene';

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
    if (!containerRef.current) return;
    const bridge = bridgeRef.current;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      transparent: true,
      banner: false,
      audio: { noAudio: true },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
    game.scene.add(SCENE_KEY, DurakScene, false);
    game.events.once(Phaser.Core.Events.READY, () => {
      game.scene.start(SCENE_KEY, { bridgeRef: bridgeRef as BridgeRef });
    });

    return () => {
      bridge.sceneRef = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    bridgeRef.current.state = state;
    bridgeRef.current.sceneRef?.applyState(state);
  }, [state]);

  return <div ref={containerRef} className="game-canvas" />;
}
