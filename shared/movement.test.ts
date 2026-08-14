/**
 * @mechanic advanced-movement
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLAYER } from './constants.js';
import { stepMovement, type MoveBody, type MoveInput } from './physics.js';

function body(partial: Partial<MoveBody> = {}): MoveBody {
  return {
    x: 640,
    y: 400,
    vx: 0,
    vy: 0,
    fuel: PLAYER.maxFuel,
    facing: 1,
    aimX: 1,
    aimY: 0,
    jetting: false,
    alive: true,
    onGround: true,
    crouching: false,
    rollMs: 0,
    rollCdMs: 0,
    rollDir: 0,
    holdCrouch: false,
    holdJet: false,
    recoil: 0,
    landGraceMs: 0,
    cannonballMs: 0,
    backflipMs: 0,
    ...partial,
  };
}

function input(partial: Partial<MoveInput> = {}): MoveInput {
  return {
    move: 0,
    jet: false,
    crouch: false,
    aimX: 1,
    aimY: 0,
    ...partial,
  };
}

const DT = 1 / 30;

describe('advanced-movement', () => {
  it('overspeed-coasts-same-direction', () => {
    const b = body({ vx: 420, onGround: true });
    stepMovement(b, input({ move: 1 }), DT);
    assert.ok(b.vx > PLAYER.speed, 'should not snap down to walk speed');
    assert.ok(b.vx < 420, 'should decay slightly');
  });

  it('bunny-hop-boosts-in-land-grace', () => {
    const b = body({
      vx: 280,
      onGround: true,
      landGraceMs: PLAYER.bunnyWindowMs,
      y: 640, // near floor platform
    });
    // Seat on floor
    b.y = 680 - 11 - PLAYER.height / 2;
    stepMovement(b, input({ move: 1, jet: true }), DT);
    assert.equal(b.onGround, false);
    assert.ok(Math.abs(b.vx) > 280 * 1.05, `expected bunny boost, got ${b.vx}`);
  });

  it('cannonball-converts-fall-to-horizontal', () => {
    const b = body({
      onGround: false,
      vy: 450,
      vx: 40,
      holdCrouch: false,
      y: 200,
    });
    stepMovement(b, input({ crouch: true, move: 1 }), DT);
    assert.ok(b.cannonballMs > 0, 'should enter cannonball');
    assert.ok(b.vx > 200, `expected dive boost, got ${b.vx}`);
    assert.ok(b.vy < 450 * 0.5, 'vertical should dump');
  });

  it('backflip-on-air-crouch-jet-edge', () => {
    const b = body({
      onGround: false,
      facing: 1,
      vx: 100,
      vy: 50,
      fuel: 100,
      holdJet: false,
      holdCrouch: true,
      y: 200,
    });
    stepMovement(b, input({ crouch: true, jet: true, move: -1 }), DT);
    assert.ok(b.backflipMs > 0, 'should backflip');
    assert.ok(b.vy < 0, 'should gain upward velocity');
    assert.ok(b.vx < 0, 'should reverse toward move dir');
    assert.ok(b.fuel < 100, 'should spend fuel');
  });

  it('air-accel-does-not-snap-velocity', () => {
    const b = body({ onGround: false, vx: 350, y: 200 });
    stepMovement(b, input({ move: 1 }), DT);
    assert.ok(b.vx > 350, 'air accel should add, not replace');
  });
});
