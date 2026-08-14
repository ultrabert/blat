export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
/** World arena — wider and taller than the viewport; camera follows the player. */
export const GAME_WIDTH = 2560;
export const GAME_HEIGHT = 1200;
/** Current DM layout — bunkers, ramps, sky pads, caves. */
export const MAP_NAME = 'Ridge';
export const GRAVITY = 1600;
export const TICK_MS = 16; // ~62 Hz sim + state patches
export const INTERP_DELAY_MS = 50;
export const RECONCILE_SNAP_DIST = 48;

export const PLAYER = {
  speed: 210,
  crouchSpeed: 115,
  proneSpeed: 52,
  proneHeight: 11,
  /** Hold crouch still this long to go prone. */
  proneHoldMs: 240,
  jumpVelocity: -410,
  /**
   * Stronger than gravity so a held jet climbs; feather (~70% duty) hovers.
   * @mechanic limited-jetpack
   */
  jetAcceleration: -2200,
  /** Soft cap on climb speed while jetting (px/s). Fuel is the real limit. */
  jetMaxAscent: 520,
  /** Extra air steer while jetting (on top of airAccel). */
  jetStrafeAccel: 640,
  maxFuel: 100,
  /** ~5s continuous burn — long enough to cross the arena. */
  fuelBurnRate: 20,
  fuelRegenRate: 24,
  /** Gliding still recovers; jetting does not. */
  fuelRegenAirMult: 0.5,
  maxHealth: 100,
  maxVest: 100,
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
  dragX: 900,
  /** Accelerate toward walk speed instead of snapping (Soldat inertia). */
  groundAccel: 2600,
  groundBrake: 3800,
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
  /** Wave E — original air/ground lunge. */
  dashFuel: 16,
  dashSpeed: 460,
  dashCooldownMs: 860,
  dashDurationMs: 140,
} as const;

export const BOT = {
  aimError: 0.18,
  fireRange: 720,
  thinkIntervalMs: 120,
  retargetMinMs: 700,
  retargetMaxMs: 2200,
  styleMinMs: 280,
  styleMaxMs: 900,
  nadeMinDist: 90,
  nadeMaxDist: 360,
  medkitHp: 42,
  waypointSlack: 180,
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
 * Soldat-style arena: twin bunkers, hill ramps into a valley, sky pads,
 * and side caves under a broken bedrock (center floor stays solid for tests).
 * Platforms are walkable tops (pass-through from below).
 */
export const PLATFORMS: PlatformSpec[] = [
  // Center bedrock — top at y=850 (prone tests at x=1280)
  { x: 1280, y: 870, w: 1080, h: 40 },
  // Left / right cave floors
  { x: 300, y: 1160, w: 600, h: 36 },
  { x: 2260, y: 1160, w: 600, h: 36 },
  { x: 560, y: 1020, w: 180, h: 18 },
  { x: 2000, y: 1020, w: 180, h: 18 },
  { x: 160, y: 1040, w: 140, h: 18 },
  { x: 2400, y: 1040, w: 140, h: 18 },
  // Left base battlement + loft
  { x: 220, y: 320, w: 400, h: 22 },
  { x: 80, y: 420, w: 140, h: 22 },
  { x: 200, y: 210, w: 220, h: 18 },
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
  // Right base battlement + loft
  { x: 2340, y: 320, w: 400, h: 22 },
  { x: 2480, y: 420, w: 140, h: 22 },
  { x: 2360, y: 210, w: 220, h: 18 },
  // Floating fight platforms
  { x: 640, y: 240, w: 140, h: 22 },
  { x: 1920, y: 240, w: 140, h: 22 },
  { x: 1080, y: 280, w: 160, h: 22 },
  { x: 1480, y: 280, w: 160, h: 22 },
  { x: 1280, y: 160, w: 220, h: 22 },
  // Sky nest (ceiling-slide test still uses y=160)
  { x: 400, y: 72, w: 130, h: 18 },
  { x: 2160, y: 72, w: 130, h: 18 },
  { x: 1280, y: 48, w: 150, h: 16 },
  { x: 880, y: 100, w: 110, h: 16 },
  { x: 1680, y: 100, w: 110, h: 16 },
  // Inner cliff ledges
  { x: 360, y: 560, w: 120, h: 22 },
  { x: 2200, y: 560, w: 120, h: 22 },
];

/** Walkable slopes (line segments, y = surface). Arcade stand-in for Soldat polys. */
export type RampSpec = { ax: number; ay: number; bx: number; by: number };

export const RAMPS: RampSpec[] = [
  // Left hill
  { ax: 420, ay: 309, bx: 900, by: 629 },
  { ax: 900, ay: 629, bx: 1020, by: 769 },
  // Right hill
  { ax: 1540, ay: 769, bx: 1660, by: 629 },
  { ax: 1660, ay: 629, bx: 2140, by: 309 },
  // Valley inner ramps
  { ax: 1160, ay: 709, bx: 1280, by: 509 },
  { ax: 1280, ay: 509, bx: 1400, by: 709 },
  // Drop into caves
  { ax: 740, ay: 849, bx: 500, by: 1010 },
  { ax: 500, ay: 1010, bx: 320, by: 1142 },
  { ax: 1820, ay: 849, bx: 2060, by: 1010 },
  { ax: 2060, ay: 1010, bx: 2240, by: 1142 },
];

/** Visual hill/cliff masses (cosmetic; collision uses PLATFORMS + COVERS). */
export type TerrainFill = { x: number; y: number; w: number; h: number };

export const TERRAIN_FILLS: TerrainFill[] = [
  // Center mass under remaining bedrock
  { x: 1280, y: 980, w: 1100, h: 200 },
  // Cave walls / floors
  { x: 280, y: 1220, w: 640, h: 140 },
  { x: 2280, y: 1220, w: 640, h: 140 },
  { x: 80, y: 1100, w: 120, h: 280 },
  { x: 2480, y: 1100, w: 120, h: 280 },
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
export type CoverMaterial = 'sand' | 'wood' | 'stone';
export type CoverSpec = { x: number; y: number; w: number; h: number; mat: CoverMaterial };

export const COVERS: CoverSpec[] = [
  // Mid bunker (peek tests use x=1280)
  { x: 1280, y: 492, w: 70, h: 36, mat: 'sand' },
  { x: 1210, y: 492, w: 48, h: 32, mat: 'sand' },
  { x: 1350, y: 492, w: 48, h: 32, mat: 'sand' },
  // Valley floor sandbags
  { x: 1180, y: 752, w: 56, h: 36, mat: 'sand' },
  { x: 1380, y: 752, w: 56, h: 36, mat: 'sand' },
  // Left base crates
  { x: 160, y: 292, w: 52, h: 34, mat: 'wood' },
  { x: 280, y: 292, w: 52, h: 34, mat: 'wood' },
  // Right base crates
  { x: 2280, y: 292, w: 52, h: 34, mat: 'wood' },
  { x: 2400, y: 292, w: 52, h: 34, mat: 'wood' },
  // Cliff faces (block horizontal)
  { x: 40, y: 560, w: 48, h: 280, mat: 'stone' },
  { x: 2520, y: 560, w: 48, h: 280, mat: 'stone' },
  { x: 900, y: 700, w: 40, h: 120, mat: 'stone' },
  { x: 1660, y: 700, w: 40, h: 120, mat: 'stone' },
  // Hill bunkers
  { x: 680, y: 452, w: 52, h: 34, mat: 'sand' },
  { x: 1880, y: 452, w: 52, h: 34, mat: 'sand' },
  // Base interiors
  { x: 24, y: 250, w: 32, h: 160, mat: 'stone' },
  { x: 340, y: 268, w: 22, h: 90, mat: 'stone' },
  { x: 2536, y: 250, w: 32, h: 160, mat: 'stone' },
  { x: 2220, y: 268, w: 22, h: 90, mat: 'stone' },
  // Sky bags
  { x: 400, y: 54, w: 44, h: 28, mat: 'sand' },
  { x: 2160, y: 54, w: 44, h: 28, mat: 'sand' },
  // Cave rooms
  { x: 200, y: 1132, w: 56, h: 40, mat: 'sand' },
  { x: 2360, y: 1132, w: 56, h: 40, mat: 'sand' },
  { x: 560, y: 992, w: 48, h: 34, mat: 'sand' },
  { x: 2000, y: 992, w: 48, h: 34, mat: 'sand' },
];

export const SPAWNS = [
  { x: 180, y: 280 },
  { x: 2380, y: 280 },
  { x: 200, y: 180 },
  { x: 2360, y: 180 },
  { x: 1280, y: 480 },
  { x: 1000, y: 600 },
  { x: 1560, y: 600 },
  { x: 640, y: 200 },
  { x: 1920, y: 200 },
  { x: 1280, y: 740 },
  { x: 400, y: 50 },
  { x: 2160, y: 50 },
  { x: 1280, y: 28 },
  { x: 300, y: 1120 },
  { x: 2260, y: 1120 },
  { x: 160, y: 1000 },
  { x: 2400, y: 1000 },
];

/** Bot navigation nodes — spawns plus fight pads. */
export const WAYPOINTS = [
  ...SPAWNS,
  { x: 1280, y: 140 },
  { x: 880, y: 80 },
  { x: 1680, y: 80 },
  { x: 560, y: 1000 },
  { x: 2000, y: 1000 },
  { x: 220, y: 300 },
  { x: 2340, y: 300 },
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
  reload: boolean;
  drop: boolean;
  nadeCycle: boolean;
  blat: boolean;
  dash: boolean;
  tossFlag: boolean;
};

export function playerHalfExtents(
  crouching: boolean,
  prone = false,
): { halfW: number; halfH: number } {
  const halfW = (PLAYER.width - 4) / 2;
  const h = prone ? PLAYER.proneHeight : crouching ? PLAYER.crouchHeight : PLAYER.height;
  const halfH = (h - 2) / 2;
  return { halfW, halfH };
}
