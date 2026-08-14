import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from '../../shared/constants';
import { OBJECTIVES, TEAM, type MatchMode } from '../../shared/match';
import type { GameState, PlayerState } from '../../shared/schema';

/**
 * Screen-space radar: soldiers, flags, hill, local pip.
 */
export class MiniMap {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly w = 176;
  private readonly h = 84;
  private readonly pad = 8;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(118);
  }

  draw(state: GameState, meId: string, mode: MatchMode): void {
    const g = this.gfx;
    g.clear();
    const x = VIEW_WIDTH - this.w - 14;
    const y = VIEW_HEIGHT - this.h - 28;
    g.fillStyle(0x0b1020, 0.72);
    g.fillRoundedRect(x, y, this.w, this.h, 4);
    g.lineStyle(1, 0x7a8fb3, 0.4);
    g.strokeRoundedRect(x, y, this.w, this.h, 4);

    const sx = (this.w - this.pad * 2) / GAME_WIDTH;
    const sy = (this.h - this.pad * 2) / GAME_HEIGHT;
    const mapX = (wx: number) => x + this.pad + wx * sx;
    const mapY = (wy: number) => y + this.pad + wy * sy;

    if (mode === 'ctf') {
      g.fillStyle(0x60a5fa, 0.95);
      g.fillTriangle(mapX(state.flagAx), mapY(state.flagAy) - 3, mapX(state.flagAx) - 3, mapY(state.flagAy) + 3, mapX(state.flagAx) + 3, mapY(state.flagAy) + 3);
      g.fillStyle(0xf87171, 0.95);
      g.fillTriangle(mapX(state.flagBx), mapY(state.flagBy) - 3, mapX(state.flagBx) - 3, mapY(state.flagBy) + 3, mapX(state.flagBx) + 3, mapY(state.flagBy) + 3);
    }
    if (mode === 'point') {
      g.fillStyle(state.pointOwner ? 0xfbbf24 : 0x94a3b8, 0.9);
      g.fillCircle(mapX(OBJECTIVES.point.x), mapY(OBJECTIVES.point.y), 4);
    }
    if (mode === 'infil') {
      g.fillStyle(0xfbbf24, 0.9);
      g.fillRect(mapX(OBJECTIVES.infil.x) - 3, mapY(OBJECTIVES.infil.y) - 3, 6, 6);
    }

    state.players?.forEach((p: PlayerState, id: string) => {
      if (!p.alive && id !== meId) return;
      if (p.bonus === 'predator' && id !== meId) return;
      const color =
        id === meId
          ? 0xe8eefc
          : p.team === TEAM.alpha
            ? 0x60a5fa
            : p.team === TEAM.bravo
              ? 0xf87171
              : p.isBot
                ? 0xf87171
                : 0x4ade80;
      g.fillStyle(color, p.alive ? 1 : 0.35);
      g.fillCircle(mapX(p.x), mapY(p.y), id === meId ? 3.2 : 2.2);
    });
  }
}
