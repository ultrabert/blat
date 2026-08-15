/**
 * Cosmetic scenery placements (no collision — COVERS/PLATFORMS stay authoritative).
 * World props sit on pad tops (origin at feet). `bg_scrub` is a painted horizon
 * plate, not a bush — GameScene draws it once as far parallax, not here.
 */
export type ScenerySpec = {
  x: number;
  y: number;
  key:
    | 'prop_crate'
    | 'prop_sandbags'
    | 'prop_ruin'
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
  /** Default 1 = feet on y (world props). Clouds use 0.5. */
  originY?: number;
};

export const SCENERY: ScenerySpec[] = [
  { x: 320, y: 140, key: 'bg_cloud', scale: 0.7, scroll: 0.16, depth: -9, alpha: 0.4, originY: 0.5 },
  { x: 1180, y: 110, key: 'bg_cloud', scale: 0.85, scroll: 0.12, depth: -9, alpha: 0.32, flipX: true, originY: 0.5 },
  { x: 1980, y: 130, key: 'bg_cloud', scale: 0.72, scroll: 0.18, depth: -9, alpha: 0.36, originY: 0.5 },
  // Loft / sky pads
  { x: 200, y: 201, key: 'prop_antenna', scale: 0.35, depth: 0.2 },
  { x: 2360, y: 201, key: 'prop_flag', scale: 0.32, depth: 0.2 },
  { x: 400, y: 63, key: 'prop_flag', scale: 0.28, depth: 0.2 },
  { x: 1280, y: 40, key: 'prop_antenna', scale: 0.4, depth: 0.2 },
  // Vest decks
  { x: 90, y: 409, key: 'prop_ruin', scale: 0.16, depth: 0 },
  { x: 2470, y: 409, key: 'prop_ruin', scale: 0.16, depth: 0, flipX: true },
  // Pit floor / cave floors
  { x: 1088, y: 850, key: 'prop_barrel', scale: 0.55, depth: 0.15 },
  { x: 1472, y: 850, key: 'prop_barrel', scale: 0.5, depth: 0.15 },
  { x: 70, y: 1142, key: 'prop_barrel', scale: 0.45, depth: 0.1 },
  { x: 2490, y: 1142, key: 'prop_barrel', scale: 0.45, depth: 0.1 },
];
