/**
 * @mechanic magazines-reload
 * @mechanic melee
 * @mechanic vest-medkits
 * @mechanic special-ballistics
 */
import { fireDirection, shotgunBlastDirections, type AccuracyStance } from './accuracy.js';
import { BALLISTICS, muzzleVelocity } from './ballistics.js';
import { MAX_VEST, VEST_ABSORB, VEST_HEAD_ABSORB, WEAPONS, isMelee, type WeaponDef, type WeaponId } from './weapons.js';

export type PlannedShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  power: number;
  gravityScale: number;
  dragPerSec: number;
  lifeMs: number;
  explodeOnHit: boolean;
  blastRadius: number;
  blastDamage: number;
};

export type FirePlan = {
  recoil: number;
  shots: PlannedShot[];
  melee: boolean;
  meleeRange: number;
  meleeDamage: number;
};

export function stanceFromBody(b: {
  vx: number;
  vy: number;
  onGround: boolean;
  jetting: boolean;
  crouching: boolean;
  prone?: boolean;
  rollMs?: number;
  rolling?: boolean;
  cannonballMs?: number;
  cannonball?: boolean;
}): AccuracyStance {
  return {
    vx: b.vx,
    vy: b.vy,
    onGround: b.onGround,
    jetting: b.jetting,
    crouching: b.crouching,
    prone: !!b.prone,
    rolling: (b.rollMs ?? 0) > 0 || !!b.rolling,
    cannonball: (b.cannonballMs ?? 0) > 0 || !!b.cannonball,
  };
}

function muzzleY(bodyY: number, dirY: number, crouch: boolean): number {
  return bodyY + dirY * (crouch ? 6 : 12) - (crouch ? 2 : 4);
}

/** Shared client/server shot list for one trigger pull. */
export function planFire(
  body: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    aimX: number;
    aimY: number;
    crouching: boolean;
    recoil: number;
  },
  weapon: WeaponDef,
  stance: AccuracyStance,
  seed: number,
): FirePlan {
  if (weapon.kind === 'melee') {
    return {
      recoil: body.recoil,
      shots: [],
      melee: true,
      meleeRange: weapon.meleeRange ?? 40,
      meleeDamage: weapon.damage,
    };
  }

  const crouch = body.crouching || stance.rolling || !!stance.cannonball;
  const gScale = weapon.gravityScale ?? BALLISTICS.gravityScale;
  const drag = weapon.dragPerSec ?? BALLISTICS.dragPerSec;
  const life = weapon.lifeMs ?? BALLISTICS.lifeMs;
  const extra = {
    gravityScale: gScale,
    dragPerSec: drag,
    lifeMs: life,
    explodeOnHit: !!weapon.explodeOnHit,
    blastRadius: weapon.blastRadius ?? 0,
    blastDamage: weapon.blastDamage ?? 0,
  };

  if (weapon.kind === 'pellet') {
    const blast = shotgunBlastDirections(body.aimX, body.aimY, stance, body.recoil, seed, {
      pellets: weapon.pellets,
      spreadMult: weapon.spreadMult,
      pelletSpread: weapon.pelletSpread,
      recoilKick: weapon.recoilKick,
      recoilMax: weapon.recoilMax,
    });
    const center = blast.dirs[Math.floor(blast.dirs.length / 2)] ?? {
      aimX: body.aimX,
      aimY: body.aimY,
    };
    const base = muzzleVelocity(center.aimX, center.aimY, body.vx, body.vy, weapon.muzzleSpeed);
    const speed = Math.hypot(base.vx, base.vy);
    const shots: PlannedShot[] = blast.dirs.map((dir) => ({
      x: body.x + dir.aimX * 18,
      y: muzzleY(body.y, dir.aimY, crouch),
      vx: dir.aimX * speed,
      vy: dir.aimY * speed,
      power: base.power,
      ...extra,
    }));
    return { recoil: blast.recoil, shots, melee: false, meleeRange: 0, meleeDamage: 0 };
  }

  let recoil = body.recoil;
  const shots: PlannedShot[] = [];
  const n = Math.max(1, weapon.pellets);
  for (let i = 0; i < n; i++) {
    const fired = fireDirection(body.aimX, body.aimY, stance, recoil, seed + i * 97, {
      spreadMult: weapon.spreadMult,
      pelletSpread: weapon.pelletSpread,
      recoilKick: weapon.recoilKick,
      recoilMax: weapon.recoilMax,
      applyRecoil: i === 0,
    });
    if (i === 0) recoil = fired.recoil;
    const muzzle = muzzleVelocity(fired.aimX, fired.aimY, body.vx, body.vy, weapon.muzzleSpeed);
    const reach = weapon.kind === 'flame' ? 14 : 20;
    shots.push({
      x: body.x + fired.aimX * reach,
      y: muzzleY(body.y, fired.aimY, crouch),
      vx: muzzle.vx,
      vy: muzzle.vy,
      power: muzzle.power,
      ...extra,
    });
  }
  return { recoil, shots, melee: false, meleeRange: 0, meleeDamage: 0 };
}

export function applyVestDamage(
  health: number,
  vest: number,
  amount: number,
  bodyPart: 'head' | 'torso' | 'legs' | 'blast' = 'torso',
): { health: number; vest: number; taken: number } {
  let remaining = Math.max(0, amount);
  let v = vest;
  if (v > 0 && remaining > 0) {
    const frac = bodyPart === 'head' ? VEST_HEAD_ABSORB : VEST_ABSORB;
    const soak = Math.min(v, remaining * frac);
    v -= soak;
    remaining -= soak;
  }
  const taken = remaining;
  return {
    health: Math.max(0, health - remaining),
    vest: Math.max(0, Math.min(MAX_VEST, v)),
    taken,
  };
}

export function spawnAmmoFor(weaponId: WeaponId): { ammo: number; reserve: number } {
  const w = WEAPONS[weaponId];
  if (isMelee(weaponId)) return { ammo: 0, reserve: 0 };
  // Magazines are finite; reserve is unused — reload always refills the mag.
  return { ammo: w.magSize, reserve: 0 };
}
