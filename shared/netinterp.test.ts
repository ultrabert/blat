import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXTRAPOLATE_MS, INTERP_DELAY_MS, TICK_MS } from './constants.js';
import { InterpClock, pushPose, samplePose, type PoseSample } from './netinterp.js';

function pose(partial: Partial<PoseSample> & { t: number; x: number; y: number }): PoseSample {
  return {
    vx: 0,
    vy: 0,
    facing: 1,
    aimX: 1,
    aimY: 0,
    alive: true,
    jetting: false,
    onGround: true,
    crouching: false,
    rolling: false,
    cannonball: false,
    backflip: false,
    prone: false,
    alpha: 1,
    ...partial,
  };
}

describe('net-interp', () => {
  it('one-sample-per-server-tick', () => {
    const buf: PoseSample[] = [];
    pushPose(buf, pose({ t: 1000, x: 10, y: 20 }));
    pushPose(buf, pose({ t: 1000, x: 11, y: 21 }));
    assert.equal(buf.length, 1);
    assert.equal(buf[0]!.x, 11);
    pushPose(buf, pose({ t: 1000 + TICK_MS, x: 12, y: 22 }));
    assert.equal(buf.length, 2);
  });

  it('ignores-out-of-order-snapshots', () => {
    const buf: PoseSample[] = [];
    pushPose(buf, pose({ t: 1020, x: 20, y: 0 }));
    pushPose(buf, pose({ t: 1000, x: 0, y: 0 }));
    assert.equal(buf.length, 1);
    assert.equal(buf[0]!.x, 20);
  });

  it('lerps-between-server-ticks', () => {
    const buf: PoseSample[] = [];
    pushPose(buf, pose({ t: 1000, x: 0, y: 0 }));
    pushPose(buf, pose({ t: 1032, x: 32, y: 0 }));
    const mid = samplePose(buf, 1016);
    assert.ok(mid);
    assert.equal(mid.x, 16);
  });

  it('extrapolates-with-velocity', () => {
    const buf: PoseSample[] = [];
    pushPose(buf, pose({ t: 1000, x: 0, y: 0, vx: 200, vy: 0 }));
    const ahead = samplePose(buf, 1000 + 40);
    assert.ok(ahead);
    assert.equal(ahead.x, 200 * 0.04);
  });

  it('does-not-extrapolate-dead-bodies', () => {
    const buf: PoseSample[] = [];
    pushPose(buf, pose({ t: 1000, x: 50, y: 50, vx: 400, alive: false }));
    const ahead = samplePose(buf, 1000 + EXTRAPOLATE_MS);
    assert.ok(ahead);
    assert.equal(ahead.x, 50);
  });

  it('clock-renders-behind-server-now', () => {
    const clock = new InterpClock();
    clock.advance(16, 5000);
    assert.equal(clock.renderAt(), 5000 - INTERP_DELAY_MS);
    clock.advance(16, 5000);
    assert.ok(clock.time <= 5000 + EXTRAPOLATE_MS);
  });

  it('clock-catches-up-when-patches-arrive', () => {
    const clock = new InterpClock();
    clock.advance(16, 1000);
    clock.advance(16, 1000 + TICK_MS * 20);
    assert.ok(clock.lastServerNow >= 1000 + TICK_MS * 20);
    assert.ok(clock.time >= clock.lastServerNow - INTERP_DELAY_MS * 2);
  });
});
