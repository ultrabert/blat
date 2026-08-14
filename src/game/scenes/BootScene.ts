import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../../shared/constants';

import { ALL_SKIN_PART_FILES } from '../skins';

const ART = [
  'terrain_dirt',
  'terrain_edge',
  'prop_crate',
  'prop_sandbags',
  'prop_ruin',
  'bg_scrub',
  'fx_explosion',
  'fx_blood',
  'icon_rifle',
  'icon_sniper',
  'icon_shotgun',
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const key of ART) {
      this.load.image(key, `/assets/${key}.png`);
    }
    for (const key of ALL_SKIN_PART_FILES) {
      this.load.image(key, `/assets/skins/${key}.png`);
    }
  }

  create(): void {
    this.createProceduralTextures();
    // Prefer painted blood/explosion when loaded
    if (this.textures.exists('fx_blood') && !this.textures.exists('blood_art')) {
      // Alias used by VisceraFx — keep procedural 'blood' as fallback droplets
    }
    this.scene.start('Game');
  }

  private createProceduralTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 });

    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, PLAYER.width, PLAYER.height, 4);
    g.fillStyle(0x111827, 1);
    g.fillCircle(PLAYER.width * 0.35, 12, 3);
    g.fillCircle(PLAYER.width * 0.65, 12, 3);
    g.generateTexture('soldier', PLAYER.width, PLAYER.height);
    g.clear();

    // Fallback platform (used if art missing)
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
    g.clear();

    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 5, 4);
    g.fillTriangle(4, 0, 1, 5, 7, 5);
    g.generateTexture('blood', 8, 10);
    g.clear();

    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(1, 2, 10, 8, 3);
    g.fillCircle(3, 3, 3);
    g.fillCircle(10, 8, 2.5);
    g.generateTexture('gib', 14, 12);
    g.clear();

    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(8, 8, 7);
    g.fillCircle(4, 9, 5);
    g.fillCircle(12, 7, 5);
    g.generateTexture('smoke', 16, 16);
    g.clear();

    g.fillStyle(0x6b7280, 1);
    g.fillRect(0, 0, 32, 40);
    g.fillStyle(0x9ca3af, 1);
    g.fillRect(0, 0, 32, 5);
    g.fillStyle(0x4b5563, 1);
    g.fillRect(0, 35, 32, 5);
    g.generateTexture('cover', 32, 40);
    g.clear();

    if (!this.textures.exists('bg_cloud')) {
      g.fillStyle(0xdbeafe, 0.9);
      g.fillCircle(28, 22, 16);
      g.fillCircle(44, 20, 18);
      g.fillCircle(60, 24, 14);
      g.fillCircle(18, 26, 12);
      g.generateTexture('bg_cloud', 80, 44);
      g.clear();
    }
    if (!this.textures.exists('prop_barrel')) {
      g.fillStyle(0x7c2d12, 1);
      g.fillRoundedRect(6, 4, 20, 28, 4);
      g.fillStyle(0x9a3412, 1);
      g.fillRect(6, 10, 20, 4);
      g.fillRect(6, 22, 20, 4);
      g.fillStyle(0x1c1917, 1);
      g.fillRect(6, 4, 20, 3);
      g.generateTexture('prop_barrel', 32, 36);
      g.clear();
    }
    if (!this.textures.exists('prop_antenna')) {
      g.fillStyle(0x64748b, 1);
      g.fillRect(14, 8, 3, 40);
      g.fillStyle(0x94a3b8, 1);
      g.fillTriangle(8, 10, 16, 0, 24, 10);
      g.fillCircle(16, 8, 4);
      g.generateTexture('prop_antenna', 32, 52);
      g.clear();
    }
    if (!this.textures.exists('prop_flag')) {
      g.fillStyle(0xcbd5e1, 1);
      g.fillRect(6, 4, 3, 40);
      g.fillStyle(0xdc2626, 1);
      g.fillTriangle(9, 6, 30, 14, 9, 22);
      g.generateTexture('prop_flag', 32, 48);
      g.clear();
    }
    g.destroy();
  }
}
