/**
 * Cosmetic scenery placements (no collision — COVERS/PLATFORMS stay authoritative).
 */
export type ScenerySpec = {
  x: number;
  y: number;
  key:
    | 'prop_crate'
    | 'prop_sandbags'
    | 'prop_ruin'
    | 'bg_scrub'
    | 'bg_cloud'
    | 'prop_barrel'
    | 'prop_antenna'
    | 'prop_flag';
  scale: number;
  /** 0 = locked to world; <1 = parallax backdrop */
  scroll?: number;
  depth?: number;
  flipX?: boolean;
  alpha?: number;
};

export const SCENERY: ScenerySpec[] = [
  { x: 320, y: 140, key: 'bg_cloud', scale: 0.7, scroll: 0.16, depth: -9, alpha: 0.4 },
  { x: 1180, y: 110, key: 'bg_cloud', scale: 0.85, scroll: 0.12, depth: -9, alpha: 0.32, flipX: true },
  { x: 1980, y: 130, key: 'bg_cloud', scale: 0.72, scroll: 0.18, depth: -9, alpha: 0.36 },
  { x: 400, y: 520, key: 'bg_scrub', scale: 0.55, scroll: 0.25, depth: -8, alpha: 0.55 },
  { x: 1800, y: 500, key: 'bg_scrub', scale: 0.58, scroll: 0.28, depth: -8, alpha: 0.5 },
  { x: 200, y: 190, key: 'prop_antenna', scale: 0.35, depth: 0.2 },
  { x: 2360, y: 190, key: 'prop_flag', scale: 0.32, depth: 0.2 },
  { x: 400, y: 50, key: 'prop_flag', scale: 0.28, depth: 0.2 },
  { x: 90, y: 380, key: 'prop_ruin', scale: 0.22, depth: 0 },
  { x: 2460, y: 390, key: 'prop_ruin', scale: 0.2, depth: 0 },
  { x: 300, y: 1120, key: 'prop_crate', scale: 0.14, depth: 0 },
  { x: 2260, y: 1120, key: 'prop_ruin', scale: 0.16, depth: 0, flipX: true },
  { x: 1280, y: 30, key: 'prop_antenna', scale: 0.4, depth: 0.2 },
];
