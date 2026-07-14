export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GRAVITY = 1400;
export const TICK_MS = 50; // 20 Hz

export const PLAYER = {
  speed: 260,
  jumpVelocity: -420,
  jetAcceleration: -900,
  maxFuel: 100,
  fuelBurnRate: 38,
  fuelRegenRate: 22,
  maxHealth: 100,
  width: 22,
  height: 36,
  fireCooldownMs: 140,
  bulletSpeed: 820,
  bulletDamage: 18,
  grenadeCooldownMs: 900,
  grenadeSpeed: 420,
  grenadeDamage: 55,
  grenadeBlastRadius: 90,
  respawnDelayMs: 2000,
  maxGrenades: 3,
  maxVelocityX: 420,
  maxVelocityY: 900,
  dragX: 900,
} as const;

export const BOT = {
  aimError: 0.18,
  fireRange: 520,
  thinkIntervalMs: 120,
} as const;

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

export const PLATFORMS: PlatformSpec[] = [
  { x: 640, y: 680, w: 1200, h: 22 },
  { x: 220, y: 540, w: 280, h: 22 },
  { x: 640, y: 480, w: 220, h: 22 },
  { x: 1060, y: 540, w: 280, h: 22 },
  { x: 140, y: 360, w: 180, h: 22 },
  { x: 640, y: 300, w: 300, h: 22 },
  { x: 1140, y: 360, w: 180, h: 22 },
  { x: 400, y: 200, w: 160, h: 22 },
  { x: 880, y: 200, w: 160, h: 22 },
];

export const SPAWNS = [
  { x: 160, y: 500 },
  { x: 1120, y: 500 },
  { x: 640, y: 250 },
  { x: 200, y: 320 },
  { x: 1080, y: 320 },
];

export type PlayerInput = {
  move: number; // -1 | 0 | 1
  jet: boolean;
  aimX: number;
  aimY: number;
  fire: boolean;
  grenade: boolean;
};
