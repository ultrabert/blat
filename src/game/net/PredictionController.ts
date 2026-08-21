/**
 * @mechanic client-prediction
 */
import {
  PLAYER,
  RECONCILE_SNAP_DIST,
  TICK_MS,
  playerHalfExtents,
  type PlayerInput,
} from '../../../shared/constants';
import {
  InterpClock,
  pushPose,
  samplePose,
  type PoseSample,
  type SampledPose,
} from '../../../shared/netinterp';
import { copyMoveBody, separateFromSolids, stepMovement, type MoveBody } from '../../../shared/physics';
import type { PlayerState } from '../../../shared/schema';

type PendingInput = PlayerInput;

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
    dashCdMs: p.dashCd || 0,
    dashMs: 0,
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
  private grenadePulse = false;
  private reloadLatch = false;
  private dropLatch = false;
  private nadeCycleLatch = false;
  private blatLatch = false;
  private dashLatch = false;
  private tossFlagLatch = false;
  private realistic = false;
  private windVx = 0;
  private remotes = new Map<string, PoseSample[]>();
  private clock = new InterpClock();

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

  latchBlat(): void {
    this.blatLatch = true;
  }

  latchDash(): void {
    this.dashLatch = true;
  }

  latchTossFlag(): void {
    this.tossFlagLatch = true;
  }

  setWorld(realistic: boolean, windVx: number): void {
    this.realistic = realistic;
    this.windVx = windVx;
  }

  setGrenadeHeld(held: boolean): void {
    this.grenadeHeld = held;
  }

  /** One-tick cook so an RMB/G tap still leaves the hand. */
  pulseGrenade(): void {
    this.grenadePulse = true;
  }

  grenadePending(): boolean {
    return this.grenadeHeld || this.grenadePulse;
  }

  /** Fixed-step predict + return inputs that should be sent this frame. */
  tick(
    deltaMs: number,
    sample: Omit<
      PlayerInput,
      'seq' | 'fire' | 'grenade' | 'reload' | 'drop' | 'nadeCycle' | 'blat' | 'dash' | 'tossFlag'
    > & { fireHeld?: boolean },
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

    let stepped = false;
    while (this.accum >= TICK_MS) {
      this.seq += 1;
      const input: PlayerInput = {
        seq: this.seq,
        move: sample.move,
        jet: sample.jet,
        crouch: sample.crouch,
        aimX: sample.aimX,
        aimY: sample.aimY,
        fire: this.fireLatch || !!sample.fireHeld,
        grenade: this.grenadeHeld || this.grenadePulse,
        reload: this.reloadLatch,
        drop: this.dropLatch,
        nadeCycle: this.nadeCycleLatch,
        blat: this.blatLatch,
        dash: this.dashLatch,
        tossFlag: this.tossFlagLatch,
      };
      this.fireLatch = false;
      this.grenadePulse = false;
      this.reloadLatch = false;
      this.dropLatch = false;
      this.nadeCycleLatch = false;
      this.blatLatch = false;
      this.dashLatch = false;
      this.tossFlagLatch = false;

      this.pending.push(input);
      if (this.pending.length > 64) this.pending.shift();

      if (this.predicted.alive) {
        this.predicted.realistic = this.realistic;
        this.predicted.windVx = this.windVx;
        this.predicted.berserk = serverMe.bonus === 'berserk';
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
      stepped = true;
    }

    if (stepped) this.reconcile(serverMe);
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
    serverBody.dashMs = this.predicted.dashMs;
    serverBody.dashCdMs = this.predicted.dashCdMs;
    // Recoil kicks happen in ProjectilePredictor (not replayed here) — keep local.
    serverBody.recoil = this.predicted.recoil;
    serverBody.realistic = this.realistic;
    serverBody.windVx = this.windVx;
    serverBody.berserk = serverMe.bonus === 'berserk';

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

    // Compare against the replayed pose. Pre-replay error is just RTT×speed
    // and was snapping every jet tick.
    const dx = this.predicted.x - corrected.x;
    const dy = this.predicted.y - corrected.y;
    const err = Math.hypot(dx, dy);

    if (err > RECONCILE_SNAP_DIST) {
      corrected.recoil = savedRecoil;
      this.predicted = corrected;
      return;
    }

    // Ignore patch noise — blending a 2px error every tick hops on slopes.
    if (err < 8) {
      this.predicted.vx += (corrected.vx - this.predicted.vx) * 0.25;
      this.predicted.vy += (corrected.vy - this.predicted.vy) * 0.25;
      this.predicted.fuel = corrected.fuel;
      this.predicted.recoil = savedRecoil;
      return;
    }

    const blend = 0.2;
    const bothGrounded = this.predicted.onGround && corrected.onGround;
    this.predicted.x += (corrected.x - this.predicted.x) * blend;
    if (bothGrounded) {
      // Keep local Y. Replay Y is the slope at a lagged X; copying it lifts
      // you off the surface, then collide snaps back — visual hopping.
    } else {
      this.predicted.y += (corrected.y - this.predicted.y) * blend;
    }
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

  /** Drive remote interpolation from server `state.now`. */
  advanceClock(dtMs: number, serverNow: number): void {
    this.clock.advance(dtMs, serverNow);
  }

  pushRemote(id: string, p: PlayerState, serverNow: number): void {
    let buf = this.remotes.get(id);
    if (!buf) {
      buf = [];
      this.remotes.set(id, buf);
    }
    pushPose(buf, {
      t: serverNow,
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
    });
  }

  sampleRemote(id: string): SampledPose | null {
    const buf = this.remotes.get(id);
    if (!buf || buf.length === 0) return null;
    return samplePose(buf, this.clock.renderAt());
  }

  pruneRemotes(aliveIds: Set<string>): void {
    for (const id of this.remotes.keys()) {
      if (!aliveIds.has(id)) this.remotes.delete(id);
    }
  }
}
