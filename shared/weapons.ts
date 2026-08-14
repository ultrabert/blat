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
  | 'mp5'
  | 'ak'
  | 'barrett'
  | 'spas'
  | 'm79'
  | 'law'
  | 'flamer'
  | 'minigun'
  | 'knife'
  | 'chainsaw';

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
  barrett: {
    id: 'barrett',
    name: 'Barrett',
    short: 'SR',
    kind: 'bullet',
    fireCooldownMs: 820,
    damage: 80,
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
  spas: {
    id: 'spas',
    name: 'SPAS-12',
    short: 'SG',
    kind: 'pellet',
    fireCooldownMs: 620,
    damage: 12,
    muzzleSpeed: 700,
    pellets: 7,
    spreadMult: 1.3,
    pelletSpread: 0.15,
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
    fireCooldownMs: 45,
    damage: 7,
    muzzleSpeed: 380,
    pellets: 2,
    spreadMult: 1.1,
    pelletSpread: 0.08,
    recoilKick: 0.01,
    recoilMax: 0.08,
    magSize: 50,
    reserveMax: 150,
    reloadMs: 2000,
    gravityScale: 0,
    dragPerSec: 3.4,
    lifeMs: 200,
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
} as const;

export const DEFAULT_WEAPON: WeaponId = 'de';
export const DEFAULT_MELEE: WeaponId = 'knife';

const IDS = new Set<string>(Object.keys(WEAPONS));

export function isWeaponId(v: string): v is WeaponId {
  return IDS.has(v);
}

export function isMelee(id: string): boolean {
  return id === 'knife' || id === 'chainsaw';
}

export function isFirearm(id: string): boolean {
  return isWeaponId(id) && !isMelee(id);
}

/** 1 = firearm in hands, 2 = melee. */
export function weaponBySlot(slot: number): 'firearm' | 'melee' | null {
  if (slot === 1) return 'firearm';
  if (slot === 2) return 'melee';
  return null;
}

export function weaponIconKey(id: string): string {
  if (id === 'barrett') return 'icon_sniper';
  if (id === 'spas' || id === 'm79' || id === 'law') return 'icon_shotgun';
  return 'icon_rifle';
}

export type PickupKind = 'weapon' | 'ammo' | 'medkit' | 'vest' | 'nade';

export type MapPickupSpec = {
  id: string;
  kind: PickupKind;
  item: string;
  x: number;
  y: number;
};

/** Map pads — weapons are objects (swap on touch); kits/nades/ammo respawn. */
export const MAP_PICKUPS: MapPickupSpec[] = [
  { id: 'w_ak_l', kind: 'weapon', item: 'ak', x: 220, y: 280 },
  { id: 'w_barrett_r', kind: 'weapon', item: 'barrett', x: 2340, y: 280 },
  { id: 'w_mp5_l', kind: 'weapon', item: 'mp5', x: 500, y: 380 },
  { id: 'w_minigun_r', kind: 'weapon', item: 'minigun', x: 2060, y: 380 },
  { id: 'w_spas_l', kind: 'weapon', item: 'spas', x: 1000, y: 600 },
  { id: 'w_spas_r', kind: 'weapon', item: 'spas', x: 1560, y: 600 },
  { id: 'w_flamer_m', kind: 'weapon', item: 'flamer', x: 1280, y: 740 },
  { id: 'w_m79_m', kind: 'weapon', item: 'm79', x: 1280, y: 480 },
  { id: 'w_law_sky', kind: 'weapon', item: 'law', x: 1280, y: 140 },
  { id: 'w_saw_l', kind: 'weapon', item: 'chainsaw', x: 360, y: 540 },
  { id: 'w_saw_r', kind: 'weapon', item: 'chainsaw', x: 2200, y: 540 },
  { id: 'med_l', kind: 'medkit', item: '', x: 680, y: 460 },
  { id: 'med_r', kind: 'medkit', item: '', x: 1880, y: 460 },
  { id: 'med_v', kind: 'medkit', item: '', x: 1280, y: 760 },
  { id: 'vest_l', kind: 'vest', item: '', x: 80, y: 400 },
  { id: 'vest_r', kind: 'vest', item: '', x: 2480, y: 400 },
  { id: 'vest_m', kind: 'vest', item: '', x: 1280, y: 500 },
  { id: 'ammo_l', kind: 'ammo', item: '', x: 840, y: 540 },
  { id: 'ammo_r', kind: 'ammo', item: '', x: 1720, y: 540 },
  { id: 'nade_cluster', kind: 'nade', item: 'cluster', x: 1120, y: 700 },
  { id: 'nade_sting', kind: 'nade', item: 'sting', x: 1440, y: 700 },
  { id: 'nade_frag', kind: 'nade', item: 'frag', x: 640, y: 220 },
  { id: 'w_de_sky_l', kind: 'weapon', item: 'ak', x: 400, y: 50 },
  { id: 'w_mp5_sky_r', kind: 'weapon', item: 'mp5', x: 2160, y: 50 },
  { id: 'med_cave_l', kind: 'medkit', item: '', x: 300, y: 1120 },
  { id: 'med_cave_r', kind: 'medkit', item: '', x: 2260, y: 1120 },
  { id: 'ammo_cave_l', kind: 'ammo', item: '', x: 560, y: 1000 },
  { id: 'ammo_cave_r', kind: 'ammo', item: '', x: 2000, y: 1000 },
  { id: 'vest_cave_l', kind: 'vest', item: '', x: 160, y: 1020 },
  { id: 'nade_cave', kind: 'nade', item: 'frag', x: 2400, y: 1020 },
];

export const PICKUP_RADIUS = 28;
export const PICKUP_RESPAWN_MS = 16000;
/** Dropped guns are not collected until this elapses (avoids instant re-grab). */
export const PICKUP_ARM_MS = 480;
export const MEDKIT_HEAL = 50;
export const VEST_PICKUP = 60;
export const AMMO_BOX = 40;
export const MAX_VEST = 100;
/** Vest soaks this fraction of incoming (head soaks less). */
export const VEST_ABSORB = 0.5;
export const VEST_HEAD_ABSORB = 0.22;
