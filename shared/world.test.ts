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
  PLATFORMS,
  RAMPS,
  SPAWNS,
  WAYPOINTS,
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
});
