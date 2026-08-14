import Phaser from 'phaser';
import { PLAYER, VIEW_HEIGHT, VIEW_WIDTH } from '../../../shared/constants';

const BLOOD = [0x8b0000, 0xb91c1c, 0x7f1d1d, 0xdc2626, 0x4a0e0e];
const FLESH = [0xc45c5c, 0x9a3412, 0xa16207, 0x7c2d12, 0x881337];
const FIRE = [0xfff7ed, 0xfde68a, 0xfbbf24, 0xf97316, 0xef4444, 0x7c2d12];
const SMOKE = [0x64748b, 0x475569, 0x334155, 0x1e293b];

/**
 * Soldat-ish viscera + blast FX (client cosmetic only).
 */
export class VisceraFx {
  private readonly decals: Phaser.GameObjects.GameObject[] = [];
  private static readonly MAX_DECALS = 90;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Small blood mist + droplets from a gunshot. */
  bulletWound(x: number, y: number, dirX = 0, dirY = 0): void {
    const aim = Math.atan2(dirY || 1, dirX || (Math.random() - 0.5));
    const spray = aim + Math.PI; // exit wound bias

    for (let i = 0; i < 10; i++) {
      const a = spray + (Math.random() - 0.5) * 1.2;
      const spd = 40 + Math.random() * 140;
      this.blob(x, y, 'blood', BLOOD, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 40,
        life: 280 + Math.random() * 220,
        scale: 0.35 + Math.random() * 0.7,
        gravity: 520,
      });
    }
    for (let i = 0; i < 3; i++) {
      const a = spray + (Math.random() - 0.5) * 0.8;
      const spd = 60 + Math.random() * 100;
      this.blob(x, y, 'gib', FLESH, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 80,
        life: 420 + Math.random() * 200,
        scale: 0.5 + Math.random() * 0.6,
        gravity: 900,
        spin: true,
      });
    }
  }

  /** Full-body gibs when someone dies messily. */
  deathGibs(x: number, y: number, vx = 0, vy = 0): void {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 220;
      this.blob(x, y, 'blood', BLOOD, {
        vx: Math.cos(a) * spd + vx * 0.15,
        vy: Math.sin(a) * spd + vy * 0.1 - 60,
        life: 400 + Math.random() * 400,
        scale: 0.4 + Math.random() * 0.9,
        gravity: 600,
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 100 + Math.random() * 280;
      this.blob(x, y, 'gib', FLESH, {
        vx: Math.cos(a) * spd + vx * 0.2,
        vy: Math.sin(a) * spd + vy * 0.15 - 120,
        life: 700 + Math.random() * 500,
        scale: 0.55 + Math.random() * 1.1,
        gravity: 980,
        spin: true,
      });
    }
  }

  /** Blood burst from blast proximity. */
  blastWound(x: number, y: number, fromX: number, fromY: number, amount: number): void {
    const a = Math.atan2(y - fromY, x - fromX);
    const n = Math.min(14, 4 + Math.floor(amount / 8));
    for (let i = 0; i < n; i++) {
      const ang = a + (Math.random() - 0.5) * 1.4;
      const spd = 50 + Math.random() * 180;
      this.blob(x, y, i % 3 === 0 ? 'gib' : 'blood', i % 3 === 0 ? FLESH : BLOOD, {
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 50,
        life: 350 + Math.random() * 300,
        scale: 0.4 + Math.random() * 0.8,
        gravity: 700,
        spin: i % 3 === 0,
      });
    }
  }

  wallSpark(x: number, y: number): void {
    const dust = [0xfde68a, 0xd6d3d1, 0xa8a29e, 0x78716c];
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add.image(x, y, 'particle');
      p.setTint(dust[i % dust.length]!);
      p.setDepth(16);
      p.setScale(0.28 + Math.random() * 0.4);
      this.scene.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-14, 14),
        y: y + Phaser.Math.Between(-14, 14),
        alpha: 0,
        scale: 0.08,
        duration: 90 + Math.random() * 90,
        onComplete: () => p.destroy(),
      });
    }
    const chip = this.scene.add.image(x, y, 'particle');
    chip.setTint(0x44403c);
    chip.setDepth(3);
    chip.setScale(0.45 + Math.random() * 0.25);
    chip.setAlpha(0.55);
    this.scene.tweens.add({
      targets: chip,
      alpha: 0,
      delay: 420,
      duration: 380,
      onComplete: () => chip.destroy(),
    });
  }

  /** Screen-space blood on the lens after taking damage. */
  lensBlood(amount: number): void {
    const n = Math.min(10, 2 + Math.floor(amount / 7));
    for (let i = 0; i < n; i++) {
      const edge = Math.random();
      const x =
        edge < 0.5
          ? 20 + Math.random() * 220
          : VIEW_WIDTH - 20 - Math.random() * 220;
      const y = 16 + Math.random() * (VIEW_HEIGHT - 32);
      const tex = this.scene.textures.exists('fx_blood') ? 'fx_blood' : 'particle';
      const p = this.scene.add.image(x, y, tex);
      p.setScrollFactor(0);
      p.setDepth(70);
      p.setTint(BLOOD[Math.floor(Math.random() * BLOOD.length)]!);
      p.setRotation(Math.random() * Math.PI * 2);
      p.setScale(tex === 'fx_blood' ? 0.18 + Math.random() * 0.28 : 1.4 + Math.random() * 2.2);
      p.setAlpha(0.55 + Math.min(0.35, amount / 80));
      this.scene.tweens.add({
        targets: p,
        alpha: 0,
        scale: p.scale * 1.15,
        duration: 420 + Math.random() * 380,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Corpse stain that lingers after a kill. */
  bloodPool(x: number, y: number): void {
    this.placeDecal(x, y, 1.6, 16000);
    this.placeDecal(x + 8, y + 3, 1.1, 14000);
    this.placeDecal(x - 7, y + 2, 0.9, 14000);
    for (let i = 0; i < 6; i++) {
      this.placeDecal(
        x + (Math.random() - 0.5) * 28,
        y + (Math.random() - 0.5) * 10,
        0.4 + Math.random() * 0.5,
        11000 + Math.random() * 5000,
      );
    }
  }

  private placeDecal(x: number, y: number, scale: number, life: number): void {
    while (this.decals.length >= VisceraFx.MAX_DECALS) {
      this.decals.shift()?.destroy();
    }
    const tex = this.scene.textures.exists('fx_blood') ? 'fx_blood' : 'particle';
    const p = this.scene.add.image(x, y, tex);
    p.setDepth(3);
    p.setTint(BLOOD[Math.floor(Math.random() * BLOOD.length)]!);
    p.setRotation(Math.random() * Math.PI);
    p.setScale(tex === 'fx_blood' ? scale * 0.16 : scale * 1.4);
    p.setAlpha(0.72);
    this.decals.push(p);
    this.scene.tweens.add({
      targets: p,
      alpha: 0,
      delay: Math.max(400, life - 2200),
      duration: 2200,
      onComplete: () => {
        const i = this.decals.indexOf(p);
        if (i >= 0) this.decals.splice(i, 1);
        p.destroy();
      },
    });
  }

  /** Brief cone flash at the muzzle for a shotgun blast. */
  shotgunMuzzle(x: number, y: number, aimX: number, aimY: number): void {
    const len = Math.hypot(aimX, aimY) || 1;
    const ax = aimX / len;
    const ay = aimY / len;
    const base = Math.atan2(ay, ax);
    const g = this.scene.add.graphics().setDepth(10);
    const state = { a: 1 };
    const paint = () => {
      g.clear();
      for (let i = 0; i < 7; i++) {
        const u = (i / 6) * 2 - 1;
        const ang = base + u * 0.16;
        const reach = 28 + Math.abs(u) * 10;
        g.lineStyle(2.4 - Math.abs(u), 0xfdba74, state.a * (0.55 - Math.abs(u) * 0.2));
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(ang) * reach, y + Math.sin(ang) * reach);
        g.strokePath();
      }
      g.fillStyle(0xfff7ed, state.a * 0.8);
      g.fillCircle(x, y, 3.5);
    };
    paint();
    this.scene.tweens.add({
      targets: state,
      a: 0,
      duration: 90,
      ease: 'Quad.easeOut',
      onUpdate: paint,
      onComplete: () => g.destroy(),
    });
  }

  /** Fat Soldat-style grenade / RPG blast. */
  explosion(x: number, y: number): void {
    const hasArt = this.scene.textures.exists('fx_explosion');
    if (hasArt) {
      const blast = this.scene.add.image(x, y, 'fx_explosion');
      blast.setDepth(22);
      blast.setScale(0.35);
      blast.setAlpha(0.95);
      this.scene.tweens.add({
        targets: blast,
        scale: 1.15,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.Out',
        onComplete: () => blast.destroy(),
      });
    } else {
      const flash = this.scene.add.image(x, y, 'particle');
      flash.setTint(0xfff7ed);
      flash.setDepth(22);
      flash.setScale(2.5);
      this.scene.tweens.add({
        targets: flash,
        scale: 8,
        alpha: 0,
        duration: 160,
        ease: 'Cubic.Out',
        onComplete: () => flash.destroy(),
      });
    }

    // Fire ring
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
      const spd = 90 + Math.random() * 160;
      this.blob(x, y, 'particle', FIRE, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 30,
        life: 220 + Math.random() * 200,
        scale: 0.7 + Math.random() * 1.4,
        gravity: 40,
      });
    }

    // Smoke puff
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 30 + Math.random() * 90;
      this.blob(x, y, 'smoke', SMOKE, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 40 - Math.random() * 40,
        life: 500 + Math.random() * 400,
        scale: 1.2 + Math.random() * 2,
        gravity: -40,
      });
    }

    // Debris chunks
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const spd = 120 + Math.random() * 260;
      this.blob(x, y, 'gib', [0x78716c, 0x57534e, 0xa8a29e, 0x44403c], {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 100,
        life: 600 + Math.random() * 400,
        scale: 0.5 + Math.random() * 0.9,
        gravity: 1100,
        spin: true,
      });
    }

    // Shock ring
    const ring = this.scene.add.graphics().setDepth(21);
    const maxR = PLAYER.grenadeBlastRadius * 1.15;
    const ringState = { r: 8, a: 0.85 };
    const ringTick = (_t: number, delta: number) => {
      ringState.r += (maxR - 8) * (delta / 280);
      ringState.a -= 0.85 * (delta / 280);
      ring.clear();
      if (ringState.a <= 0 || ringState.r >= maxR) {
        this.scene.events.off('update', ringTick);
        ring.destroy();
        return;
      }
      ring.lineStyle(2, 0xf97316, Math.max(0, ringState.a));
      ring.strokeCircle(x, y, ringState.r);
    };
    this.scene.events.on('update', ringTick);
  }

  private blob(
    x: number,
    y: number,
    key: string,
    palette: number[],
    opts: {
      vx: number;
      vy: number;
      life: number;
      scale: number;
      gravity: number;
      spin?: boolean;
    },
  ): void {
    const tex =
      key === 'blood' && this.scene.textures.exists('fx_blood') ? 'fx_blood' : key;
    const p = this.scene.add.image(x, y, tex);
    p.setTint(palette[Math.floor(Math.random() * palette.length)]!);
    p.setDepth(18);
    p.setScale(tex === 'fx_blood' ? opts.scale * 0.12 : opts.scale);
    p.setRotation(Math.random() * Math.PI * 2);
    p.setAlpha(0.95);

    const state = {
      x,
      y,
      vx: opts.vx,
      vy: opts.vy,
      life: opts.life,
      max: opts.life,
    };

    const tick = (_time: number, delta: number) => {
      if (!p.active) {
        this.scene.events.off('update', tick);
        return;
      }
      const dt = delta / 1000;
      state.vy += opts.gravity * dt;
      state.vx *= 1 - 1.2 * dt;
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      state.life -= delta;
      p.setPosition(state.x, state.y);
      p.setAlpha(Math.max(0, state.life / state.max));
      if (opts.spin) p.rotation += dt * (state.vx > 0 ? 8 : -8);
      if (state.life <= 0) {
        this.scene.events.off('update', tick);
        p.destroy();
      }
    };
    this.scene.events.on('update', tick);
  }
}
