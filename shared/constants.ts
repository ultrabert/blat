export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
/** World arena — wider and taller than the viewport; camera follows the player. */
export const GAME_WIDTH = 2560;
export const GAME_HEIGHT = 1200;
/** Current DM layout — bunkers, ramps, sky pads, caves. */
export const MAP_NAME = 'Arena';
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
 * Arena homage (chakapoko's default DM): rim decks, a sloped pit, a mid span,
 * sky pads, and side caves under the bowl. Center floor at y=850 (x=1280)
 * stays solid so cover/prone tests hold. Platforms are walkable tops
 * (pass-through from below). RAMPS are the Soldat-style angled surfaces.
 * TERRAIN_POLYS are solid dirt (same fill the client paints); caves are the
 * air under a poly's bottom edge and under the rim decks (x<400 / x>2160).
 */
export const PLATFORMS: PlatformSpec[] = [
  // Pit floor — top at y=850 (prone tests at x=1280)
  { x: 1280, y: 870, w: 760, h: 40 },
  // Left / right cave floors
  { x: 300, y: 1160, w: 600, h: 36 },
  { x: 2260, y: 1160, w: 600, h: 36 },
  { x: 560, y: 1119, w: 180, h: 18 },
  { x: 2000, y: 1119, w: 180, h: 18 },
  { x: 160, y: 1040, w: 140, h: 18 },
  { x: 2400, y: 1040, w: 140, h: 18 },
  // Rim decks + lofts (flag stands)
  { x: 220, y: 320, w: 400, h: 22 },
  { x: 80, y: 420, w: 140, h: 22 },
  { x: 200, y: 210, w: 220, h: 18 },
  { x: 2340, y: 320, w: 400, h: 22 },
  { x: 2480, y: 420, w: 140, h: 22 },
  { x: 2360, y: 210, w: 220, h: 18 },
  // Bowl ledges
  { x: 1120, y: 720, w: 140, h: 22 },
  { x: 1440, y: 720, w: 140, h: 22 },
  // Mid span (peek tests use the cover on this roof)
  { x: 1280, y: 520, w: 280, h: 22 },
  // Floating fight pads
  { x: 640, y: 240, w: 140, h: 22 },
  { x: 1920, y: 240, w: 140, h: 22 },
  { x: 1080, y: 280, w: 160, h: 22 },
  { x: 1480, y: 280, w: 160, h: 22 },
  { x: 1280, y: 160, w: 220, h: 22 },
  // Sky nest (ceiling-slide test still uses y=160)
  { x: 400, y: 72, w: 130, h: 18 },
  { x: 2160, y: 72, w: 130, h: 18 },
  { x: 1280, y: 48, w: 150, h: 16 },
  // Inner cliff ledges
  { x: 360, y: 560, w: 120, h: 22 },
  { x: 2200, y: 560, w: 120, h: 22 },
];

/** Walkable slopes (line segments, y = surface). Arcade stand-in for Soldat polys. */
export type RampSpec = { ax: number; ay: number; bx: number; by: number };

export const RAMPS: RampSpec[] = [
  // Left bowl — rim into the pit
  { ax: 400, ay: 309, bx: 640, by: 470 },
  { ax: 640, ay: 470, bx: 880, by: 640 },
  { ax: 880, ay: 640, bx: 1100, by: 849 },
  // Right bowl
  { ax: 1460, ay: 849, bx: 1680, by: 640 },
  { ax: 1680, ay: 640, bx: 1920, by: 470 },
  { ax: 1920, ay: 470, bx: 2160, by: 309 },
  // Mid-span approaches
  { ax: 1140, ay: 709, bx: 1280, by: 509 },
  { ax: 1280, ay: 509, bx: 1420, by: 709 },
  // Drop into caves
  { ax: 920, ay: 849, bx: 700, by: 1000 },
  { ax: 700, ay: 1000, bx: 400, by: 1142 },
  { ax: 1640, ay: 849, bx: 1860, by: 1000 },
  { ax: 1860, ay: 1000, bx: 2160, by: 1142 },
];

/** Filled Soldat-style hills — solid dirt, not a visual-only overlay. */
export type TerrainPoly = { x: number; y: number }[];

export const TERRAIN_POLYS: TerrainPoly[] = [
  // Left bowl — cave door under the rim so the under-hill tunnel is reachable
  [
    { x: 400, y: 309 },
    { x: 640, y: 470 },
    { x: 880, y: 640 },
    { x: 1100, y: 849 },
    { x: 920, y: 849 },
    { x: 700, y: 1000 },
    { x: 520, y: 1020 },
    { x: 400, y: 960 },
  ],
  // Right bowl — matching cave door for x>2160
  [
    { x: 2160, y: 309 },
    { x: 1920, y: 470 },
    { x: 1680, y: 640 },
    { x: 1460, y: 849 },
    { x: 1640, y: 849 },
    { x: 1860, y: 1000 },
    { x: 2040, y: 1020 },
    { x: 2160, y: 960 },
  ],
  // Pit bed
  [
    { x: 900, y: 849 },
    { x: 1660, y: 849 },
    { x: 1660, y: GAME_HEIGHT },
    { x: 900, y: GAME_HEIGHT },
  ],
  // Cave floor slabs (dirt below the walkable cave decks)
  [
    { x: 0, y: 1142 },
    { x: 600, y: 1142 },
    { x: 600, y: GAME_HEIGHT },
    { x: 0, y: GAME_HEIGHT },
  ],
  [
    { x: 1960, y: 1142 },
    { x: GAME_WIDTH, y: 1142 },
    { x: GAME_WIDTH, y: GAME_HEIGHT },
    { x: 1960, y: GAME_HEIGHT },
  ],
];

/** Waist-high cover + cliff faces (full AABB collision). */
export type CoverMaterial = 'sand' | 'wood' | 'stone';
export type CoverSpec = { x: number; y: number; w: number; h: number; mat: CoverMaterial };

export const COVERS: CoverSpec[] = [
  // Mid span — one peek bag; roof walk lanes on both sides (peek tests use x=1280)
  { x: 1280, y: 492, w: 70, h: 36, mat: 'sand' },
  // Pit floor sandbags (open middle, covered flanks)
  { x: 1180, y: 832, w: 56, h: 36, mat: 'sand' },
  { x: 1380, y: 832, w: 56, h: 36, mat: 'sand' },
  // Left rim crates (kept off the loft spawn/flag at 180,280)
  { x: 96, y: 292, w: 52, h: 34, mat: 'wood' },
  { x: 280, y: 292, w: 52, h: 34, mat: 'wood' },
  // Right rim crates (kept off the loft spawn/flag at 2380,280)
  { x: 2280, y: 292, w: 52, h: 34, mat: 'wood' },
  { x: 2464, y: 292, w: 52, h: 34, mat: 'wood' },
  // Map-edge cliff faces
  { x: 40, y: 560, w: 48, h: 280, mat: 'stone' },
  { x: 2520, y: 560, w: 48, h: 280, mat: 'stone' },
  // Base outer walls
  { x: 24, y: 250, w: 32, h: 160, mat: 'stone' },
  { x: 2536, y: 250, w: 32, h: 160, mat: 'stone' },
  // Sky bags offset from pad-center spawns
  { x: 348, y: 54, w: 36, h: 22, mat: 'sand' },
  { x: 2212, y: 54, w: 36, h: 22, mat: 'sand' },
  // Cave rooms
  { x: 200, y: 1132, w: 56, h: 40, mat: 'sand' },
  { x: 2360, y: 1132, w: 56, h: 40, mat: 'sand' },
  { x: 560, y: 1093, w: 48, h: 34, mat: 'sand' },
  { x: 2000, y: 1093, w: 48, h: 34, mat: 'sand' },
];

export const SPAWNS = [
  { x: 180, y: 280 },
  { x: 2380, y: 280 },
  { x: 200, y: 180 },
  { x: 2360, y: 180 },
  { x: 1172, y: 480 },
  { x: 1100, y: 830 },
  { x: 1460, y: 830 },
  { x: 640, y: 200 },
  { x: 1920, y: 200 },
  { x: 1280, y: 830 },
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
  { x: 1080, y: 260 },
  { x: 1480, y: 260 },
  { x: 560, y: 1092 },
  { x: 2000, y: 1092 },
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
