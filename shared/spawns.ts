/**
 * @mechanic anti-camp-spawns
 * Pick the spawn farthest from living bodies, avoiding recent indices.
 */
export type SpawnPoint = { x: number; y: number };

export function scoreSpawn(
  spawn: SpawnPoint,
  living: SpawnPoint[],
  recentlyUsed: boolean,
): number {
  let nearest = 2400;
  if (living.length === 0) nearest = 900;
  for (const p of living) {
    const d = Math.hypot(p.x - spawn.x, p.y - spawn.y);
    if (d < nearest) nearest = d;
  }
  if (nearest < 80) nearest *= 0.12;
  if (recentlyUsed) nearest *= 0.42;
  return nearest;
}

export function pickAntiCampSpawn(
  spawns: readonly SpawnPoint[],
  living: SpawnPoint[],
  recentIndices: readonly number[],
): { spawn: SpawnPoint; index: number } {
  let bestI = 0;
  let best = -1;
  for (let i = 0; i < spawns.length; i++) {
    const s = scoreSpawn(spawns[i]!, living, recentIndices.includes(i));
    if (s > best) {
      best = s;
      bestI = i;
    }
  }
  return { spawn: spawns[bestI]!, index: bestI };
}
