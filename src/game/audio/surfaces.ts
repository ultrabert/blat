import { COVERS, type CoverMaterial } from '../../../shared/constants';

/** Dirt platforms/bounds, plus cover materials. */
export type ImpactSurface = 'dirt' | CoverMaterial;

/** Resolve the surface under a non-player bullet impact. */
export function impactSurface(kind: string, x: number, y: number): ImpactSurface {
  if (kind === 'cover') {
    for (const c of COVERS) {
      if (
        x >= c.x - c.w / 2 - 6 &&
        x <= c.x + c.w / 2 + 6 &&
        y >= c.y - c.h / 2 - 6 &&
        y <= c.y + c.h / 2 + 6
      ) {
        return c.mat;
      }
    }
    return 'sand';
  }
  return 'dirt';
}
