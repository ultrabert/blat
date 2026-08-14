/**
 * @mechanic ballistic-projectiles
 * @depends arcade-physics-core
 * @tradeoff muzzle-vs-drop (faster = flatter arc, stronger inheritance)
 * @tradeoff drag-vs-range (power decay reduces long-range damage)
 * @test ballistics-drop, ballistics-inherit, ballistics-damage-falloff
 */
import { GRAVITY, PLAYER } from './constants.js';

export const BALLISTICS = {
  /** Fraction of player GRAVITY applied to bullets (grenades use full GRAVITY). */
  gravityScale: 0.42,
  /** Fraction of shooter velocity added to muzzle velocity. */
  inherit: 0.4,
  /** Exponential decay per second (speed + damage power). */
  dragPerSec: 0.22,
  /** Reference muzzle speed for damage scaling. */
  muzzleSpeed: PLAYER.bulletSpeed,
  baseDamage: PLAYER.bulletDamage,
  /** Floor on damage scale so far shots still tick. */
  minDamageScale: 0.4,
  lifeMs: 1400,
} as const;

export type BallisticBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Damage energy; decays with drag. Set at spawn from launch speed. */
  power: number;
};

export function muzzleVelocity(
  aimX: number,
  aimY: number,
  shooterVx: number,
  shooterVy: number,
  muzzleSpeed: number = BALLISTICS.muzzleSpeed,
  inherit: number = BALLISTICS.inherit,
): { vx: number; vy: number; power: number } {
  const len = Math.hypot(aimX, aimY) || 1;
  const ax = aimX / len;
  const ay = aimY / len;
  const vx = ax * muzzleSpeed + shooterVx * inherit;
  const vy = ay * muzzleSpeed + shooterVy * inherit;
  return {
    vx,
    vy,
    power: Math.hypot(vx, vy) / muzzleSpeed,
  };
}

/**
 * Integrate one ballistic step (drag → gravity → move).
 * Mutates body; returns segment for swept collision.
 */
export function stepBallistic(
  body: BallisticBody,
  dt: number,
  gravityScale: number = BALLISTICS.gravityScale,
  dragPerSec: number = BALLISTICS.dragPerSec,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = body.x;
  const y0 = body.y;

  const damp = Math.exp(-dragPerSec * dt);
  body.power *= damp;
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > 1) {
    body.vx *= damp;
    body.vy *= damp;
  }

  body.vy += GRAVITY * gravityScale * dt;

  const x1 = body.x + body.vx * dt;
  const y1 = body.y + body.vy * dt;
  body.x = x1;
  body.y = y1;
  return { x0, y0, x1, y1 };
}

/** Damage from remaining power (inheritance can start power > 1). */
export function ballisticDamage(
  power: number,
  base: number = BALLISTICS.baseDamage,
  minScale: number = BALLISTICS.minDamageScale,
): number {
  const scale = Math.max(minScale, Math.min(1.35, power));
  return Math.round(base * scale);
}

/** Closed-form drop estimate for tests (no drag): 0.5 * g * scale * t^2 */
export function expectedDrop(timeSec: number, gravityScale = BALLISTICS.gravityScale): number {
  return 0.5 * GRAVITY * gravityScale * timeSec * timeSec;
}
