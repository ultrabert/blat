/**
 * @mechanic arcade-physics-core
 * @mechanic arena-map
 *
 * Filled hills (TERRAIN_POLYS) are solid dirt. RAMPS are the walkable tops.
 * Caves are the air under a poly's bottom edge — not inside the fill.
 */
import { PLATFORMS, RAMPS, TERRAIN_POLYS, type TerrainPoly } from './constants.js';

export type TerrainBand = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function pointInPoly(x: number, y: number, poly: TerrainPoly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const hit =
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-6) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

export function pointInTerrain(x: number, y: number): boolean {
  for (const poly of TERRAIN_POLYS) {
    if (pointInPoly(x, y, poly)) return true;
  }
  return false;
}

/** True if the segment clips dirt (skips the start point). */
export function segmentHitsTerrain(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  samples = 8,
): boolean {
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (pointInTerrain(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}

/** Even-odd vertical spans of dirt at world X. */
export function terrainBandsAt(x: number): TerrainBand[] {
  const bands: TerrainBand[] = [];
  for (const poly of TERRAIN_POLYS) {
    if (poly.length < 3) continue;
    let left = Infinity;
    let right = -Infinity;
    const ys: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      left = Math.min(left, a.x);
      right = Math.max(right, a.x);
      if (a.x === b.x) continue;
      const crosses = a.x <= x !== b.x <= x;
      if (!crosses) continue;
      const t = (x - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
    ys.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ys.length; i += 2) {
      const top = ys[i]!;
      const bottom = ys[i + 1]!;
      if (bottom - top < 4) continue;
      bands.push({ top, bottom, left, right });
    }
  }
  return bands;
}

/** True when a ramp/line is the underside of a dirt wedge (cave ceiling). */
export function surfaceIsCeiling(x: number, surfaceY: number): boolean {
  for (const band of terrainBandsAt(x)) {
    if (Math.abs(band.bottom - surfaceY) <= 10 && Math.abs(band.top - surfaceY) > 10) {
      return true;
    }
  }
  return false;
}

/** Walkable Y (feet) at X: highest ramp or platform top covering X. */
export function walkableTopAt(x: number): number | null {
  let best: number | null = null;
  for (const r of RAMPS) {
    const lo = Math.min(r.ax, r.bx);
    const hi = Math.max(r.ax, r.bx);
    if (x < lo || x > hi) continue;
    const span = r.bx - r.ax || 1;
    const y = r.ay + ((x - r.ax) / span) * (r.by - r.ay);
    if (surfaceIsCeiling(x, y)) continue;
    if (best === null || y < best) best = y;
  }
  for (const plat of PLATFORMS) {
    const left = plat.x - plat.w / 2;
    const right = plat.x + plat.w / 2;
    if (x < left || x > right) continue;
    const top = plat.y - plat.h / 2;
    if (best === null || top < best) best = top;
  }
  return best;
}

/** Place an item so its origin sits on dirt/pad instead of inside the fill. */
export function sitOnWalkable(x: number, y: number, hover = 12): { x: number; y: number } {
  const bands = terrainBandsAt(x);
  for (const band of bands) {
    if (y > band.top + 8 && y < band.bottom - 4) {
      return { x, y: band.top - hover };
    }
  }
  let best: number | null = null;
  let bestDist = 80;
  for (const r of RAMPS) {
    const lo = Math.min(r.ax, r.bx);
    const hi = Math.max(r.ax, r.bx);
    if (x < lo || x > hi) continue;
    const span = r.bx - r.ax || 1;
    const top = r.ay + ((x - r.ax) / span) * (r.by - r.ay);
    if (surfaceIsCeiling(x, top)) continue;
    const dist = Math.abs(y - top);
    if (dist < bestDist) {
      bestDist = dist;
      best = top;
    }
  }
  for (const plat of PLATFORMS) {
    const left = plat.x - plat.w / 2;
    const right = plat.x + plat.w / 2;
    if (x < left || x > right) continue;
    const top = plat.y - plat.h / 2;
    const dist = Math.abs(y - top);
    if (dist < bestDist) {
      bestDist = dist;
      best = top;
    }
  }
  if (best !== null) return { x, y: best - hover };
  return { x, y };
}

/** Dirt slab between two points on the same column (pickup behind a hill). */
export function hillOccludes(px: number, py: number, vy: number): boolean {
  const y0 = Math.min(vy, py);
  const y1 = Math.max(vy, py);
  for (const band of terrainBandsAt(px)) {
    if (band.top < y1 - 8 && band.bottom > y0 + 8) return true;
  }
  return false;
}
