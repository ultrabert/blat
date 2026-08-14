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
