/**
 * @mechanic ballistic-projectiles
 * @mechanic crouch-cover
 */
import { COVERS, GAME_HEIGHT, GAME_WIDTH, PLATFORMS, RAMPS, playerHalfExtents } from './constants.js';
import { bodyPartAtHit } from './accuracy.js';

export type BulletTraceHit =
  | { kind: 'platform' | 'bounds' | 'cover'; t: number; x: number; y: number }
  | {
      kind: 'player';
      t: number;
      x: number;
      y: number;
      playerId: string;
      bodyPart: 'head' | 'torso' | 'legs';
    };

export type TraceTarget = {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  crouching?: boolean;
  prone?: boolean;
};

/**
 * Segment vs AABB. Returns entry t in [0, 1] or null.
 * Uses a thin point swept along the segment (bullet as a point).
 */
export function segmentHitAabb(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number | null {
  const EPS = 1e-8;
  let tEnter = 0;
  let tExit = 1;

  const slam = (min: number, max: number, p: number, d: number): boolean => {
    if (Math.abs(d) < EPS) {
      return p >= min && p <= max;
    }
    let t0 = (min - p) / d;
    let t1 = (max - p) / d;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    return tEnter <= tExit && tExit >= 0 && tEnter <= 1;
  };

  if (!slam(left, right, x0, dx)) return null;
  if (!slam(top, bottom, y0, dy)) return null;
  if (tEnter < 0) return tExit >= 0 ? 0 : null;
  return tEnter <= 1 ? tEnter : null;
}

/** Segment vs segment. Returns t along the first segment in [0, 1] or null. */
export function segmentHitSegment(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number | null {
  const ex = bx - ax;
  const ey = by - ay;
  const cross = dx * ey - dy * ex;
  if (Math.abs(cross) < 1e-8) return null;
  const t = ((ax - x0) * ey - (ay - y0) * ex) / cross;
  const u = ((ax - x0) * dy - (ay - y0) * dx) / cross;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/** Trace a bullet from (x0,y0) → (x1,y1). Earliest hit wins. */
export function traceBullet(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  targets: TraceTarget[],
  ownerId: string,
): BulletTraceHit | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let best: BulletTraceHit | null = null;

  const consider = (hit: BulletTraceHit) => {
    if (!best || hit.t < best.t) best = hit;
  };

  const bounds = [
    { left: -40, top: -1e6, right: -39, bottom: 1e6 },
    { left: GAME_WIDTH + 39, top: -1e6, right: GAME_WIDTH + 40, bottom: 1e6 },
    { left: -1e6, top: -40, right: 1e6, bottom: -39 },
    { left: -1e6, top: GAME_HEIGHT + 39, right: 1e6, bottom: GAME_HEIGHT + 40 },
  ];
  for (const b of bounds) {
    const t = segmentHitAabb(x0, y0, dx, dy, b.left, b.top, b.right, b.bottom);
    if (t !== null) {
      consider({ kind: 'bounds', t, x: x0 + dx * t, y: y0 + dy * t });
    }
  }

  for (const ramp of RAMPS) {
    const t = segmentHitSegment(x0, y0, dx, dy, ramp.ax, ramp.ay, ramp.bx, ramp.by);
    if (t !== null) {
      consider({ kind: 'platform', t, x: x0 + dx * t, y: y0 + dy * t });
    }
  }

  for (const plat of PLATFORMS) {
    const left = plat.x - plat.w / 2;
    const right = plat.x + plat.w / 2;
    const top = plat.y - plat.h / 2;
    const bottom = plat.y + plat.h / 2;
    const t = segmentHitAabb(x0, y0, dx, dy, left, top, right, bottom);
    if (t !== null) {
      consider({ kind: 'platform', t, x: x0 + dx * t, y: y0 + dy * t });
    }
  }

  for (const cover of COVERS) {
    const left = cover.x - cover.w / 2;
    const right = cover.x + cover.w / 2;
    const top = cover.y - cover.h / 2;
    const bottom = cover.y + cover.h / 2;
    const t = segmentHitAabb(x0, y0, dx, dy, left, top, right, bottom);
    if (t !== null) {
      consider({ kind: 'cover', t, x: x0 + dx * t, y: y0 + dy * t });
    }
  }

  for (const target of targets) {
    if (!target.alive || target.id === ownerId) continue;
    const { halfW, halfH } = playerHalfExtents(!!target.crouching, !!target.prone);
    const t = segmentHitAabb(
      x0,
      y0,
      dx,
      dy,
      target.x - halfW,
      target.y - halfH,
      target.x + halfW,
      target.y + halfH,
    );
    if (t !== null) {
      const hx = x0 + dx * t;
      const hy = y0 + dy * t;
      consider({
        kind: 'player',
        t,
        x: hx,
        y: hy,
        playerId: target.id,
        bodyPart: bodyPartAtHit(hy, target.y, !!target.crouching, !!target.prone),
      });
    }
  }

  return best;
}
