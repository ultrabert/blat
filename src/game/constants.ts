export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const GRAVITY = 1400;

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
  bullet: 0xfde68a,
  grenade: 0xfbbf24,
  hud: '#e8eefc',
  muted: '#9aa8c7',
} as const;
