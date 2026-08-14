/**
 * Cosmetic scenery placements (no collision — COVERS/PLATFORMS stay authoritative).
 */
export type ScenerySpec = {
  x: number;
  y: number;
  key: 'prop_crate' | 'prop_sandbags' | 'prop_ruin' | 'bg_scrub';
  scale: number;
  /** 0 = locked to world; <1 = parallax backdrop */
  scroll?: number;
  depth?: number;
  flipX?: boolean;
  alpha?: number;
};

export const SCENERY: ScenerySpec[] = [
  // Backdrop scrub (parallax)
  { x: 400, y: 520, key: 'bg_scrub', scale: 0.55, scroll: 0.25, depth: -8, alpha: 0.55 },
  { x: 1100, y: 480, key: 'bg_scrub', scale: 0.5, scroll: 0.22, depth: -8, alpha: 0.45, flipX: true },
  { x: 1800, y: 500, key: 'bg_scrub', scale: 0.58, scroll: 0.28, depth: -8, alpha: 0.5 },
  { x: 2400, y: 540, key: 'bg_scrub', scale: 0.48, scroll: 0.2, depth: -8, alpha: 0.4, flipX: true },
  // Mid-ground ruins / crates
  { x: 90, y: 380, key: 'prop_ruin', scale: 0.22, depth: 0 },
  { x: 480, y: 360, key: 'prop_crate', scale: 0.14, depth: 0 },
  { x: 620, y: 455, key: 'prop_sandbags', scale: 0.16, depth: 0 },
  { x: 900, y: 620, key: 'prop_ruin', scale: 0.18, depth: 0, flipX: true },
  { x: 1280, y: 700, key: 'prop_crate', scale: 0.12, depth: 0 },
  { x: 1500, y: 690, key: 'prop_sandbags', scale: 0.15, depth: 0 },
  { x: 1700, y: 530, key: 'prop_crate', scale: 0.13, depth: 0, flipX: true },
  { x: 2050, y: 370, key: 'prop_sandbags', scale: 0.14, depth: 0 },
  { x: 2460, y: 390, key: 'prop_ruin', scale: 0.2, depth: 0 },
];
