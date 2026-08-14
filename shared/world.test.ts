/**
 * @mechanic arena-map
 * @mechanic anti-camp-spawns
 * @mechanic bot-dm-ai
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER,
  PLATFORMS,
  RAMPS,
  SPAWNS,
  WAYPOINTS,
  playerHalfExtents,
} from './constants.js';
import { pickAntiCampSpawn } from './spawns.js';

describe('arena-map', () => {
  it('map-is-taller-than-the-viewport-and-has-sky-and-caves', () => {
    assert.ok(GAME_HEIGHT >= 1100);
    assert.ok(GAME_WIDTH >= 2560);
    const ys = PLATFORMS.map((p) => p.y);
    assert.ok(Math.min(...ys) < 80, 'need sky pads');
    assert.ok(Math.max(...ys) > 1100, 'need cave floors');
    assert.ok(RAMPS.length >= 8, 'need cave ramps plus hills');
    const midCover = COVERS.find((c) => c.x === 1280 && c.y === 492);
    assert.ok(midCover, 'peek tests still use the mid bunker');
    const skyPlat = PLATFORMS.find((p) => p.x === 1280 && p.y === 160);
    assert.ok(skyPlat, 'ceiling-slide platform stays at y=160');
  });

  it('spawns-are-spread-and-anti-camp-picks-far-slot', () => {
    assert.ok(SPAWNS.length >= 12);
    const living = [{ x: 180, y: 280 }];
    const pick = pickAntiCampSpawn(SPAWNS, living, [0]);
    const dist = Math.hypot(pick.spawn.x - 180, pick.spawn.y - 280);
    assert.ok(dist > 400, `should not spawn on the camper, dist=${dist}`);
    assert.notEqual(pick.index, 0);
  });

  it('waypoints-cover-the-vertical-stack', () => {
    assert.ok(WAYPOINTS.length >= SPAWNS.length);
    const ys = WAYPOINTS.map((w) => w.y);
    assert.ok(Math.min(...ys) < 80);
    assert.ok(Math.max(...ys) > 1000);
  });

  it('spawns-do-not-overlap-solid-covers', () => {
    const { halfW, halfH } = playerHalfExtents(false);
    for (const spawn of SPAWNS) {
      const sl = spawn.x - halfW;
      const sr = spawn.x + halfW;
      const st = spawn.y - halfH;
      const sb = spawn.y + halfH;
      for (const c of COVERS) {
        const cl = c.x - c.w / 2;
        const cr = c.x + c.w / 2;
        const ct = c.y - c.h / 2;
        const cb = c.y + c.h / 2;
        const overlap = sl < cr && sr > cl && st < cb && sb > ct;
        assert.ok(
          !overlap,
          `spawn ${spawn.x},${spawn.y} overlaps cover ${c.x},${c.y}`,
        );
      }
    }
  });

  it('nearby-covers-touch-or-leave-a-walk-lane', () => {
    const minGap = PLAYER.width;
    for (let i = 0; i < COVERS.length; i++) {
      for (let j = i + 1; j < COVERS.length; j++) {
        const a = COVERS[i]!;
        const b = COVERS[j]!;
        const aL = a.x - a.w / 2;
        const aR = a.x + a.w / 2;
        const bL = b.x - b.w / 2;
        const bR = b.x + b.w / 2;
        const aT = a.y - a.h / 2;
        const aB = a.y + a.h / 2;
        const bT = b.y - b.h / 2;
        const bB = b.y + b.h / 2;
        if (aT >= bB || aB <= bT) continue;
        const gap = aR <= bL ? bL - aR : bR <= aL ? aL - bR : 0;
        if (gap === 0 || gap > 160) continue;
        assert.ok(
          gap >= minGap,
          `covers ${a.x},${a.y} and ${b.x},${b.y} leave a ${gap}px squeeze (need ${minGap} or touch)`,
        );
      }
    }
  });
});
