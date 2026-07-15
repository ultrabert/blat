import {
  INTERP_DELAY_MS,
  RECONCILE_SNAP_DIST,
  TICK_MS,
  type PlayerInput,
} from '../../../shared/constants';
import { copyMoveBody, stepMovement, type MoveBody } from '../../../shared/physics';
import type { PlayerState } from '../../../shared/schema';

type PendingInput = PlayerInput;

type RemoteSample = {
  t: number;
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  jetting: boolean;
  alpha: number;
};

function bodyFromServer(p: PlayerState): MoveBody {
  return {
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    fuel: p.fuel,
    facing: p.facing,
    aimX: p.aimX,
    aimY: p.aimY,
    jetting: p.jetting,
    alive: p.alive,
    onGround: !!p.onGround,
  };
}

export class PredictionController {
  predicted: MoveBody | null = null;
  private pending: PendingInput[] = [];
  private seq = 0;
  private accum = 0;
  private wasAlive = true;
  private fireLatch = false;
  private grenadeLatch = false;
  private remotes = new Map<string, RemoteSample[]>();

  latchFire(): void {
    this.fireLatch = true;
  }

  latchGrenade(): void {
    this.grenadeLatch = true;
  }

  /** Fixed-step predict + return inputs that should be sent this frame. */
  tick(
    deltaMs: number,
    sample: Omit<PlayerInput, 'seq' | 'fire' | 'grenade'>,
    serverMe: PlayerState | undefined,
  ): PlayerInput[] {
    const sent: PlayerInput[] = [];
    if (!serverMe) return sent;

    this.syncFromServerEvents(serverMe);

    if (!this.predicted) {
      this.predicted = bodyFromServer(serverMe);
    }

    this.accum += deltaMs;
    // Avoid spiral of death after tab focus
    if (this.accum > TICK_MS * 5) this.accum = TICK_MS * 5;

    while (this.accum >= TICK_MS) {
      this.seq += 1;
      const input: PlayerInput = {
        seq: this.seq,
        move: sample.move,
        jet: sample.jet,
        aimX: sample.aimX,
        aimY: sample.aimY,
        fire: this.fireLatch,
        grenade: this.grenadeLatch,
      };
      this.fireLatch = false;
      this.grenadeLatch = false;

      this.pending.push(input);
      if (this.pending.length > 64) this.pending.shift();

      if (this.predicted.alive) {
        stepMovement(this.predicted, input, TICK_MS / 1000);
      }

      sent.push(input);
      this.accum -= TICK_MS;
    }

    this.reconcile(serverMe);
    return sent;
  }

  private syncFromServerEvents(serverMe: PlayerState): void {
    if (!serverMe.alive) {
      this.predicted = bodyFromServer(serverMe);
      this.pending = [];
      this.wasAlive = false;
      return;
    }
    if (!this.wasAlive && serverMe.alive) {
      this.predicted = bodyFromServer(serverMe);
      this.pending = [];
    }
    this.wasAlive = serverMe.alive;
  }

  private reconcile(serverMe: PlayerState): void {
    if (!this.predicted || !serverMe.alive) return;

    const lastAck = serverMe.lastProcessedInput ?? 0;
    this.pending = this.pending.filter((i) => i.seq > lastAck);

    const serverBody = bodyFromServer(serverMe);
    const dx = this.predicted.x - serverBody.x;
    const dy = this.predicted.y - serverBody.y;
    const err = Math.hypot(dx, dy);

    // Replay from authoritative snapshot
    let corrected = copyMoveBody(serverBody);
    for (const input of this.pending) {
      stepMovement(corrected, input, TICK_MS / 1000);
    }

    if (err > RECONCILE_SNAP_DIST) {
      this.predicted = corrected;
      return;
    }

    // Soft blend toward corrected pose to hide tiny desync
    const blend = 0.35;
    this.predicted.x += (corrected.x - this.predicted.x) * blend;
    this.predicted.y += (corrected.y - this.predicted.y) * blend;
    this.predicted.vx = corrected.vx;
    this.predicted.vy = corrected.vy;
    this.predicted.fuel = corrected.fuel;
    this.predicted.facing = corrected.facing;
    this.predicted.aimX = corrected.aimX;
    this.predicted.aimY = corrected.aimY;
    this.predicted.jetting = corrected.jetting;
    this.predicted.onGround = corrected.onGround;
    this.predicted.alive = corrected.alive;
  }

  pushRemote(id: string, p: PlayerState, now: number): void {
    let buf = this.remotes.get(id);
    if (!buf) {
      buf = [];
      this.remotes.set(id, buf);
    }
    const last = buf[buf.length - 1];
    if (last && last.t === now) {
      last.x = p.x;
      last.y = p.y;
      last.facing = p.facing;
      last.alive = p.alive;
      last.jetting = p.jetting;
      last.alpha = p.alive ? 1 : 0.45;
      return;
    }
    buf.push({
      t: now,
      x: p.x,
      y: p.y,
      facing: p.facing,
      alive: p.alive,
      jetting: p.jetting,
      alpha: p.alive ? 1 : 0.45,
    });
    while (buf.length > 30) buf.shift();
  }

  sampleRemote(
    id: string,
    now: number,
  ): { x: number; y: number; facing: number; alive: boolean; jetting: boolean; alpha: number } | null {
    const buf = this.remotes.get(id);
    if (!buf || buf.length === 0) return null;

    const renderAt = now - INTERP_DELAY_MS;
    if (buf.length === 1 || renderAt <= buf[0]!.t) {
      const s = buf[0]!;
      return { x: s.x, y: s.y, facing: s.facing, alive: s.alive, jetting: s.jetting, alpha: s.alpha };
    }

    let i = 0;
    while (i < buf.length - 1 && buf[i + 1]!.t < renderAt) i += 1;
    const a = buf[i]!;
    const b = buf[i + 1];
    if (!b) {
      return { x: a.x, y: a.y, facing: a.facing, alive: a.alive, jetting: a.jetting, alpha: a.alpha };
    }

    const span = b.t - a.t || 1;
    const t = Math.min(1, Math.max(0, (renderAt - a.t) / span));
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      facing: t < 0.5 ? a.facing : b.facing,
      alive: b.alive,
      jetting: b.jetting,
      alpha: a.alpha + (b.alpha - a.alpha) * t,
    };
  }

  pruneRemotes(aliveIds: Set<string>): void {
    for (const id of this.remotes.keys()) {
      if (!aliveIds.has(id)) this.remotes.delete(id);
    }
  }
}
