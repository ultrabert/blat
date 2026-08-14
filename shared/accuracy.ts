/**
 * @mechanic state-accuracy
 * @mechanic recoil
 * @mechanic body-hitboxes
 * @tradeoff accuracy-vs-mobility (speed/jet widen spread)
 * @tradeoff recoil-vs-firerate (spray climbs; crouch recovers faster)
 */
import { PLAYER } from './constants.js';

export const ACCURACY = {
  /** Base half-angle cone (radians) when still on ground. */
  baseSpread: 0.018,
  moveSpread: 0.055,
  airSpread: 0.07,
  jetSpread: 0.09,
  rollSpread: 0.1,
  crouchMult: 0.45,
  /** Upward recoil kick per shot (radians). */
  recoilKick: 0.048,
  recoilKickAuto: 0.055,
  /** Recovery radians/sec. */
  recoilRecover: 0.55,
  recoilRecoverCrouch: 0.85,
  recoilMax: 0.22,
} as const;

export const BODY = {
  /** Fraction of hitbox height (from top): head, then torso, rest legs. */
  headFrac: 0.28,
  torsoFrac: 0.42,
  /** Damage multipliers. */
  head: 1.85,
  torso: 1.0,
  legs: 0.65,
} as const;

export type BodyPart = 'head' | 'torso' | 'legs';

export type AccuracyStance = {
  vx: number;
  vy: number;
  onGround: boolean;
  jetting: boolean;
  crouching: boolean;
  rolling: boolean;
  cannonball?: boolean;
};

/** Deterministic 0..1 from integer seed. */
export function hash01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function stanceSpreadRad(s: AccuracyStance): number {
  let spread: number = ACCURACY.baseSpread;
  const speed = Math.hypot(s.vx, s.vy);
  if (s.rolling || s.cannonball) spread = Math.max(spread, ACCURACY.rollSpread);
  else if (s.jetting) spread = Math.max(spread, ACCURACY.jetSpread);
  else if (!s.onGround) spread = Math.max(spread, ACCURACY.airSpread);
  else if (speed > 40) {
    const t = Math.min(1, (speed - 40) / 280);
    spread = ACCURACY.baseSpread + (ACCURACY.moveSpread - ACCURACY.baseSpread) * t;
  }
  if (s.crouching && s.onGround && !s.rolling) spread *= ACCURACY.crouchMult;
  return spread;
}

function rotate(ax: number, ay: number, rad: number): { x: number; y: number } {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: ax * c - ay * s, y: ax * s + ay * c };
}

/**
 * Apply recoil (up) + random spread. Returns fire direction and new recoil.
 * Positive rotate toward -Y (screen up) for recoil.
 */
export function fireDirection(
  aimX: number,
  aimY: number,
  stance: AccuracyStance,
  recoil: number,
  seed: number,
  mods: {
    spreadMult?: number;
    pelletSpread?: number;
    recoilKick?: number;
    recoilMax?: number;
    /** When false, do not add recoil (extra shotgun pellets). */
    applyRecoil?: boolean;
  } = {},
): { aimX: number; aimY: number; recoil: number } {
  const len = Math.hypot(aimX, aimY) || 1;
  let ax = aimX / len;
  let ay = aimY / len;

  const facing = ax >= 0 ? 1 : -1;
  const kicked = rotate(ax, ay, -recoil * facing);
  ax = kicked.x;
  ay = kicked.y;

  const spreadMult = mods.spreadMult ?? 1;
  const spread = stanceSpreadRad(stance) * spreadMult + (mods.pelletSpread ?? 0);
  const u = hash01(seed) * 2 - 1;
  const v = hash01(seed ^ 0x9e3779b9) * 2 - 1;
  const ang = u * spread;
  const mag = Math.min(1, Math.abs(v)) * spread * 0.35;
  const spreaded = rotate(ax, ay, ang);
  ax = spreaded.x;
  ay = spreaded.y + mag * (ay >= 0 ? 1 : -1) * 0.25;
  const n = Math.hypot(ax, ay) || 1;
  ax /= n;
  ay /= n;

  let nextRecoil = recoil;
  if (mods.applyRecoil !== false) {
    const baseKick = mods.recoilKick ?? ACCURACY.recoilKickAuto;
    const kick = stance.crouching ? baseKick * 0.7 : baseKick;
    const max = mods.recoilMax ?? ACCURACY.recoilMax;
    nextRecoil = Math.min(max, recoil + kick);
  }
  return { aimX: ax, aimY: ay, recoil: nextRecoil };
}

/**
 * Shotgun blast: even fan across a cone around the recoiled aim.
 * All pellets share the same speed; only direction varies.
 */
export function shotgunBlastDirections(
  aimX: number,
  aimY: number,
  stance: AccuracyStance,
  recoil: number,
  seed: number,
  mods: {
    pellets: number;
    spreadMult: number;
    pelletSpread: number;
    recoilKick: number;
    recoilMax: number;
  },
): { dirs: { aimX: number; aimY: number }[]; recoil: number } {
  // Center line gets stance wobble + recoil once; pellets fan around it.
  const center = fireDirection(aimX, aimY, stance, recoil, seed, {
    spreadMult: mods.spreadMult * 0.35,
    pelletSpread: 0,
    recoilKick: mods.recoilKick,
    recoilMax: mods.recoilMax,
    applyRecoil: true,
  });
  const halfCone =
    stanceSpreadRad(stance) * mods.spreadMult * 0.55 + mods.pelletSpread;
  const dirs: { aimX: number; aimY: number }[] = [];
  const n = Math.max(1, mods.pellets);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const jitter = (hash01(seed + 17 + i * 41) - 0.5) * halfCone * 0.22;
    const ang = u * halfCone + jitter;
    const d = rotate(center.aimX, center.aimY, ang);
    const len = Math.hypot(d.x, d.y) || 1;
    dirs.push({ aimX: d.x / len, aimY: d.y / len });
  }
  return { dirs, recoil: center.recoil };
}

export function recoverRecoil(recoil: number, dt: number, crouching: boolean): number {
  const rate = crouching ? ACCURACY.recoilRecoverCrouch : ACCURACY.recoilRecover;
  return Math.max(0, recoil - rate * dt);
}

export function bodyPartAtHit(
  hitY: number,
  bodyY: number,
  crouching: boolean,
): BodyPart {
  const h = crouching ? PLAYER.crouchHeight : PLAYER.height;
  const top = bodyY - h / 2;
  const rel = (hitY - top) / h; // 0 at head top, 1 at feet
  if (rel < BODY.headFrac) return 'head';
  if (rel < BODY.headFrac + BODY.torsoFrac) return 'torso';
  return 'legs';
}

export function bodyDamageMult(part: BodyPart): number {
  return BODY[part];
}
