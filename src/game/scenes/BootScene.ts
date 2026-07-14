import Phaser from 'phaser';
import { COLORS, PLAYER } from '../constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.createTextures();
    this.scene.start('Game');
  }

  private createTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 });

    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, PLAYER.width, PLAYER.height, 4);
    g.fillStyle(0x111827, 1);
    g.fillCircle(PLAYER.width * 0.35, 12, 3);
    g.fillCircle(PLAYER.width * 0.65, 12, 3);
    g.generateTexture('soldier', PLAYER.width, PLAYER.height);
    g.clear();

    g.fillStyle(COLORS.platform, 1);
    g.fillRect(0, 0, 64, 24);
    g.fillStyle(COLORS.platformEdge, 1);
    g.fillRect(0, 0, 64, 4);
    g.generateTexture('platform', 64, 24);
    g.clear();

    g.fillStyle(COLORS.bullet, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('bullet', 8, 8);
    g.clear();

    g.fillStyle(COLORS.grenade, 1);
    g.fillCircle(7, 7, 7);
    g.fillStyle(0x1f2937, 1);
    g.fillRect(5, 0, 4, 4);
    g.generateTexture('grenade', 14, 14);
    g.clear();

    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(3, 3, 3);
    g.generateTexture('particle', 6, 6);
    g.destroy();
  }
}
