/**
 * @mechanic advanced-movement
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GRAVITY, PLAYER, RAMPS, TICK_MS, playerHalfExtents } from './constants.js';
import { separateFromSolids, stepMovement, type MoveBody, type MoveInput } from './physics.js';

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
    prone: false,
    proneHoldMs: 0,
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
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 1280,
      vx: 280,
      onGround: true,
      landGraceMs: PLAYER.bunnyWindowMs,
      y: 850 - halfH,
    });
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

describe('ground-inertia-and-slopes', () => {
  it('ground-accel-does-not-snap-to-walk', () => {
    const b = body({ vx: 0, onGround: true });
    stepMovement(b, input({ move: 1 }), DT);
    assert.ok(b.vx > 20, `should start accelerating, vx=${b.vx}`);
    assert.ok(b.vx < PLAYER.speed * 0.7, `should not snap to walk, vx=${b.vx}`);
  });

  it('ramp-supports-onGround', () => {
    const ramp = RAMPS[0]!;
    const x = (ramp.ax + ramp.bx) / 2;
    const t = (x - ramp.ax) / (ramp.bx - ramp.ax);
    const surfaceY = ramp.ay + t * (ramp.by - ramp.ay);
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x,
      y: surfaceY - halfH - 6,
      vx: 30,
      vy: 40,
      onGround: false,
    });
    for (let i = 0; i < 10; i++) stepMovement(b, input({ move: 1 }), DT);
    assert.equal(b.onGround, true);
    const tNow = (b.x - ramp.ax) / (ramp.bx - ramp.ax || 1);
    const surfaceNow = ramp.ay + tNow * (ramp.by - ramp.ay);
    assert.ok(
      Math.abs(b.y + halfH - surfaceNow) < 22,
      `feet near ramp, y=${b.y} surface=${surfaceNow}`,
    );
  });

  it('slow-fall-still-lands-on-ramp', () => {
    const ramp = RAMPS[0]!;
    const x = (ramp.ax + ramp.bx) / 2;
    const t = (x - ramp.ax) / (ramp.bx - ramp.ax);
    const surfaceY = ramp.ay + t * (ramp.by - ramp.ay);
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x,
      y: surfaceY - halfH - 10,
      vx: 20,
      vy: 8,
      onGround: false,
    });
    for (let i = 0; i < 24; i++) stepMovement(b, input({}), DT);
    assert.equal(b.onGround, true);
    const tNow = (b.x - ramp.ax) / (ramp.bx - ramp.ax || 1);
    const surfaceNow = ramp.ay + tNow * (ramp.by - ramp.ay);
    assert.ok(
      Math.abs(b.y + halfH - surfaceNow) < 28,
      `seated, feet=${b.y + halfH} surface=${surfaceNow}`,
    );
  });

  it('dirt-inside-bowl-ejects-to-surface', () => {
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 800,
      y: 720,
      vx: 0,
      vy: 40,
      onGround: false,
    });
    for (let i = 0; i < 8; i++) stepMovement(b, input({}), DT);
    assert.ok(b.y + halfH < 650, `should not stay buried, y=${b.y}`);
    assert.equal(b.onGround, true);
  });

  it('walking-into-bowl-from-pit-stays-on-surface', () => {
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 980,
      y: 850 - halfH,
      vx: -90,
      vy: 30,
      onGround: true,
    });
    for (let i = 0; i < 36; i++) stepMovement(b, input({ move: -1 }), DT);
    assert.ok(b.y + halfH < 900, `must not dump through the hill, feet=${b.y + halfH}`);
    assert.equal(b.onGround, true);
  });

  it('cave-under-rim-is-open-air', () => {
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 220,
      y: 700,
      vx: 0,
      vy: 80,
      onGround: false,
    });
    for (let i = 0; i < 40; i++) stepMovement(b, input({}), DT);
    assert.ok(b.y > 900, `should fall through the loft into the cave, y=${b.y}`);
    assert.ok(b.y + halfH < 1165, `should land on the cave floor, feet=${b.y + halfH}`);
    assert.equal(b.onGround, true);
  });

  it('cave-door-lets-you-walk-under-the-hill', () => {
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 280,
      y: 1142 - halfH,
      vx: 80,
      vy: 0,
      onGround: true,
    });
    for (let i = 0; i < 28; i++) stepMovement(b, input({ move: 1 }), DT);
    assert.ok(b.x > 450, `should pass the cave door, x=${b.x}`);
    assert.ok(b.y > 980, `should stay in the cave, y=${b.y}`);
  });

  it('jet-does-not-glue-to-nearby-ramp', () => {
    const ramp = RAMPS[0]!;
    const x = (ramp.ax + ramp.bx) / 2;
    const t = (x - ramp.ax) / (ramp.bx - ramp.ax);
    const surfaceY = ramp.ay + t * (ramp.by - ramp.ay);
    const { halfH } = playerHalfExtents(false);
    const startY = surfaceY - halfH - 18;
    const b = body({
      x,
      y: startY,
      vx: 40,
      vy: -80,
      onGround: false,
      fuel: 100,
      holdJet: true,
    });
    for (let i = 0; i < 12; i++) stepMovement(b, input({ jet: true, move: 1 }), DT);
    assert.equal(b.onGround, false);
    assert.ok(b.y < startY - 8, `should climb away, y=${b.y} start=${startY}`);
    assert.ok(b.y + halfH < surfaceY - 4, `must not snap onto ramp, feet=${b.y + halfH} surface=${surfaceY}`);
  });

  it('jump-clears-ramp', () => {
    const ramp = RAMPS[0]!;
    const x = (ramp.ax + ramp.bx) / 2;
    const t = (x - ramp.ax) / (ramp.bx - ramp.ax);
    const surfaceY = ramp.ay + t * (ramp.by - ramp.ay);
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x,
      y: surfaceY - halfH,
      vx: 40,
      vy: 0,
      onGround: true,
      fuel: 100,
    });
    stepMovement(b, input({ jet: true }), DT);
    assert.equal(b.onGround, false);
    assert.ok(b.vy < -200, `jump should launch, vy=${b.vy}`);
    assert.ok(b.y + halfH < surfaceY - 2, `should leave the slope, feet=${b.y + halfH} surface=${surfaceY}`);
  });

  it('overlapping-ramps-do-not-yoyo', () => {
    // x=1000 sits under the left bowl and near the cave drop in X.
    const x = 1000;
    const bowl = RAMPS.find((r) => r.ax <= x && r.bx >= x && r.ay < 800)!;
    const t = (x - bowl.ax) / (bowl.bx - bowl.ax);
    const surfaceY = bowl.ay + t * (bowl.by - bowl.ay);
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x,
      y: surfaceY - halfH,
      vx: 80,
      vy: 0,
      onGround: true,
    });
    let prevY = b.y;
    for (let i = 0; i < 40; i++) {
      stepMovement(b, input({ move: 1 }), DT);
      const dy = Math.abs(b.y - prevY);
      assert.ok(dy < 28, `y jumped ${dy}px at tick ${i} (${prevY} → ${b.y})`);
      prevY = b.y;
    }
    assert.equal(b.onGround, true);
  });
});

describe('prone-and-blocking', () => {
  it('hold-crouch-still-goes-prone', () => {
    const floorTop = 850;
    const { halfH } = playerHalfExtents(false);
    const b = body({
      x: 1280,
      y: floorTop - halfH,
      onGround: true,
      vx: 0,
    });
    const ticks = Math.ceil((PLAYER.proneHoldMs + 50) / (DT * 1000));
    for (let i = 0; i < ticks; i++) {
      stepMovement(b, input({ crouch: true }), DT);
    }
    assert.equal(b.prone, true);
    assert.equal(b.crouching, true);
    const proneH = playerHalfExtents(true, true).halfH;
    assert.ok(Math.abs(b.y + proneH - floorTop) < 8, `prone feet on floor, y=${b.y}`);
  });

  it('tap-crouch-with-move-rolls-not-prone', () => {
    const floorTop = 850;
    const { halfH } = playerHalfExtents(false);
    const b = body({ x: 1280, y: floorTop - halfH, onGround: true, vx: 0 });
    stepMovement(b, input({ crouch: true, move: 1 }), DT);
    assert.ok(b.rollMs > 0);
    assert.equal(b.prone, false);
  });

  it('separate-pushes-overlapping-bodies', () => {
    const { halfW, halfH } = playerHalfExtents(false);
    const a = body({ x: 400, y: 400, vx: 0 });
    separateFromSolids(a, [{ x: 408, y: 400, halfW, halfH, vx: 0 }]);
    assert.ok(Math.abs(a.x - 400) > 2, `should unstick, x=${a.x}`);
  });

  it('separate-allows-standing-on-shoulders', () => {
    const { halfW, halfH } = playerHalfExtents(false);
    const a = body({ x: 400, y: 400 - halfH, vx: 0, vy: 20 });
    separateFromSolids(a, [{ x: 400, y: 400 + halfH - 4, halfW, halfH, vx: 0 }]);
    assert.equal(a.onGround, true);
    assert.ok(a.y < 400, `should rest on top, y=${a.y}`);
  });
});

describe('sim-tick', () => {
  it('tick-is-near-60hz', () => {
    assert.ok(TICK_MS <= 16, `expected ~60 Hz tick, got ${TICK_MS}ms`);
  });
});

describe('limited-jetpack', () => {
  it('held-jet-climbs-against-gravity', () => {
    const b = body({ onGround: false, vy: 0, x: 1280, y: 350, fuel: 100 });
    const startY = b.y;
    for (let i = 0; i < 20; i++) stepMovement(b, input({ jet: true }), DT);
    assert.ok(b.jetting, 'should still be jetting');
    assert.ok(b.y < startY - 40, `should climb, y ${b.y} from ${startY}`);
    assert.ok(b.vy < 0, 'velocity should be upward (negative)');
  });

  it('jet-thrust-exceeds-gravity', () => {
    const net = PLAYER.jetAcceleration + GRAVITY;
    assert.ok(net < -200, `held jet must climb (net ${net} px/s²)`);
  });

  it('fuel-lasts-across-the-arena', () => {
    const b = body({ onGround: false, x: 1280, y: 350, fuel: PLAYER.maxFuel });
    const seconds = 3.5;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      stepMovement(b, input({ jet: true }), DT);
    }
    assert.ok(b.fuel > 10, `expected remaining fuel after ${seconds}s, got ${b.fuel}`);
  });

  it('jet-strafe-adds-more-than-air-accel', () => {
    const gliding = body({ onGround: false, vx: 0, x: 1280, y: 350, fuel: 100 });
    const jetting = body({ onGround: false, vx: 0, x: 1280, y: 350, fuel: 100 });
    stepMovement(gliding, input({ move: 1 }), DT);
    stepMovement(jetting, input({ move: 1, jet: true }), DT);
    assert.ok(jetting.vx > gliding.vx + 8, `jet strafe ${jetting.vx} vs glide ${gliding.vx}`);
  });

  it('ceiling-slide-stops-upward-into-platform', () => {
    // High mid platform: x=1280 y=160 h=22 → underside at 171
    const platBottom = 160 + 11;
    const halfH = (PLAYER.height - 2) / 2;
    const b = body({
      onGround: false,
      x: 1280,
      y: platBottom + halfH + 6,
      vy: -480,
      fuel: 100,
    });
    stepMovement(b, input({ jet: true }), DT);
    assert.ok(b.y >= platBottom + halfH - 1, `should not pass through ceiling, y=${b.y}`);
    assert.ok(b.vy >= -20, `upward speed should dump, vy=${b.vy}`);
    assert.equal(b.onGround, false);
  });
});
