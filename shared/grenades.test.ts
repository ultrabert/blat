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
  NADE,
  remainingFuse,
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
