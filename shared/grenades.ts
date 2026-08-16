/**
 * @mechanic throwable-grenades
 * @mechanic knockback
 * @tradeoff cook-vs-safety (longer cook = less air time, risk of self-blast)
 */
import { PLAYER } from './constants.js';

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
  blastRadius: PLAYER.grenadeBlastRadius,
  blastDamage: PLAYER.grenadeDamage,
  /** Impulse scale at point-blank. */
  blastKnockback: 500,
  blastLift: 190,
  bounce: 0.45,
  bounceFriction: 0.85,
  clusterChildFuseMs: 320,
} as const;

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
