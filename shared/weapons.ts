/**
 * @mechanic weapon-arsenal
 * @mechanic weapon-pickups
 * @tradeoff range-vs-rof (sniper slow/precise; AR spray; shotgun close cone)
 */
export type WeaponId = 'rifle' | 'sniper' | 'shotgun';

export type WeaponDef = {
  id: WeaponId;
  name: string;
  /** Slot key 1–3 */
  slot: 1 | 2 | 3;
  fireCooldownMs: number;
  /** Damage per projectile (per pellet for shotgun). */
  damage: number;
  muzzleSpeed: number;
  pellets: number;
  /** Multiplier on stance spread cone. */
  spreadMult: number;
  /** Extra half-angle (rad) per pellet beyond stance spread. */
  pelletSpread: number;
  recoilKick: number;
  recoilMax: number;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    slot: 1,
    fireCooldownMs: 115,
    /** ~11 body / ~6 head shots to kill at full power. */
    damage: 9,
    muzzleSpeed: 820,
    pellets: 1,
    spreadMult: 1,
    pelletSpread: 0,
    recoilKick: 0.048,
    recoilMax: 0.22,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    slot: 2,
    fireCooldownMs: 780,
    /** Body ~2 hits; head is always lethal (see simulation). */
    damage: 48,
    muzzleSpeed: 1180,
    pellets: 1,
    spreadMult: 0.22,
    pelletSpread: 0,
    recoilKick: 0.14,
    recoilMax: 0.28,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    slot: 3,
    fireCooldownMs: 580,
    /** Per pellet — full cone ~35 if every pellet connects. */
    damage: 5,
    /** Shared speed for every pellet in the cone. */
    muzzleSpeed: 720,
    pellets: 7,
    spreadMult: 1.35,
    /** Half-angle (rad) of the even pellet fan. */
    pelletSpread: 0.14,
    recoilKick: 0.11,
    recoilMax: 0.26,
  },
} as const;

export const DEFAULT_WEAPON: WeaponId = 'rifle';

export function isWeaponId(v: string): v is WeaponId {
  return v === 'rifle' || v === 'sniper' || v === 'shotgun';
}

export function weaponBySlot(slot: number): WeaponId | null {
  if (slot === 1) return 'rifle';
  if (slot === 2) return 'sniper';
  if (slot === 3) return 'shotgun';
  return null;
}

/** Map pickup pads — touch to unlock + equip. */
export type WeaponPickupSpec = {
  id: string;
  weapon: WeaponId;
  x: number;
  y: number;
};

export const WEAPON_PICKUPS: WeaponPickupSpec[] = [
  { id: 'pk_sniper_l', weapon: 'sniper', x: 220, y: 280 },
  { id: 'pk_sniper_r', weapon: 'sniper', x: 2340, y: 280 },
  { id: 'pk_shot_l', weapon: 'shotgun', x: 1000, y: 600 },
  { id: 'pk_shot_r', weapon: 'shotgun', x: 1560, y: 600 },
  { id: 'pk_shot_m', weapon: 'shotgun', x: 1280, y: 740 },
  { id: 'pk_rifle_m', weapon: 'rifle', x: 1280, y: 480 },
];

export const PICKUP_RADIUS = 28;
export const PICKUP_RESPAWN_MS = 14000;
