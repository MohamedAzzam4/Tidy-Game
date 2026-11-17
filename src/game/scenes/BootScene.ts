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
    this.scene.start('Game');
  }
}
