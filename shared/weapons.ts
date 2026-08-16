/**
 * @mechanic weapon-arsenal
 * @mechanic weapon-pickups
 * @mechanic magazines-reload
 * @mechanic melee
 * @mechanic special-ballistics
 * @tradeoff range-vs-rof (each gun is a different game)
 */
export type FireKind = 'bullet' | 'pellet' | 'rocket' | 'shell' | 'flame' | 'melee';

export type WeaponId =
  | 'de'
  | 'socom'
  | 'mp5'
  | 'ak'
  | 'm4'
  | 'barrett'
  | 'ruger'
  | 'spas'
  | 'm79'
  | 'law'
  | 'flamer'
  | 'minigun'
  | 'bow'
  | 'knife'
  | 'chainsaw'
  | 'punch';

export type WeaponDef = {
  id: WeaponId;
  name: string;
  short: string;
  kind: FireKind;
  fireCooldownMs: number;
  /** Damage per projectile (per pellet / flame particle). */
  damage: number;
  muzzleSpeed: number;
  pellets: number;
  spreadMult: number;
  pelletSpread: number;
  recoilKick: number;
  recoilMax: number;
  magSize: number;
  reserveMax: number;
  reloadMs: number;
  gravityScale?: number;
  dragPerSec?: number;
  lifeMs?: number;
  explodeOnHit?: boolean;
  blastRadius?: number;
  blastDamage?: number;
  meleeRange?: number;
  /** Headshot always kills (Barrett). */
  headOhk?: boolean;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  de: {
    id: 'de',
    name: 'Desert Eagle',
    short: 'DE',
    kind: 'bullet',
    fireCooldownMs: 280,
    damage: 55,
    muzzleSpeed: 780,
    pellets: 1,
    spreadMult: 0.7,
    pelletSpread: 0,
    recoilKick: 0.09,
    recoilMax: 0.24,
    magSize: 7,
    reserveMax: 35,
    reloadMs: 1400,
  },
  socom: {
    id: 'socom',
    name: 'USSOCOM',
    short: 'SOC',
    kind: 'bullet',
    fireCooldownMs: 125,
    damage: 28,
    muzzleSpeed: 760,
    pellets: 1,
    spreadMult: 0.55,
    pelletSpread: 0,
    recoilKick: 0.05,
    recoilMax: 0.18,
    magSize: 12,
    reserveMax: 48,
    reloadMs: 1300,
  },
  mp5: {
    id: 'mp5',
    name: 'MP5',
    short: 'MP5',
    kind: 'bullet',
    fireCooldownMs: 78,
    damage: 14,
    muzzleSpeed: 760,
    pellets: 1,
    spreadMult: 1.15,
    pelletSpread: 0,
    recoilKick: 0.032,
    recoilMax: 0.2,
    magSize: 30,
    reserveMax: 90,
    reloadMs: 1600,
  },
  ak: {
    id: 'ak',
    name: 'AK-74',
    short: 'AK',
    kind: 'bullet',
    fireCooldownMs: 105,
    damage: 24,
    muzzleSpeed: 840,
    pellets: 1,
    spreadMult: 1,
    pelletSpread: 0,
    recoilKick: 0.05,
    recoilMax: 0.22,
    magSize: 30,
    reserveMax: 90,
    reloadMs: 1800,
  },
  m4: {
    id: 'm4',
    name: 'M4A1',
    short: 'M4',
    kind: 'bullet',
    fireCooldownMs: 86,
    damage: 20,
    muzzleSpeed: 880,
    pellets: 1,
    spreadMult: 0.78,
    pelletSpread: 0,
    recoilKick: 0.038,
    recoilMax: 0.18,
    magSize: 30,
    reserveMax: 90,
    reloadMs: 1650,
  },
  barrett: {
    id: 'barrett',
    name: 'Barrett',
    short: 'SR',
    kind: 'bullet',
    fireCooldownMs: 820,
    damage: 88,
    muzzleSpeed: 1280,
    pellets: 1,
    spreadMult: 0.18,
    pelletSpread: 0,
    recoilKick: 0.16,
    recoilMax: 0.3,
    magSize: 5,
    reserveMax: 20,
    reloadMs: 2200,
    headOhk: true,
  },
  ruger: {
    id: 'ruger',
    name: 'Ruger 77',
    short: 'RUG',
    kind: 'bullet',
    fireCooldownMs: 640,
    damage: 64,
    muzzleSpeed: 980,
    pellets: 1,
    spreadMult: 0.28,
    pelletSpread: 0,
    recoilKick: 0.13,
    recoilMax: 0.26,
    magSize: 4,
    reserveMax: 16,
    reloadMs: 2000,
    gravityScale: 0.42,
  },
  spas: {
    id: 'spas',
    name: 'SPAS-12',
    short: 'SG',
    kind: 'pellet',
    fireCooldownMs: 620,
    damage: 12,
    muzzleSpeed: 720,
    pellets: 10,
    spreadMult: 1.4,
    pelletSpread: 0.32,
    recoilKick: 0.12,
    recoilMax: 0.28,
    magSize: 8,
    reserveMax: 32,
    reloadMs: 2400,
  },
  m79: {
    id: 'm79',
    name: 'M79',
    short: 'GL',
    kind: 'shell',
    fireCooldownMs: 1100,
    damage: 0,
    muzzleSpeed: 420,
    pellets: 1,
    spreadMult: 0.4,
    pelletSpread: 0,
    recoilKick: 0.14,
    recoilMax: 0.26,
    magSize: 1,
    reserveMax: 8,
    reloadMs: 1600,
    gravityScale: 1.05,
    dragPerSec: 0.08,
    lifeMs: 2400,
    explodeOnHit: true,
    blastRadius: 95,
    blastDamage: 62,
  },
  law: {
    id: 'law',
    name: 'LAW',
    short: 'LAW',
    kind: 'rocket',
    fireCooldownMs: 1400,
    damage: 0,
    muzzleSpeed: 620,
    pellets: 1,
    spreadMult: 0.35,
    pelletSpread: 0,
    recoilKick: 0.18,
    recoilMax: 0.3,
    magSize: 1,
    reserveMax: 4,
    reloadMs: 2200,
    gravityScale: 0.08,
    dragPerSec: 0.04,
    lifeMs: 1800,
    explodeOnHit: true,
    blastRadius: 125,
    blastDamage: 78,
  },
  flamer: {
    id: 'flamer',
    name: 'Flamer',
    short: 'FL',
    kind: 'flame',
    fireCooldownMs: 42,
    damage: 4,
    muzzleSpeed: 540,
    pellets: 5,
    spreadMult: 1.3,
    pelletSpread: 0.18,
    recoilKick: 0.01,
    recoilMax: 0.08,
    magSize: 50,
    reserveMax: 150,
    reloadMs: 2000,
    gravityScale: -0.22,
    dragPerSec: 0.95,
    lifeMs: 560,
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    short: 'MG',
    kind: 'bullet',
    fireCooldownMs: 48,
    damage: 12,
    muzzleSpeed: 800,
    pellets: 1,
    spreadMult: 1.45,
    pelletSpread: 0.02,
    recoilKick: 0.028,
    recoilMax: 0.26,
    magSize: 100,
    reserveMax: 200,
    reloadMs: 3200,
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    short: 'BOW',
    kind: 'bullet',
    fireCooldownMs: 480,
    damage: 72,
    muzzleSpeed: 500,
    pellets: 1,
    spreadMult: 0.22,
    pelletSpread: 0,
    recoilKick: 0.04,
    recoilMax: 0.1,
    magSize: 1,
    reserveMax: 12,
    reloadMs: 700,
    gravityScale: 1.85,
    dragPerSec: 0.1,
    lifeMs: 2800,
  },
  knife: {
    id: 'knife',
    name: 'Knife',
    short: 'KN',
    kind: 'melee',
    fireCooldownMs: 360,
    damage: 70,
    muzzleSpeed: 0,
    pellets: 0,
    spreadMult: 0,
    pelletSpread: 0,
    recoilKick: 0,
    recoilMax: 0,
    magSize: 0,
    reserveMax: 0,
    reloadMs: 0,
    meleeRange: 40,
  },
  chainsaw: {
    id: 'chainsaw',
    name: 'Chainsaw',
    short: 'SAW',
    kind: 'melee',
    fireCooldownMs: 70,
    damage: 18,
    muzzleSpeed: 0,
    pellets: 0,
    spreadMult: 0,
    pelletSpread: 0,
    recoilKick: 0,
    recoilMax: 0,
    magSize: 0,
    reserveMax: 0,
    reloadMs: 0,
    meleeRange: 44,
  },
  punch: {
    id: 'punch',
    name: 'Punch',
    short: 'PCH',
    kind: 'melee',
    fireCooldownMs: 220,
    damage: 22,
    muzzleSpeed: 0,
    pellets: 0,
    spreadMult: 0,
    pelletSpread: 0,
    recoilKick: 0,
    recoilMax: 0,
    magSize: 0,
    reserveMax: 0,
    reloadMs: 0,
    meleeRange: 32,
  },
} as const;

export const DEFAULT_WEAPON: WeaponId = 'de';
export const DEFAULT_MELEE: WeaponId = 'knife';
/** Power pads worth a detour — the 10-second loop's destinations. */
export const DESTINATION_GUNS: readonly WeaponId[] = [
  'ak',
  'minigun',
  'barrett',
  'law',
  'm79',
  'flamer',
];

const IDS = new Set<string>(Object.keys(WEAPONS));

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && IDS.has(v);
}

export function isMelee(id: unknown): boolean {
  return id === 'knife' || id === 'chainsaw' || id === 'punch';
}

export function isFirearm(id: unknown): boolean {
  return isWeaponId(id) && !isMelee(id);
}

/** 1 = firearm, 2 = knife/saw, 3 = punch. */
export function weaponBySlot(slot: number): 'firearm' | 'melee' | 'punch' | null {
  if (slot === 1) return 'firearm';
  if (slot === 2) return 'melee';
  if (slot === 3) return 'punch';
  return null;
}

export function weaponIconKey(id: string): string {
  if (id === 'barrett' || id === 'ruger' || id === 'bow') return 'icon_sniper';
  if (id === 'spas' || id === 'm79' || id === 'law') return 'icon_shotgun';
  return 'icon_rifle';
}

export type PickupKind = 'weapon' | 'ammo' | 'medkit' | 'vest' | 'nade' | 'bonus';

export type MapPickupSpec = {
  id: string;
  kind: PickupKind;
  item: string;
  x: number;
  y: number;
};

/**
 * Map pads — a handful of power guns as destinations. Kits/nades/bonuses
 * still respawn on a shorter timer.
 */
export const MAP_PICKUPS: MapPickupSpec[] = [
  { id: 'w_ak_l', kind: 'weapon', item: 'ak', x: 340, y: 297 },
  { id: 'w_minigun_r', kind: 'weapon', item: 'minigun', x: 2220, y: 297 },
  { id: 'w_flamer_m', kind: 'weapon', item: 'flamer', x: 240, y: 1128 },
  { id: 'w_barrett_r', kind: 'weapon', item: 'barrett', x: 2320, y: 1128 },
  { id: 'w_m79_m', kind: 'weapon', item: 'm79', x: 1380, y: 497 },
  { id: 'w_law_sky', kind: 'weapon', item: 'law', x: 1280, y: 137 },
  { id: 'med_l', kind: 'medkit', item: '', x: 580, y: 218 },
  { id: 'med_r', kind: 'medkit', item: '', x: 1980, y: 218 },
  { id: 'med_v', kind: 'medkit', item: '', x: 1200, y: 838 },
  { id: 'vest_l', kind: 'vest', item: '', x: 80, y: 397 },
  { id: 'vest_r', kind: 'vest', item: '', x: 2480, y: 397 },
  { id: 'vest_m', kind: 'vest', item: '', x: 1280, y: 497 },
  { id: 'nade_cluster', kind: 'nade', item: 'cluster', x: 1420, y: 257 },
  { id: 'nade_sting', kind: 'nade', item: 'sting', x: 1080, y: 257 },
  { id: 'nade_frag', kind: 'nade', item: 'frag', x: 640, y: 217 },
  { id: 'med_cave_l', kind: 'medkit', item: '', x: 120, y: 1128 },
  { id: 'med_cave_r', kind: 'medkit', item: '', x: 2440, y: 1128 },
  { id: 'vest_cave_l', kind: 'vest', item: '', x: 160, y: 1019 },
  { id: 'nade_cave', kind: 'nade', item: 'frag', x: 2400, y: 1019 },
  { id: 'bon_berserk', kind: 'bonus', item: 'berserk', x: 1010, y: 257 },
  { id: 'bon_pred', kind: 'bonus', item: 'predator', x: 1480, y: 257 },
  { id: 'bon_flame', kind: 'bonus', item: 'flamegod', x: 1860, y: 217 },
];

export const PICKUP_RADIUS = 28;
export const PICKUP_RESPAWN_MS = 16000;
/** Guns stay gone long enough that holding one is map control. */
export const WEAPON_RESPAWN_MS = 90000;
/** Dropped guns are not collected until this elapses (avoids instant re-grab). */
export const PICKUP_ARM_MS = 480;
export const MEDKIT_HEAL = 50;
export const VEST_PICKUP = 60;
export const MAX_VEST = 100;
/** Vest soaks this fraction of incoming (head soaks less). */
export const VEST_ABSORB = 0.5;
export const VEST_HEAD_ABSORB = 0.22;
