/**
 * @mechanic client-prediction
 *
 * Observatory for snapshot cadence and remote smoothness — not WAN RTT.
 * Local /demo is loopback (~0 ms). Use the synthetic-delay tests in
 * `lag.test.ts` for 80/150 ms prediction quality. Live Fly geography
 * still cannot be judged from a Cloud Agent VM.
 */
import { EXTRAPOLATE_MS, INTERP_DELAY_MS, TICK_MS } from './constants.js';

/** One-frame teleport, not a turn or knockback. */
export const LAG_SNAP_PX = 36;
export const LAG_PATCH_OK_MS = 28;
export const LAG_JERK_OK_PX = 8;

export type LagReport = {
  patchMs: number;
  behindMs: number;
  extraMs: number;
  jerkPx: number;
  snaps: number;
  samples: number;
  ok: boolean;
  line: string;
};

export function formatLagLine(r: Omit<LagReport, 'line' | 'ok'> & { ok: boolean }): string {
  const flag = r.ok ? 'OK' : 'WARM';
  return `LAG  patch ${Math.round(r.patchMs)}ms  behind ${Math.round(r.behindMs)}  extra ${Math.round(r.extraMs)}  jerk ${Math.round(r.jerkPx)}px  snaps ${r.snaps}  ${flag}`;
}

export function lagLooksHealthy(r: Pick<LagReport, 'patchMs' | 'behindMs' | 'extraMs'>): boolean {
  const behindOk = Math.abs(r.behindMs - INTERP_DELAY_MS) <= INTERP_DELAY_MS + 8;
  return r.patchMs <= LAG_PATCH_OK_MS && r.extraMs <= EXTRAPOLATE_MS + 8 && behindOk;
}

export class LagMeter {
  private lastNow = 0;
  private patchEma = TICK_MS;
  private jerkEma = 0;
  private extraEma = 0;
  private snaps = 0;
  private snapWindowAt = 0;
  private samples = 0;
  private lastPos = new Map<string, { x: number; y: number }>();

  reset(): void {
    this.lastNow = 0;
    this.patchEma = TICK_MS;
    this.jerkEma = 0;
    this.extraEma = 0;
    this.snaps = 0;
    this.snapWindowAt = 0;
    this.samples = 0;
    this.lastPos.clear();
  }

  /** Call when `state.now` is read. Only counts when the sim clock advanced. */
  noteServerNow(serverNow: number, _wallMs: number): void {
    if (serverNow > this.lastNow && this.lastNow > 0) {
      const gap = serverNow - this.lastNow;
      this.patchEma += (gap - this.patchEma) * 0.2;
    }
    this.lastNow = serverNow;
  }

  /**
   * Sample an interpolated remote this render frame.
   * `extraMs` is how far `renderAt` is past that remote’s latest snapshot.
   */
  noteRemote(
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dtMs: number,
    extraMs: number,
    wallMs: number,
  ): void {
    const prev = this.lastPos.get(id);
    this.lastPos.set(id, { x, y });
    this.extraEma += (Math.max(0, extraMs) - this.extraEma) * 0.2;
    this.samples += 1;
    if (wallMs - this.snapWindowAt > 3000) {
      this.snaps = 0;
      this.snapWindowAt = wallMs;
    }
    if (!prev || dtMs <= 0.5) return;
    const dt = dtMs / 1000;
    const actual = Math.hypot(x - prev.x, y - prev.y);
    const expected = Math.hypot(vx, vy) * dt;
    const jerk = Math.abs(actual - expected);
    this.jerkEma += (jerk - this.jerkEma) * 0.25;
    if (actual > LAG_SNAP_PX && actual > expected + LAG_SNAP_PX * 0.5) this.snaps += 1;
  }

  report(behindMs: number): LagReport {
    const body = {
      patchMs: this.patchEma,
      behindMs,
      extraMs: this.extraEma,
      jerkPx: this.jerkEma,
      snaps: this.snaps,
      samples: this.samples,
      ok: lagLooksHealthy({
        patchMs: this.patchEma,
        behindMs,
        extraMs: this.extraEma,
      }),
    };
    return { ...body, line: formatLagLine(body) };
  }
}
