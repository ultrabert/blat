/**
 * @mechanic client-prediction
 *
 * Lag quality gates an agent can run without Fly:
 * - Remote smoothness when snapshots arrive on the sim clock
 * - Regression: stamping a pose every render frame (the old stutter bug)
 * - Prediction replay cancels synthetic 80/150 ms input delay
 *
 * These do **not** measure internet RTT. Local /demo is loopback.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EXTRAPOLATE_MS,
  INTERP_DELAY_MS,
  PLAYER,
  TICK_MS,
  playerHalfExtents,
} from './constants.js';
import { LAG_JERK_OK_PX, LAG_SNAP_PX, lagLooksHealthy } from './lagMeter.js';
import { InterpClock, pushPose, samplePose, type PoseSample } from './netinterp.js';
import { copyMoveBody, stepMovement, type MoveBody, type MoveInput } from './physics.js';

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

function walkBody(): MoveBody {
  const { halfH } = playerHalfExtents(false);
  return {
    x: 1100,
    y: 830 - halfH,
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
  };
}

function walkInput(): MoveInput {
  return { move: 1, jet: false, crouch: false, aimX: 1, aimY: 0 };
}

/** Play the timeline the way the client does: patches as they arrive, render in between. */
function playRemote(
  patchEveryMs: number,
  renderEveryMs: number,
  durationMs: number,
  vx: number,
  opts: { skipEvery?: number; renderClockStamps?: boolean } = {},
): { jerkMax: number; snaps: number; behind: number } {
  const buf: PoseSample[] = [];
  const clock = new InterpClock();
  let wall = 0;
  let serverT = 0;
  let skip = 0;
  let lastX = 0;
  let lastY = 0;
  let have = false;
  let jerkMax = 0;
  let behind = 0;
  while (wall <= durationMs) {
    while (serverT + patchEveryMs <= wall + 0.001) {
      serverT += patchEveryMs;
      skip += 1;
      if (!opts.skipEvery || skip % opts.skipEvery !== 0) {
        pushPose(buf, pose({ t: serverT, x: vx * (serverT / 1000), y: 400, vx }));
      }
    }
    const last = buf[buf.length - 1];
    if (opts.renderClockStamps && last) {
      pushPose(buf, pose({ t: wall, x: last.x, y: 400, vx: 0 }));
    }
    if (last) clock.advance(renderEveryMs, last.t);
    const sampled = samplePose(buf, clock.renderAt());
    if (sampled && have) {
      const jump = Math.hypot(sampled.x - lastX, sampled.y - lastY);
      const expected = Math.hypot(sampled.vx, sampled.vy) * (renderEveryMs / 1000);
      jerkMax = Math.max(jerkMax, Math.abs(jump - expected));
    }
    if (sampled) {
      lastX = sampled.x;
      lastY = sampled.y;
      have = true;
    }
    behind = clock.lastServerNow - clock.renderAt();
    wall += renderEveryMs;
  }
  return { jerkMax, snaps: jerkMax > LAG_SNAP_PX ? 1 : 0, behind };
}

describe('lag-observatory', () => {
  it('steady-snapshots-stay-smooth-at-60fps', () => {
    const { jerkMax, snaps, behind } = playRemote(TICK_MS, 16.67, 640, 200);
    assert.ok(
      behind >= 8 && behind <= INTERP_DELAY_MS + EXTRAPOLATE_MS,
      `behind ${behind} should stay in the delay/extra window (target ${INTERP_DELAY_MS})`,
    );
    assert.equal(snaps, 0, 'constant-velocity remotes must not teleport');
    assert.ok(
      jerkMax < LAG_JERK_OK_PX,
      `60fps samples should track velocity, jerkMax=${jerkMax.toFixed(2)}`,
    );
  });

  it('dropped-snapshot-extrapolates-instead-of-teleport', () => {
    const { jerkMax } = playRemote(TICK_MS, 16, 480, 180, { skipEvery: 8 });
    assert.ok(jerkMax < LAG_SNAP_PX, `gap should dead-reckon, jerkMax=${jerkMax.toFixed(2)}`);
  });

  it('stamp-every-render-frame-is-the-stutter-bug', () => {
    const g = playRemote(TICK_MS, 8, 480, 240);
    // Batched patches + a sample every render frame with client time: delay
    // sits on a pose plateau, then a multi-tick jump lerps in one frame.
    const b = playRemote(48, 8, 480, 240, { renderClockStamps: true });
    assert.ok(g.jerkMax < LAG_JERK_OK_PX, `server-clock interp must stay smooth, ${g.jerkMax}`);
    assert.ok(
      b.jerkMax > 8 && b.jerkMax > g.jerkMax * 2,
      `render-clock stamps on batched patches should snap (good ${g.jerkMax.toFixed(2)} vs bad ${b.jerkMax.toFixed(2)})`,
    );
  });

  it('raw-pose-error-grows-with-80ms-rtt', () => {
    const delayTicks = Math.round(80 / TICK_MS);
    const client = walkBody();
    const server = walkBody();
    const inflight: MoveInput[] = [];
    let maxRaw = 0;
    for (let i = 0; i < 40; i++) {
      const inp = walkInput();
      stepMovement(client, inp, TICK_MS / 1000);
      inflight.push(inp);
      if (inflight.length > delayTicks) {
        stepMovement(server, inflight.shift()!, TICK_MS / 1000);
      }
      if (i > delayTicks + 2) {
        maxRaw = Math.max(maxRaw, Math.hypot(client.x - server.x, client.y - server.y));
      }
    }
    const expected = PLAYER.speed * (delayTicks * TICK_MS) / 1000;
    assert.ok(maxRaw > expected * 0.45, `unpredicted lag should show, raw=${maxRaw.toFixed(1)} expected~${expected.toFixed(1)}`);
  });

  it('replay-cancels-80ms-input-delay', () => {
    const delayTicks = Math.round(80 / TICK_MS);
    const client = walkBody();
    const server = walkBody();
    const inflight: MoveInput[] = [];
    let maxReplay = 0;
    for (let i = 0; i < 48; i++) {
      const inp = walkInput();
      stepMovement(client, inp, TICK_MS / 1000);
      inflight.push(inp);
      if (inflight.length > delayTicks) {
        stepMovement(server, inflight.shift()!, TICK_MS / 1000);
      }
      const replayed = copyMoveBody(server);
      for (const pending of inflight) stepMovement(replayed, pending, TICK_MS / 1000);
      maxReplay = Math.max(maxReplay, Math.hypot(client.x - replayed.x, client.y - replayed.y));
    }
    assert.ok(
      maxReplay < 2,
      `shared-math replay must cancel ${delayTicks} ticks of delay, err=${maxReplay.toFixed(3)}`,
    );
  });

  it('replay-cancels-150ms-input-delay', () => {
    const delayTicks = Math.round(150 / TICK_MS);
    const client = walkBody();
    const server = walkBody();
    const inflight: MoveInput[] = [];
    let maxReplay = 0;
    for (let i = 0; i < 60; i++) {
      const inp = walkInput();
      stepMovement(client, inp, TICK_MS / 1000);
      inflight.push(inp);
      if (inflight.length > delayTicks) {
        stepMovement(server, inflight.shift()!, TICK_MS / 1000);
      }
      const replayed = copyMoveBody(server);
      for (const pending of inflight) stepMovement(replayed, pending, TICK_MS / 1000);
      maxReplay = Math.max(maxReplay, Math.hypot(client.x - replayed.x, client.y - replayed.y));
    }
    assert.ok(maxReplay < 2, `150ms replay err=${maxReplay.toFixed(3)}`);
  });

  it('interp-clock-stays-in-delay-budget-under-jitter', () => {
    const clock = new InterpClock();
    let now = 1000;
    const gaps = [16, 16, 48, 8, 16, 32, 16, 16, 5, 16];
    for (const gap of gaps) {
      now += gap;
      clock.advance(16, now);
      assert.ok(clock.time >= clock.lastServerNow - INTERP_DELAY_MS * 2 - 1);
      assert.ok(clock.time <= clock.lastServerNow + EXTRAPOLATE_MS + 1);
      assert.equal(clock.renderAt(), clock.time - INTERP_DELAY_MS);
    }
  });

  it('slow-client-frames-are-not-net-lag', () => {
    assert.equal(
      lagLooksHealthy({ patchMs: 64, frameMs: 62, behindMs: 20, extraMs: 2 }),
      true,
      'patch matching a slow frame is OK',
    );
    assert.equal(
      lagLooksHealthy({ patchMs: 64, frameMs: 16, behindMs: 33, extraMs: 2 }),
      false,
      '64ms patches on a 16ms client is WARM',
    );
  });
});
