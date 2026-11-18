import Phaser from 'phaser';
import { buildAllTextures } from '../textures';
import { audio } from '../audio';

/**
 * Loads the uploaded starter-art pack (atlas pairs, walnut tile, rim, SVG light
 * layers) with RELATIVE paths, then builds the procedural fallback textures and
 * starts the game + HUD scenes. If any pack file fails to load, the scenes fall
 * back to procedural art (every consumer checks `textures.exists` first).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    const A = 'tidy-art/';
    try {
      this.load.atlas('tt-cassette', `${A}cassette-teal-star.png`, `${A}cassette-teal-star.json`);
      this.load.atlas('tt-cabinet', `${A}cabinet-walnut.png`, `${A}cabinet-walnut.json`);
      this.load.atlas('tt-lamp', `${A}lamp-brass.png`, `${A}lamp-brass.json`);
      this.load.atlas('tt-rim', `${A}table-rim.png`, `${A}table-rim.json`);
      this.load.image('walnut-tile', `${A}walnut-tile.png`);
      this.load.svg('lamp-pool', `${A}lamp-pool.svg`, { width: 512, height: 512 });
      this.load.svg('bulb-halo', `${A}bulb-halo.svg`, { width: 256, height: 256 });
      this.load.svg('contact-shadow', `${A}contact-shadow.svg`, { width: 512, height: 512 });
    } catch {
      // never let a missing optional asset block the game
    }
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn('[tidy-tapes] art asset failed (fallback art will be used):', file.key);
    });
  }

  create(): void {
    buildAllTextures(this);
    audio.unlock(); // best-effort; real unlock happens on first gesture
    // v1 bug fixed here: the HUD scene was never started, so the game shipped
    // without its top bar, chips, tray or panels. Launch Game AND UI together.
    this.scene.launch('Game');
    this.scene.launch('UI');
    this.scene.stop(); // boot has nothing left to render
  }
}
