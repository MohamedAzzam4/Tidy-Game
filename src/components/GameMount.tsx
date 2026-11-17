'use client';

import { useEffect, useRef } from 'react';

/**
 * Mounts the Phaser game as a full-viewport canvas. Client-only: the component
 * is loaded with next/dynamic (ssr: false) from page.tsx.
 */
export default function GameMount() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;

    void (async () => {
      const Phaser = (await import('phaser')).default;
      const { BootScene } = await import('@/game/scenes/BootScene');
      const { GameScene } = await import('@/game/scenes/GameScene');
      const { UIScene } = await import('@/game/scenes/UIScene');
      const { RepairScene } = await import('@/game/scenes/RepairScene');
      if (cancelled || !hostRef.current) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        backgroundColor: '#3a2314',
        input: { touch: true }, // headless browsers report no touch device; the game supports touch anyway
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: '100%',
          height: '100%',
        },
        render: { roundPixels: true },
        scene: [BootScene, GameScene, UIScene, RepairScene],
      });
      gameRef.current = game;
      (window as unknown as { __phaserGame: unknown }).__phaserGame = game;

      // debug + autotest hooks (dev-only, harmless in production)
      const { installDebug } = await import('@/game/debug');
      installDebug(game);
      const params = new URLSearchParams(window.location.search);
      if (params.has('autotest')) {
        const { runAutotest } = await import('@/game/autotest');
        void runAutotest(game, params.get('seed') ?? undefined);
      }
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-label="Tidy Tapes game canvas"
      style={{ width: '100vw', height: '100vh', overflow: 'hidden', touchAction: 'none' }}
    />
  );
}
