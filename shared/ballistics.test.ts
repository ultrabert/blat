/**
 * @mechanic ballistic-projectiles
 * Golden tests for drop, velocity inheritance, and damage falloff.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BALLISTICS,
  ballisticDamage,
  expectedDrop,
  muzzleVelocity,
  stepBallistic,
  type BallisticBody,
} from './ballistics.js';

describe('ballistic-projectiles', () => {
  it('ballistics-drop: horizontal shot falls under gravity', () => {
    const b: BallisticBody = {
      x: 0,
      y: 0,
      vx: BALLISTICS.muzzleSpeed,
      vy: 0,
      power: 1,
    };
    const t = 0.45;
    const steps = 45;
    const dt = t / steps;
    for (let i = 0; i < steps; i++) {
      stepBallistic(b, dt, BALLISTICS.gravityScale, 0);
    }
    const drop = b.y;
    const expect = expectedDrop(t);
    assert.ok(drop > 40, `expected visible drop, got ${drop}`);
    assert.ok(Math.abs(drop - expect) < 3, `drop ${drop} vs expected ${expect}`);
  });

  it('ballistics-inherit: forward motion increases bullet speed', () => {
    const still = muzzleVelocity(1, 0, 0, 0);
    const running = muzzleVelocity(1, 0, 260, 0);
    assert.ok(running.vx > still.vx);
    assert.equal(still.vy, running.vy);
    assert.ok(running.power > still.power);
    const boost = running.vx - still.vx;
    assert.ok(Math.abs(boost - 260 * BALLISTICS.inherit) < 0.01);
  });

  it('ballistics-damage-falloff: power decays over flight', () => {
    const b: BallisticBody = {
      x: 0,
      y: 0,
      vx: BALLISTICS.muzzleSpeed,
      vy: 0,
      power: 1,
    };
    const startDmg = ballisticDamage(b.power);
    for (let i = 0; i < 60; i++) stepBallistic(b, 1 / 30);
    const endDmg = ballisticDamage(b.power);
    assert.equal(startDmg, BALLISTICS.baseDamage);
    assert.ok(endDmg < startDmg, `expected falloff ${endDmg} < ${startDmg}`);
    assert.ok(endDmg >= Math.round(BALLISTICS.baseDamage * BALLISTICS.minDamageScale));
  });
});
