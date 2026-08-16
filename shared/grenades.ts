/**
 * @mechanic throwable-grenades
 * @mechanic knockback
 * @tradeoff cook-vs-safety (longer cook = less air time, risk of self-blast)
 */
import { GRAVITY, PLAYER } from './constants.js';

export type NadeKind = 'frag' | 'cluster' | 'sting';

export const NADE_KINDS: NadeKind[] = ['frag', 'cluster', 'sting'];

export function isNadeKind(v: string): v is NadeKind {
  return v === 'frag' || v === 'cluster' || v === 'sting';
}

export const NADE = {
  frag: { fuseMs: 2000, blastRadius: 128, blastDamage: 55, knockback: 1 },
  cluster: { fuseMs: 2000, blastRadius: 62, blastDamage: 26, knockback: 0.7, children: 5 },
  sting: { fuseMs: 1800, blastRadius: 88, blastDamage: 16, knockback: 0.45, pellets: 12, pelletDamage: 10 },
} as const;

export const GRENADE = {
  /** Full fuse from pin pull to boom. */
  fuseMs: 2000,
  /** Floor so a max-cook throw still leaves the hand. */
  minFuseMs: 60,
  /** Self-blast uses same radius/damage as thrown. */
  throwSpeed: PLAYER.grenadeSpeed,
  /** Light air drag / sec — old 40/sec killed vx in ~50ms so nades dumped at feet. */
  airDrag: 0.35,
  /** Mixed into aim so a ground-click still lobs instead of planting. */
  loft: 0.5,
  /** Clamp downward aim (positive y) before loft. */
  maxDownAim: 0.22,
  bodyVxInherit: 0.35,
  bodyVyInherit: 0.2,
  spawnForward: 18,
  spawnLift: 10,
  windCoupling: 0.7,
  blastRadius: PLAYER.grenadeBlastRadius,
  blastDamage: PLAYER.grenadeDamage,
  /** Impulse scale at point-blank. */
  blastKnockback: 500,
  blastLift: 190,
  bounce: 0.45,
  bounceFriction: 0.85,
  clusterChildFuseMs: 320,
} as const;

/** Aim dir for a short lob. Downward clicks still go forward. */
export function grenadeThrowDir(
  aimX: number,
  aimY: number,
  facing = 1,
): { ax: number; ay: number } {
  const len = Math.hypot(aimX, aimY) || 1;
  let ax = aimX / len;
  let ay = aimY / len;
  if (ay > GRENADE.maxDownAim) {
    const side = Math.sign(ax || facing) || 1;
    ax = side * Math.max(Math.abs(ax), 0.55);
    ay = GRENADE.maxDownAim;
  }
  ay -= GRENADE.loft;
  const n = Math.hypot(ax, ay) || 1;
  return { ax: ax / n, ay: ay / n };
}

export function grenadeThrowOrigin(
  x: number,
  y: number,
  aimX: number,
  aimY: number,
  facing = 1,
): { x: number; y: number } {
  const { ax } = grenadeThrowDir(aimX, aimY, facing);
  return { x: x + ax * GRENADE.spawnForward, y: y - GRENADE.spawnLift };
}

export function grenadeThrowVelocity(
  aimX: number,
  aimY: number,
  bodyVx: number,
  bodyVy: number,
  facing = 1,
): { vx: number; vy: number } {
  const { ax, ay } = grenadeThrowDir(aimX, aimY, facing);
  return {
    vx: ax * GRENADE.throwSpeed + bodyVx * GRENADE.bodyVxInherit,
    vy: ay * GRENADE.throwSpeed + bodyVy * GRENADE.bodyVyInherit,
  };
}

export function stepGrenadeFlight(
  vx: number,
  vy: number,
  dt: number,
  windVx = 0,
): { vx: number; vy: number } {
  vy += GRAVITY * dt;
  vx *= Math.max(0, 1 - GRENADE.airDrag * dt);
  vx += windVx * GRENADE.windCoupling * dt;
  return { vx, vy };
}

export const KNOCKBACK = {
  /** Per damage point from bullets. */
  bulletPerDamage: 3.2,
  bulletBase: 28,
  bulletLift: 0.35,
  maxBullet: 220,
} as const;

/** Fuse left after cooking `cookedMs`. */
export function remainingFuse(cookedMs: number, fuseMs = GRENADE.fuseMs): number {
  return Math.max(GRENADE.minFuseMs, fuseMs - Math.max(0, cookedMs));
}

export function blastImpulse(
  bombX: number,
  bombY: number,
  targetX: number,
  targetY: number,
  falloff: number,
  knockbackScale = 1,
): { vx: number; vy: number } {
  const dx = targetX - bombX;
  const dy = targetY - bombY;
  const len = Math.hypot(dx, dy) || 1;
  const f = Math.max(0, Math.min(1, falloff)) * knockbackScale;
  return {
    vx: (dx / len) * GRENADE.blastKnockback * f,
    vy: (dy / len) * GRENADE.blastKnockback * f * 0.85 - GRENADE.blastLift * f,
  };
}

export function bulletImpulse(
  dirX: number,
  dirY: number,
  damage: number,
): { vx: number; vy: number } {
  const len = Math.hypot(dirX, dirY) || 1;
  const ax = dirX / len;
  const ay = dirY / len;
  const mag = Math.min(
    KNOCKBACK.maxBullet,
    KNOCKBACK.bulletBase + damage * KNOCKBACK.bulletPerDamage,
  );
  return {
    vx: ax * mag,
    vy: ay * mag * KNOCKBACK.bulletLift - mag * 0.12,
  };
}
