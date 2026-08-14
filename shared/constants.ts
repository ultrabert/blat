export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
/** World arena — wider than the viewport; camera follows the player. */
export const GAME_WIDTH = 2560;
export const GAME_HEIGHT = 900;
export const GRAVITY = 1600;
export const TICK_MS = 33; // ~30 Hz sim + state patches
export const INTERP_DELAY_MS = 100;
export const RECONCILE_SNAP_DIST = 48;

export const PLAYER = {
  speed: 210,
  crouchSpeed: 115,
  jumpVelocity: -410,
  /** Weaker than hover — burst lift, not flight. */
  jetAcceleration: -620,
  /** Soft ceiling on upward speed while jetting (px/s). */
  jetMaxAscent: 300,
  maxFuel: 100,
  fuelBurnRate: 55,
  fuelRegenRate: 16,
  /** Air regen multiplier vs ground (jets recover mostly on ground). */
  fuelRegenAirMult: 0.32,
  maxHealth: 100,
  width: 22,
  height: 36,
  crouchHeight: 20,
  fireCooldownMs: 140,
  bulletSpeed: 820,
  bulletDamage: 9,
  grenadeCooldownMs: 900,
  grenadeSpeed: 420,
  grenadeDamage: 55,
  grenadeBlastRadius: 110,
  respawnDelayMs: 2000,
  maxGrenades: 3,
  maxVelocityX: 520,
  maxVelocityY: 780,
  dragX: 1100,
  rollSpeed: 400,
  rollDurationMs: 320,
  rollCooldownMs: 480,
  /** Phase 5 — advanced movement */
  airAccel: 420,
  overspeedDecayGround: 420,
  overspeedDecayAir: 150,
  bunnyWindowMs: 150,
  bunnyMinSpeed: 200,
  bunnyBoost: 1.12,
  bunnyBoostCap: 520,
  kickJumpBoost: 70,
  cannonballMinVy: 300,
  cannonballConvert: 0.68,
  cannonballMinBoost: 200,
  cannonballDurationMs: 360,
  backflipFuelCost: 16,
  backflipVx: 320,
  backflipVy: -360,
  backflipDurationMs: 300,
} as const;

export const BOT = {
  aimError: 0.18,
  fireRange: 720,
  thinkIntervalMs: 120,
  retargetMinMs: 700,
  retargetMaxMs: 2200,
  styleMinMs: 280,
  styleMaxMs: 900,
} as const;

/** Spectator DEMO room — enough bodies that a 1v1 chase cannot dominate. */
export const DEMO_BOTS = 5;

export const COLORS = {
  bgTop: 0x1a2744,
  bgBottom: 0x0b1020,
  platform: 0x3d4f6f,
  platformEdge: 0x7a8fb3,
  player: 0x4ade80,
  bot: 0xf87171,
  other: 0x60a5fa,
  bullet: 0xfde68a,
  grenade: 0xfbbf24,
  hud: '#e8eefc',
  muted: '#9aa8c7',
} as const;

export type PlatformSpec = { x: number; y: number; w: number; h: number };

/**
 * Soldat-style arena: twin high bases, stepped hills into a valley,
 * floating mid platforms, and a high sky bridge.
 * Platforms are walkable tops (pass-through from below).
 */
export const PLATFORMS: PlatformSpec[] = [
  // Continuous bedrock — no fall-off holes
  { x: 1280, y: 870, w: 2560, h: 40 },
  // Left base battlement
  { x: 220, y: 320, w: 400, h: 22 },
  { x: 80, y: 420, w: 140, h: 22 },
  // Left hill descent
  { x: 500, y: 400, w: 200, h: 22 },
  { x: 680, y: 480, w: 180, h: 22 },
  { x: 840, y: 560, w: 180, h: 22 },
  { x: 1000, y: 640, w: 200, h: 22 },
  // Valley floor + side shelves
  { x: 1280, y: 780, w: 520, h: 22 },
  { x: 1120, y: 720, w: 140, h: 22 },
  { x: 1440, y: 720, w: 140, h: 22 },
  // Mid bunker roof
  { x: 1280, y: 520, w: 260, h: 22 },
  // Right hill ascent (mirror)
  { x: 1560, y: 640, w: 200, h: 22 },
  { x: 1720, y: 560, w: 180, h: 22 },
  { x: 1880, y: 480, w: 180, h: 22 },
  { x: 2060, y: 400, w: 200, h: 22 },
  // Right base battlement
  { x: 2340, y: 320, w: 400, h: 22 },
  { x: 2480, y: 420, w: 140, h: 22 },
  // Floating fight platforms
  { x: 640, y: 240, w: 140, h: 22 },
  { x: 1920, y: 240, w: 140, h: 22 },
  { x: 1080, y: 280, w: 160, h: 22 },
  { x: 1480, y: 280, w: 160, h: 22 },
  { x: 1280, y: 160, w: 220, h: 22 },
  // Inner cliff ledges
  { x: 360, y: 560, w: 120, h: 22 },
  { x: 2200, y: 560, w: 120, h: 22 },
];

/** Visual hill/cliff masses (cosmetic; collision uses PLATFORMS + COVERS). */
export type TerrainFill = { x: number; y: number; w: number; h: number };

export const TERRAIN_FILLS: TerrainFill[] = [
  // Full-width ground mass under bedrock
  { x: 1280, y: 920, w: 2560, h: 120 },
  // Left mountain
  { x: 180, y: 620, w: 480, h: 560 },
  { x: 420, y: 700, w: 360, h: 400 },
  { x: 700, y: 780, w: 320, h: 280 },
  // Valley shoulders
  { x: 1040, y: 840, w: 200, h: 140 },
  { x: 1520, y: 840, w: 200, h: 140 },
  // Right mountain
  { x: 1860, y: 780, w: 320, h: 280 },
  { x: 2140, y: 700, w: 360, h: 400 },
  { x: 2380, y: 620, w: 480, h: 560 },
  // Mid bunker pedestal
  { x: 1280, y: 650, w: 200, h: 240 },
];

/** Waist-high cover + cliff faces (full AABB collision). */
export type CoverSpec = { x: number; y: number; w: number; h: number };

export const COVERS: CoverSpec[] = [
  // Mid bunker (peek tests use x=1280)
  { x: 1280, y: 492, w: 70, h: 36 },
  { x: 1210, y: 492, w: 48, h: 32 },
  { x: 1350, y: 492, w: 48, h: 32 },
  // Valley floor sandbags
  { x: 1180, y: 752, w: 56, h: 36 },
  { x: 1380, y: 752, w: 56, h: 36 },
  // Left base crates
  { x: 160, y: 292, w: 52, h: 34 },
  { x: 280, y: 292, w: 52, h: 34 },
  // Right base crates
  { x: 2280, y: 292, w: 52, h: 34 },
  { x: 2400, y: 292, w: 52, h: 34 },
  // Cliff faces (block horizontal)
  { x: 40, y: 560, w: 48, h: 280 },
  { x: 2520, y: 560, w: 48, h: 280 },
  { x: 900, y: 700, w: 40, h: 120 },
  { x: 1660, y: 700, w: 40, h: 120 },
  // Hill bunkers
  { x: 680, y: 452, w: 52, h: 34 },
  { x: 1880, y: 452, w: 52, h: 34 },
];

export const SPAWNS = [
  { x: 180, y: 280 },
  { x: 2380, y: 280 },
  { x: 1280, y: 480 },
  { x: 1000, y: 600 },
  { x: 1560, y: 600 },
  { x: 640, y: 200 },
  { x: 1920, y: 200 },
  { x: 1280, y: 740 },
];

export type PlayerInput = {
  seq: number;
  move: number; // -1 | 0 | 1
  jet: boolean;
  crouch: boolean;
  aimX: number;
  aimY: number;
  fire: boolean;
  grenade: boolean;
};

export function playerHalfExtents(crouching: boolean): { halfW: number; halfH: number } {
  const halfW = (PLAYER.width - 4) / 2;
  const h = crouching ? PLAYER.crouchHeight : PLAYER.height;
  const halfH = (h - 2) / 2;
  return { halfW, halfH };
}
