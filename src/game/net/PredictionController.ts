import {
  INTERP_DELAY_MS,
  PLAYER,
  RECONCILE_SNAP_DIST,
  TICK_MS,
  playerHalfExtents,
  type PlayerInput,
} from '../../../shared/constants';
import { copyMoveBody, separateFromSolids, stepMovement, type MoveBody } from '../../../shared/physics';
import type { PlayerState } from '../../../shared/schema';

type PendingInput = PlayerInput;

type RemoteSample = {
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
    crouching: !!p.crouching,
    rollMs: p.rollMs ?? (p.rolling ? 80 : 0),
    rollCdMs: 0,
    rollDir: p.rolling ? p.facing || 1 : 0,
    holdCrouch: !!p.crouching,
    holdJet: !!p.jetting,
    recoil: 0,
    landGraceMs: 0,
    cannonballMs: p.cannonball ? 120 : 0,
    backflipMs: p.backflip ? 120 : 0,
    prone: !!p.prone,
    proneHoldMs: p.prone ? PLAYER.proneHoldMs : 0,
  };
}

export class PredictionController {
  predicted: MoveBody | null = null;
  private pending: PendingInput[] = [];
  private seq = 0;
  private accum = 0;
  private wasAlive = true;
  private fireLatch = false;
  private grenadeHeld = false;
  private reloadLatch = false;
  private dropLatch = false;
  private nadeCycleLatch = false;
  private remotes = new Map<string, RemoteSample[]>();

  latchFire(): void {
    this.fireLatch = true;
  }

  latchReload(): void {
    this.reloadLatch = true;
  }

  latchDrop(): void {
    this.dropLatch = true;
  }

  latchNadeCycle(): void {
    this.nadeCycleLatch = true;
  }

  setGrenadeHeld(held: boolean): void {
    this.grenadeHeld = held;
  }

  /** Fixed-step predict + return inputs that should be sent this frame. */
  tick(
    deltaMs: number,
    sample: Omit<PlayerInput, 'seq' | 'fire' | 'grenade' | 'reload' | 'drop' | 'nadeCycle'>,
    serverMe: PlayerState | undefined,
  ): PlayerInput[] {
    const sent: PlayerInput[] = [];
    if (!serverMe) return sent;

    this.syncFromServerEvents(serverMe);

    if (!this.predicted) {
      this.predicted = bodyFromServer(serverMe);
    }

    this.accum += deltaMs;
    if (this.accum > TICK_MS * 5) this.accum = TICK_MS * 5;

    while (this.accum >= TICK_MS) {
      this.seq += 1;
      const input: PlayerInput = {
        seq: this.seq,
        move: sample.move,
        jet: sample.jet,
        crouch: sample.crouch,
        aimX: sample.aimX,
        aimY: sample.aimY,
        fire: this.fireLatch,
        grenade: this.grenadeHeld,
        reload: this.reloadLatch,
        drop: this.dropLatch,
        nadeCycle: this.nadeCycleLatch,
      };
      this.fireLatch = false;
      this.reloadLatch = false;
      this.dropLatch = false;
      this.nadeCycleLatch = false;

      this.pending.push(input);
      if (this.pending.length > 64) this.pending.shift();

      if (this.predicted.alive) {
        stepMovement(this.predicted, input, TICK_MS / 1000);
        const blockers = [];
        for (const buf of this.remotes.values()) {
          const s = buf[buf.length - 1];
          if (!s?.alive) continue;
          const h = playerHalfExtents(s.crouching, s.prone);
          blockers.push({ x: s.x, y: s.y, halfW: h.halfW, halfH: h.halfH, vx: s.vx });
        }
        separateFromSolids(this.predicted, blockers);
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

    // While rolling / diving / flipping, trust local prediction.
    if (this.predicted.rollMs > 0 || this.predicted.cannonballMs > 0 || this.predicted.backflipMs > 0) {
      const dx = this.predicted.x - serverMe.x;
      const dy = this.predicted.y - serverMe.y;
      if (Math.hypot(dx, dy) > RECONCILE_SNAP_DIST * 2.5) {
        this.predicted.x = serverMe.x;
        this.predicted.y = serverMe.y;
      }
      return;
    }

    const serverBody = bodyFromServer(serverMe);
    serverBody.rollCdMs = this.predicted.rollCdMs;
    serverBody.holdCrouch = this.predicted.holdCrouch;
    serverBody.holdJet = this.predicted.holdJet;
    serverBody.landGraceMs = this.predicted.landGraceMs;
    serverBody.cannonballMs = this.predicted.cannonballMs;
    serverBody.backflipMs = this.predicted.backflipMs;
    // Recoil kicks happen in ProjectilePredictor (not replayed here) — keep local.
    serverBody.recoil = this.predicted.recoil;

    const dx = this.predicted.x - serverBody.x;
    const dy = this.predicted.y - serverBody.y;
    const err = Math.hypot(dx, dy);

    const savedRecoil = this.predicted.recoil;
    let corrected = copyMoveBody(serverBody);
    for (const input of this.pending) {
      stepMovement(corrected, input, TICK_MS / 1000);
    }

    // If replay just started a special move, adopt it fully (no blend)
    if (corrected.rollMs > 0 || corrected.cannonballMs > 0 || corrected.backflipMs > 0) {
      corrected.recoil = savedRecoil;
      this.predicted = corrected;
      return;
    }

    if (err > RECONCILE_SNAP_DIST) {
      corrected.recoil = savedRecoil;
      this.predicted = corrected;
      return;
    }

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
    this.predicted.crouching = corrected.crouching;
    this.predicted.prone = corrected.prone;
    this.predicted.proneHoldMs = corrected.proneHoldMs;
    this.predicted.rollMs = corrected.rollMs;
    this.predicted.rollCdMs = corrected.rollCdMs;
    this.predicted.rollDir = corrected.rollDir;
    this.predicted.holdCrouch = corrected.holdCrouch;
    this.predicted.holdJet = corrected.holdJet;
    this.predicted.landGraceMs = corrected.landGraceMs;
    this.predicted.cannonballMs = corrected.cannonballMs;
    this.predicted.backflipMs = corrected.backflipMs;
    this.predicted.alive = corrected.alive;
    this.predicted.recoil = savedRecoil;
  }

  pushRemote(id: string, p: PlayerState, now: number): void {
    let buf = this.remotes.get(id);
    if (!buf) {
      buf = [];
      this.remotes.set(id, buf);
    }
    const sample = {
      t: now,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      aimX: p.aimX,
      aimY: p.aimY,
      alive: p.alive,
      jetting: p.jetting,
      onGround: !!p.onGround,
      crouching: !!p.crouching,
      rolling: !!p.rolling,
      cannonball: !!p.cannonball,
      backflip: !!p.backflip,
      prone: !!p.prone,
      alpha: p.alive ? 1 : 0.45,
    };
    const last = buf[buf.length - 1];
    if (last && last.t === now) {
      Object.assign(last, sample);
      return;
    }
    buf.push(sample);
    while (buf.length > 30) buf.shift();
  }

  sampleRemote(id: string, now: number): Omit<RemoteSample, 't'> | null {
    const buf = this.remotes.get(id);
    if (!buf || buf.length === 0) return null;

    const renderAt = now - INTERP_DELAY_MS;
    const pack = (s: RemoteSample): Omit<RemoteSample, 't'> => ({
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
    });

    if (buf.length === 1 || renderAt <= buf[0]!.t) return pack(buf[0]!);

    let i = 0;
    while (i < buf.length - 1 && buf[i + 1]!.t < renderAt) i += 1;
    const a = buf[i]!;
    const b = buf[i + 1];
    if (!b) return pack(a);

    const span = b.t - a.t || 1;
    const t = Math.min(1, Math.max(0, (renderAt - a.t) / span));
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

  pruneRemotes(aliveIds: Set<string>): void {
    for (const id of this.remotes.keys()) {
      if (!aliveIds.has(id)) this.remotes.delete(id);
    }
  }
}
