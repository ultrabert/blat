/**
 * @mechanic client-prediction
 *
 * Remote poses interpolate on the **server tick clock**, not the render loop.
 * Stamping every Phaser frame (even when Colyseus had not patched) made
 * adjacent samples 1 frame apart with identical poses, so the 50ms delay
 * collapsed into a snap — opponents looked lagged and stuttery.
 */
import { EXTRAPOLATE_MS, INTERP_DELAY_MS, TICK_MS } from './constants.js';

export type PoseSample = {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  aimX: number;
  aimY: number;
  alive: boolean;
  jetting: boolean;
  onGround: boolean;
  crouching: boolean;
  rolling: boolean;
  cannonball: boolean;
  backflip: boolean;
  prone: boolean;
  alpha: number;
};

export type SampledPose = Omit<PoseSample, 't'>;

function pack(s: PoseSample): SampledPose {
  return {
    x: s.x,
    y: s.y,
    vx: s.vx,
    vy: s.vy,
    facing: s.facing,
    aimX: s.aimX,
    aimY: s.aimY,
    alive: s.alive,
    jetting: s.jetting,
    onGround: s.onGround,
    crouching: s.crouching,
    rolling: s.rolling,
    cannonball: s.cannonball,
    backflip: s.backflip,
    prone: s.prone,
    alpha: s.alpha,
  };
}

function lerp(a: PoseSample, b: PoseSample, t: number): SampledPose {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    vx: a.vx + (b.vx - a.vx) * t,
    vy: a.vy + (b.vy - a.vy) * t,
    facing: t < 0.5 ? a.facing : b.facing,
    aimX: a.aimX + (b.aimX - a.aimX) * t,
    aimY: a.aimY + (b.aimY - a.aimY) * t,
    alive: b.alive,
    jetting: b.jetting,
    onGround: t < 0.5 ? a.onGround : b.onGround,
    crouching: t < 0.5 ? a.crouching : b.crouching,
    rolling: t < 0.5 ? a.rolling : b.rolling,
    cannonball: t < 0.5 ? a.cannonball : b.cannonball,
    backflip: t < 0.5 ? a.backflip : b.backflip,
    prone: t < 0.5 ? a.prone : b.prone,
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/** One snapshot per server tick; ignore out-of-order / duplicate ticks. */
export function pushPose(buf: PoseSample[], sample: PoseSample, max = 40): void {
  const last = buf[buf.length - 1];
  if (last && last.t === sample.t) {
    Object.assign(last, sample);
    return;
  }
  if (last && sample.t < last.t) return;
  buf.push(sample);
  while (buf.length > max) buf.shift();
}

/**
 * Pose at `renderAt` on the server timeline.
 * Past the latest snapshot: dead-reckon with vx/vy for up to EXTRAPOLATE_MS.
 */
export function samplePose(buf: PoseSample[], renderAt: number): SampledPose | null {
  if (!buf.length) return null;
  const first = buf[0]!;
  if (renderAt <= first.t) return pack(first);

  const last = buf[buf.length - 1]!;
  if (renderAt >= last.t) {
    const ahead = renderAt - last.t;
    if (ahead <= 0.001 || !last.alive) return pack(last);
    const dt = Math.min(ahead, EXTRAPOLATE_MS) / 1000;
    return {
      ...pack(last),
      x: last.x + last.vx * dt,
      y: last.y + last.vy * dt,
    };
  }

  let i = 0;
  while (i < buf.length - 1 && buf[i + 1]!.t < renderAt) i += 1;
  const a = buf[i]!;
  const b = buf[i + 1];
  if (!b) return pack(a);
  const span = b.t - a.t || 1;
  const t = Math.min(1, Math.max(0, (renderAt - a.t) / span));
  return lerp(a, b, t);
}

/**
 * Client estimate of server `state.now`. Advances with local dt, clamped
 * so we neither freeze waiting for a patch nor run past extrapolation.
 */
export class InterpClock {
  time = 0;
  lastServerNow = 0;

  advance(dtMs: number, serverNow: number): number {
    const dt = Math.max(0, Math.min(dtMs, TICK_MS * 5));
    if (this.lastServerNow <= 0 && serverNow > 0) {
      this.time = serverNow;
      this.lastServerNow = serverNow;
      return this.time;
    }
    this.time += dt;
    if (serverNow > this.lastServerNow) this.lastServerNow = serverNow;
    const minT = this.lastServerNow - INTERP_DELAY_MS * 2;
    const maxT = this.lastServerNow + EXTRAPOLATE_MS;
    if (this.time < minT) this.time = minT;
    if (this.time > maxT) this.time = maxT;
    return this.time;
  }

  renderAt(): number {
    return this.time - INTERP_DELAY_MS;
  }
}
