import Phaser from 'phaser';
import { buildAllTextures } from '../textures';
import { audio } from '../audio';

/** Builds every procedural texture, then starts the game + HUD scenes. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
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
