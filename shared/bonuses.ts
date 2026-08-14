/**
 * @mechanic soldat-bonuses
 * @mechanic kill-sprees
 */
export type BonusId = 'berserk' | 'predator' | 'flamegod';

export const BONUS_IDS: BonusId[] = ['berserk', 'predator', 'flamegod'];

export const BONUS_LABEL: Record<BonusId, string> = {
  berserk: 'BERSERK',
  predator: 'PREDATOR',
  flamegod: 'FLAME GOD',
};

export const BONUS = {
  durationMs: 12000,
  respawnMs: 22000,
  berserkSpeed: 1.32,
  berserkMelee: 2.6,
  predatorAlpha: 0.18,
  tossFlagDist: 170,
} as const;

export const SPREE = [
  { n: 3, label: 'KILLING SPREE' },
  { n: 5, label: 'RAMPAGE' },
  { n: 7, label: 'UNSTOPPABLE' },
  { n: 10, label: 'GODLIKE' },
] as const;

/** Rapid kills in this window stack DOUBLE / TRIPLE / … */
export const MULTI_WINDOW_MS = 3500;

export function isBonusId(v: unknown): v is BonusId {
  return v === 'berserk' || v === 'predator' || v === 'flamegod';
}

export function spreeLabel(n: number): string | null {
  let label: string | null = null;
  for (const row of SPREE) {
    if (n === row.n) label = row.label;
  }
  return label;
}

/** Time-windowed multi-kill shout. 2=DOUBLE … 5=PENTA, then it keeps climbing. */
export function multiKillLabel(n: number): string | null {
  if (n < 2) return null;
  if (n === 2) return 'DOUBLE KILL';
  if (n === 3) return 'TRIPLE KILL';
  if (n === 4) return 'QUAD KILL';
  if (n === 5) return 'PENTA KILL';
  if (n === 6) return 'HEXA KILL';
  if (n === 7) return 'SEVENFOLD';
  return 'UNREAL';
}

export function medalTier(label: string): number {
  if (label === 'HEADSHOT') return 1;
  if (label === 'FIRST BLOOD' || label === 'DOUBLE KILL') return 2;
  if (label === 'TRIPLE KILL' || label === 'KILLING SPREE') return 3;
  if (label === 'QUAD KILL') return 4;
  if (label === 'PENTA KILL' || label === 'RAMPAGE') return 5;
  if (label === 'HEXA KILL' || label === 'UNSTOPPABLE') return 6;
  if (label === 'SEVENFOLD') return 7;
  if (label === 'UNREAL' || label === 'GODLIKE') return 8;
  return 2;
}
