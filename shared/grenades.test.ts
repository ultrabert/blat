/**
 * @mechanic throwable-grenades
 * @mechanic knockback
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COVERS } from './constants.js';
import {
  blastImpulse,
  bulletImpulse,
  GRENADE,
  grenadeThrowVelocity,
  NADE,
  remainingFuse,
  stepGrenadeFlight,
} from './grenades.js';

describe('throwable-grenades', () => {
  it('cook-shortens-fuse', () => {
    assert.equal(remainingFuse(0), GRENADE.fuseMs);
    assert.ok(remainingFuse(800) < GRENADE.fuseMs);
    assert.equal(remainingFuse(GRENADE.fuseMs), GRENADE.minFuseMs);
    assert.equal(remainingFuse(GRENADE.fuseMs + 500), GRENADE.minFuseMs);
  });

  it('frag-blast-reaches-behind-mid-cover', () => {
    const cover = COVERS.find((c) => c.x === 1280 && c.y === 492)!;
    const crouchedX = cover.x + 18;
    const nadeX = cover.x - 80;
    const dist = Math.hypot(crouchedX - nadeX, 0);
    assert.ok(dist < NADE.frag.blastRadius, `flush dist ${dist} vs r=${NADE.frag.blastRadius}`);
    assert.ok(dist < GRENADE.blastRadius);
    const shove = blastImpulse(nadeX, cover.y, crouchedX, cover.y, 1 - dist / GRENADE.blastRadius);
    assert.ok(shove.vx > 40, `should pop them out of the bag, vx=${shove.vx}`);
  });

  it('air-drag-does-not-kill-horizontal-speed', () => {
    let vx = 600;
    let vy = -200;
    const dt = 0.016;
    for (let i = 0; i < 4; i++) {
      const next = stepGrenadeFlight(vx, vy, dt);
      vx = next.vx;
      vy = next.vy;
    }
    assert.ok(vx > 550, `nade should still be flying, vx=${vx}`);
  });

  it('forward-lob-is-short-range', () => {
    const v = grenadeThrowVelocity(1, 0, 0, 0, 1);
    let x = 0;
    let y = 0;
    let vx = v.vx;
    let vy = v.vy;
    const dt = 0.016;
    for (let i = 0; i < 180 && y < 80; i++) {
      const next = stepGrenadeFlight(vx, vy, dt);
      vx = next.vx;
      vy = next.vy;
      x += vx * dt;
      y += vy * dt;
    }
    assert.ok(x > 260 && x < 700, `short lob should land ~300–500px out, x=${x.toFixed(1)}`);
  });

  it('downward-aim-still-lobs-forward', () => {
    const v = grenadeThrowVelocity(0.15, 0.99, 0, 0, 1);
    assert.ok(v.vx > 200, `should throw forward, vx=${v.vx}`);
    assert.ok(v.vy < 0, `should loft, vy=${v.vy}`);
  });
});

describe('knockback', () => {
  it('blast-pushes-away-from-epicenter', () => {
    const right = blastImpulse(0, 0, 50, 0, 1);
    assert.ok(right.vx > 0);
    assert.ok(right.vy < 0, 'should include lift');
    const weak = blastImpulse(0, 0, 50, 0, 0.2);
    assert.ok(Math.abs(weak.vx) < Math.abs(right.vx));
  });

  it('bullet-impulse-scales-with-damage', () => {
    const soft = bulletImpulse(1, 0, 10);
    const hard = bulletImpulse(1, 0, 40);
    assert.ok(hard.vx > soft.vx);
    assert.ok(hard.vx > 0);
  });
});
