/**
 * @mechanic state-accuracy
 * @mechanic body-hitboxes
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bodyDamageMult,
  bodyPartAtHit,
  fireDirection,
  hash01,
  shotgunBlastDirections,
  stanceSpreadRad,
} from './accuracy.js';
import { PLAYER } from './constants.js';
import { WEAPONS } from './weapons.js';

describe('state-accuracy', () => {
  it('spread-wider-when-moving-or-jetting', () => {
    const still = stanceSpreadRad({
      vx: 0,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: false,
      rolling: false,
    });
    const moving = stanceSpreadRad({
      vx: 260,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: false,
      rolling: false,
    });
    const jet = stanceSpreadRad({
      vx: 0,
      vy: -200,
      onGround: false,
      jetting: true,
      crouching: false,
      rolling: false,
    });
    const crouch = stanceSpreadRad({
      vx: 0,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: true,
      rolling: false,
    });
    assert.ok(moving > still);
    assert.ok(jet > moving);
    assert.ok(crouch < still);
    const prone = stanceSpreadRad({
      vx: 0,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: true,
      prone: true,
      rolling: false,
    });
    assert.ok(prone < crouch);
  });

  it('fire-direction-deterministic-for-seed', () => {
    const stance = {
      vx: 0,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: false,
      rolling: false,
    };
    const a = fireDirection(1, 0, stance, 0, 42);
    const b = fireDirection(1, 0, stance, 0, 42);
    assert.equal(a.aimX, b.aimX);
    assert.equal(a.aimY, b.aimY);
    assert.ok(a.recoil > 0);
    assert.ok(hash01(1) !== hash01(2));
  });

  it('shotgun-blast-even-cone', () => {
    const still = {
      vx: 0,
      vy: 0,
      onGround: true,
      jetting: false,
      crouching: false,
      rolling: false,
    };
    const { dirs } = shotgunBlastDirections(1, 0, still, 0, 42, {
      pellets: WEAPONS.spas.pellets,
      spreadMult: WEAPONS.spas.spreadMult,
      pelletSpread: WEAPONS.spas.pelletSpread,
      recoilKick: WEAPONS.spas.recoilKick,
      recoilMax: WEAPONS.spas.recoilMax,
    });
    assert.equal(dirs.length, WEAPONS.spas.pellets);
    const angles = dirs.map((d) => Math.atan2(d.aimY, d.aimX));
    const span = Math.max(...angles) - Math.min(...angles);
    assert.ok(span > 0.35, `cone too tight: ${span}`);
    assert.ok(span < 0.95, `cone too wide: ${span}`);
    assert.ok(angles[0]! < angles[angles.length - 1]!);
  });
});

describe('body-hitboxes', () => {
  it('head-torso-legs-ordering', () => {
    const y = 400;
    const h = PLAYER.height;
    const top = y - h / 2;
    const head = bodyPartAtHit(top + h * 0.1, y, false);
    const torso = bodyPartAtHit(top + h * 0.45, y, false);
    const legs = bodyPartAtHit(top + h * 0.85, y, false);
    assert.equal(head, 'head');
    assert.equal(torso, 'torso');
    assert.equal(legs, 'legs');
    assert.ok(bodyDamageMult('head') > bodyDamageMult('torso'));
    assert.ok(bodyDamageMult('torso') > bodyDamageMult('legs'));
  });
});
