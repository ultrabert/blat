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
import { traceBullet } from './trace.js';
import { hillOccludes, pointInTerrain } from './terrain.js';
import { MAP_PICKUPS } from './weapons.js';
import { Simulation } from './simulation.js';
import { GameState } from './schema.js';

describe('arena-map', () => {
  it('map-is-taller-than-the-viewport-and-has-sky-and-caves', () => {
    assert.ok(GAME_HEIGHT >= 1100);
    assert.ok(GAME_WIDTH >= 2560);
    const ys = PLATFORMS.map((p) => p.y);
    assert.ok(Math.min(...ys) < 80, 'need sky pads');
    assert.ok(Math.max(...ys) > 1100, 'need cave floors');
    assert.ok(RAMPS.length >= 8, 'need cave ramps plus hills');
    assert.ok(
      RAMPS.some((r) => Math.abs(r.by - r.ay) > 80),
      'bowl needs real slopes, not flat decks',
    );
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

  it('slopes-block-bullets', () => {
    const ramp = RAMPS.find((r) => r.ax === 400 && r.bx === 640);
    assert.ok(ramp, 'left bowl ramp');
    const x = 520;
    const t = (x - ramp!.ax) / (ramp!.bx - ramp!.ax);
    const y = ramp!.ay + t * (ramp!.by - ramp!.ay);
    const hit = traceBullet(x, y - 80, x, y + 80, [], 'tester');
    assert.ok(hit, 'shot through the slope should hit');
    assert.equal(hit!.kind, 'platform');
    assert.ok(Math.abs(hit!.y - y) < 4, `hit y=${hit!.y} ramp y=${y}`);
  });

  it('spawns-and-pickups-are-not-inside-dirt', () => {
    for (const spawn of SPAWNS) {
      assert.ok(
        !pointInTerrain(spawn.x, spawn.y),
        `spawn ${spawn.x},${spawn.y} is inside the hill fill`,
      );
    }
    for (const pad of MAP_PICKUPS) {
      assert.ok(
        !pointInTerrain(pad.x, pad.y),
        `pickup ${pad.id} at ${pad.x},${pad.y} is inside the hill fill`,
      );
    }
    assert.ok(!pointInTerrain(300, 800), 'cave under the left rim should be air');
    assert.ok(!pointInTerrain(360, 560), 'inner loft ledge should be air');
    assert.ok(!pointInTerrain(2200, 560), 'right loft ledge should be air');
    assert.ok(pointInTerrain(800, 720), 'bowl mass should stay solid dirt');
    assert.ok(!pointInTerrain(420, 1100), 'left cave door should be open');
    assert.ok(!pointInTerrain(2140, 1100), 'right cave door should be open');
  });

  it('pickups-are-not-under-the-bowl', () => {
    for (const pad of MAP_PICKUPS) {
      assert.ok(
        !hillOccludes(pad.x, pad.y, 400),
        `${pad.id} at ${pad.x},${pad.y} sits under the hill`,
      );
    }
    assert.ok(hillOccludes(560, 1100, 400), 'left tunnel stays behind the bowl');
    assert.ok(hillOccludes(2000, 1100, 400), 'right tunnel stays behind the bowl');
  });

  it('pickups-sit-on-pads-not-bowl-slopes', () => {
    for (const pad of MAP_PICKUPS) {
      const onPad = PLATFORMS.some((p) => {
        const left = p.x - p.w / 2;
        const right = p.x + p.w / 2;
        const top = p.y - p.h / 2;
        return pad.x >= left && pad.x <= right && pad.y <= top && top - pad.y <= 24;
      });
      assert.ok(onPad, `${pad.id} at ${pad.x},${pad.y} is not on a platform`);
    }
  });

  it('loft-runoff-is-open-toward-the-bowl', () => {
    const { halfW, halfH } = playerHalfExtents(false);
    const runs = [
      { x: 180, y: 280, dir: 1 },
      { x: 2380, y: 280, dir: -1 },
    ];
    for (const run of runs) {
      for (let i = 0; i < 24; i++) {
        const x = run.x + run.dir * i * 8;
        const sl = x - halfW;
        const sr = x + halfW;
        const st = run.y - halfH;
        const sb = run.y + halfH;
        for (const c of COVERS) {
          const cl = c.x - c.w / 2;
          const cr = c.x + c.w / 2;
          const ct = c.y - c.h / 2;
          const cb = c.y + c.h / 2;
          const overlap = sl < cr && sr > cl && st < cb && sb > ct;
          assert.ok(
            !overlap,
            `cover ${c.x},${c.y} blocks loft runoff at ${x},${run.y}`,
          );
        }
      }
    }
  });
});

describe('bot-dm-ai', () => {
  it('loft-bot-jumps-the-crate-instead-of-sticking', () => {
    const sim = new Simulation(new GameState(), { mode: 'dm' });
    const a = sim.addPlayer('a', 'A', true);
    const b = sim.addPlayer('b', 'B', true);
    a.x = 180;
    a.y = 280;
    b.x = 1920;
    b.y = 200;
    for (let i = 0; i < 90; i++) sim.step(16);
    assert.ok(
      Math.abs(a.x - 180) > 24 || !a.alive,
      `loft bot should leave the flag stand, x=${a.x} vx=${a.vx}`,
    );
  });

  it('cave-bot-can-leave-through-the-door', () => {
    const sim = new Simulation(new GameState(), { mode: 'dm' });
    const a = sim.addPlayer('a', 'A', true);
    const b = sim.addPlayer('b', 'B', true);
    a.x = 300;
    a.y = 1120;
    b.x = 1280;
    b.y = 830;
    for (let i = 0; i < 180; i++) sim.step(16);
    assert.ok(
      Math.abs(a.x - 300) > 40 || a.y < 1000 || !a.alive,
      `cave bot should not sit on the spawn, x=${a.x} y=${a.y}`,
    );
  });
});
