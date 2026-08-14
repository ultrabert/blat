import {
  BOT,
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
  SPAWNS,
  type PlayerInput,
} from './constants.js';
import { bodyDamageMult, fireDirection, shotgunBlastDirections } from './accuracy.js';
import { fellOutOfWorld, stepMovement, type MoveBody } from './physics.js';
import { ballisticDamage, BALLISTICS, muzzleVelocity, stepBallistic } from './ballistics.js';
import { blastImpulse, bulletImpulse, GRENADE, remainingFuse } from './grenades.js';
import { traceBullet } from './trace.js';
import {
  BulletState,
  GameState,
  GrenadeState,
  PickupState,
  PlayerState,
} from './schema.js';
import {
  DEFAULT_WEAPON,
  isWeaponId,
  PICKUP_RADIUS,
  PICKUP_RESPAWN_MS,
  WEAPON_PICKUPS,
  WEAPONS,
  type WeaponId,
} from './weapons.js';

const MAX_INPUT_QUEUE = 48;
/** When buffered, drain extra steps so seqs aren't dropped. */
const MAX_INPUT_CATCHUP = 3;

type InternalSoldier = {
  state: PlayerState;
  input: PlayerInput;
  inputQueue: PlayerInput[];
  onGround: boolean;
  rollMs: number;
  rollCdMs: number;
  rollDir: number;
  holdCrouch: boolean;
  holdJet: boolean;
  recoil: number;
  landGraceMs: number;
  cannonballMs: number;
  backflipMs: number;
  /** Pin pulled — fuse ticks until throw or self-blast. */
  cooking: boolean;
  cookStartedAt: number;
  lastFireAt: number;
  lastGrenadeAt: number;
  respawnAt: number;
  botThinkAt: number;
  botTargetId: string | null;
  botRetargetAt: number;
  botMoveStyle: 0 | 1 | 2;
  botStrafeDir: -1 | 1;
  botStyleUntil: number;
  lastQueuedSeq: number;
};

type InternalBullet = {
  state: BulletState;
  bornAt: number;
  power: number;
  baseDamage: number;
  weapon: WeaponId;
};

type InternalGrenade = {
  state: GrenadeState;
  explodeAt: number;
};

type InternalPickup = {
  state: PickupState;
  respawnAt: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function randomSpawn(): { x: number; y: number } {
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)]!;
}

let nextEntityId = 1;
function eid(prefix: string): string {
  return `${prefix}_${nextEntityId++}`;
}

function toMoveBody(soldier: InternalSoldier): MoveBody {
  const p = soldier.state;
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
    onGround: soldier.onGround,
    crouching: p.crouching,
    rollMs: soldier.rollMs,
    rollCdMs: soldier.rollCdMs,
    rollDir: soldier.rollDir,
    holdCrouch: soldier.holdCrouch,
    holdJet: soldier.holdJet,
    recoil: soldier.recoil,
    landGraceMs: soldier.landGraceMs,
    cannonballMs: soldier.cannonballMs,
    backflipMs: soldier.backflipMs,
  };
}

function fromMoveBody(soldier: InternalSoldier, body: MoveBody): void {
  const p = soldier.state;
  p.x = body.x;
  p.y = body.y;
  p.vx = body.vx;
  p.vy = body.vy;
  p.fuel = body.fuel;
  p.facing = body.facing;
  p.aimX = body.aimX;
  p.aimY = body.aimY;
  p.jetting = body.jetting;
  p.onGround = body.onGround;
  p.crouching = body.crouching;
  p.rolling = body.rollMs > 0;
  p.rollMs = body.rollMs;
  p.cannonball = body.cannonballMs > 0;
  p.backflip = body.backflipMs > 0;
  soldier.onGround = body.onGround;
  soldier.rollMs = body.rollMs;
  soldier.rollCdMs = body.rollCdMs;
  soldier.rollDir = body.rollDir;
  soldier.holdCrouch = body.holdCrouch;
  soldier.holdJet = body.holdJet;
  soldier.recoil = body.recoil;
  soldier.landGraceMs = body.landGraceMs;
  soldier.cannonballMs = body.cannonballMs;
  soldier.backflipMs = body.backflipMs;
}

function normalizeInput(input: PlayerInput, seq: number): PlayerInput {
  return {
    seq,
    move: clamp(Math.round(input.move), -1, 1),
    jet: !!input.jet,
    crouch: !!input.crouch,
    aimX: input.aimX,
    aimY: input.aimY,
    fire: !!input.fire,
    grenade: !!input.grenade,
  };
}

function idleInput(seq = 0): PlayerInput {
  return {
    seq,
    move: 0,
    jet: false,
    crouch: false,
    aimX: 1,
    aimY: 0,
    fire: false,
    grenade: false,
  };
}

export class Simulation {
  readonly soldiers = new Map<string, InternalSoldier>();
  private bullets = new Map<string, InternalBullet>();
  private grenades = new Map<string, InternalGrenade>();
  private pickups = new Map<string, InternalPickup>();
  private now = 0;

  constructor(private readonly state: GameState) {
    this.initPickups();
  }

  private initPickups(): void {
    for (const spec of WEAPON_PICKUPS) {
      const p = new PickupState();
      p.id = spec.id;
      p.weapon = spec.weapon;
      p.x = spec.x;
      p.y = spec.y;
      p.active = true;
      this.state.pickups.set(spec.id, p);
      this.pickups.set(spec.id, { state: p, respawnAt: 0 });
    }
  }

  addPlayer(id: string, name: string, isBot = false): PlayerState {
    const spawn = randomSpawn();
    const p = new PlayerState();
    p.id = id;
    p.name = name;
    p.isBot = isBot;
    p.x = spawn.x;
    p.y = spawn.y;
    p.health = PLAYER.maxHealth;
    p.fuel = PLAYER.maxFuel;
    p.grenades = PLAYER.maxGrenades;
    p.alive = true;
    p.onGround = false;
    p.crouching = false;
    p.rolling = false;
    p.weapon = DEFAULT_WEAPON;
    p.ownedSniper = false;
    p.ownedShotgun = false;
    p.lastProcessedInput = 0;
    this.state.players.set(id, p);
    this.soldiers.set(id, {
      state: p,
      input: idleInput(0),
      inputQueue: [],
      onGround: false,
      rollMs: 0,
      rollCdMs: 0,
      rollDir: 0,
      holdCrouch: false,
      holdJet: false,
      recoil: 0,
      landGraceMs: 0,
      cannonballMs: 0,
      backflipMs: 0,
      cooking: false,
      cookStartedAt: 0,
      lastFireAt: 0,
      lastGrenadeAt: 0,
      respawnAt: 0,
      botThinkAt: 0,
      botTargetId: null,
      botRetargetAt: 0,
      botMoveStyle: 0,
      botStrafeDir: 1,
      botStyleUntil: 0,
      lastQueuedSeq: 0,
    });
    return p;
  }

  removePlayer(id: string): void {
    this.soldiers.delete(id);
    this.state.players.delete(id);
    for (const [bid, b] of this.bullets) {
      if (b.state.ownerId === id) {
        this.bullets.delete(bid);
        this.state.bullets.delete(bid);
      }
    }
  }

  setInput(id: string, input: PlayerInput): void {
    const s = this.soldiers.get(id);
    if (!s || s.state.isBot) return;
    const seq = Number(input.seq) || 0;
    // Ignore duplicates / already-acked / already-queued
    if (seq <= s.state.lastProcessedInput || seq <= s.lastQueuedSeq) return;
    if (s.inputQueue.length >= MAX_INPUT_QUEUE) return;

    s.lastQueuedSeq = seq;
    s.inputQueue.push(normalizeInput(input, seq));
  }

  /** Equip a owned weapon (client keys 1–3). */
  setWeapon(id: string, weaponRaw: string): void {
    const s = this.soldiers.get(id);
    if (!s || !s.state.alive || s.state.isBot) return;
    if (!isWeaponId(weaponRaw)) return;
    if (!this.ownsWeapon(s, weaponRaw)) return;
    s.state.weapon = weaponRaw;
  }

  private ownsWeapon(s: InternalSoldier, weapon: WeaponId): boolean {
    if (weapon === 'rifle') return true;
    if (weapon === 'sniper') return s.state.ownedSniper;
    if (weapon === 'shotgun') return s.state.ownedShotgun;
    return false;
  }

  private grantWeapon(s: InternalSoldier, weapon: WeaponId): void {
    if (weapon === 'sniper') s.state.ownedSniper = true;
    if (weapon === 'shotgun') s.state.ownedShotgun = true;
    s.state.weapon = weapon;
  }

  ensureBots(desired: number): void {
    const bots = [...this.soldiers.values()].filter((s) => s.state.isBot);
    while (bots.length < desired) {
      const id = eid('bot');
      this.addPlayer(id, `Bot ${bots.length + 1}`, true);
      bots.push(this.soldiers.get(id)!);
    }
    while (bots.length > desired) {
      const bot = bots.pop()!;
      this.removePlayer(bot.state.id);
    }
  }

  step(dtMs: number): void {
    this.now += dtMs;
    const dt = dtMs / 1000;

    for (const soldier of this.soldiers.values()) {
      if (soldier.state.isBot) {
        this.updateBotBrain(soldier);
        this.stepSoldier(soldier, dt);
        continue;
      }

      // Drain backlog so each seq is simulated once (prediction-safe).
      const queued = soldier.inputQueue.length;
      const steps =
        queued === 0 ? 1 : Math.min(Math.max(1, queued), MAX_INPUT_CATCHUP);
      for (let i = 0; i < steps; i++) {
        this.consumeNextInput(soldier);
        this.stepSoldier(soldier, dt);
        if (!soldier.state.alive) break;
      }
    }

    for (const bullet of [...this.bullets.values()]) {
      this.stepBullet(bullet, dt);
    }

    for (const grenade of [...this.grenades.values()]) {
      this.stepGrenade(grenade, dt);
    }

    this.stepPickups();
  }

  /** Pop next queued input, or hold last (with fire/grenade cleared). */
  private consumeNextInput(soldier: InternalSoldier): void {
    const next = soldier.inputQueue.shift();
    if (next) {
      soldier.input = next;
      soldier.state.lastProcessedInput = next.seq;
      return;
    }
    // Hold movement/aim/grenade (cook), but don't re-fire on empty ticks
    soldier.input = {
      ...soldier.input,
      fire: false,
    };
  }

  /**
   * @mechanic bot-dm-ai
   * Sticky target + strafe/backoff so two bots cannot mirror-chase forever.
   */
  private updateBotBrain(bot: InternalSoldier): void {
    if (!bot.state.alive) {
      bot.input = idleInput(bot.state.lastProcessedInput);
      return;
    }
    if (this.now < bot.botThinkAt) return;
    bot.botThinkAt = this.now + BOT.thinkIntervalMs;

    const others = [...this.soldiers.values()].filter(
      (s) => s !== bot && s.state.alive,
    );
    const humans = others.filter((s) => !s.state.isBot);
    const pool = humans.length > 0 ? humans : others;
    const target = this.pickBotTarget(bot, pool);

    if (!target) {
      bot.input.move = 0;
      bot.input.jet = false;
      bot.input.fire = false;
      bot.input.crouch = false;
      return;
    }

    const dx = target.state.x - bot.state.x;
    const dy = target.state.y - bot.state.y;
    const dist = Math.hypot(dx, dy);
    const toward = Math.abs(dx) > 16 ? (Math.sign(dx) as -1 | 1) : 0;

    if (this.now >= bot.botStyleUntil) {
      const roll = Math.random();
      if (dist < 70) bot.botMoveStyle = roll < 0.5 ? 2 : roll < 0.85 ? 1 : 0;
      else if (dist < 220) bot.botMoveStyle = roll < 0.28 ? 1 : roll < 0.4 ? 2 : 0;
      else bot.botMoveStyle = roll < 0.18 ? 1 : 0;
      bot.botStrafeDir = (Math.random() < 0.5 ? -1 : 1) as -1 | 1;
      bot.botStyleUntil =
        this.now + BOT.styleMinMs + Math.random() * (BOT.styleMaxMs - BOT.styleMinMs);
    }

    if (bot.botMoveStyle === 2) {
      bot.input.move = toward ? ((-toward) as -1 | 1) : bot.botStrafeDir;
    } else if (bot.botMoveStyle === 1) {
      bot.input.move = bot.botStrafeDir;
    } else {
      bot.input.move = toward || bot.botStrafeDir;
    }

    bot.input.jet =
      (dy < -80 && dist > 48 && bot.botMoveStyle !== 2) || (!bot.onGround && dy < -16);
    bot.input.crouch = bot.botMoveStyle === 1 && bot.onGround && dist < 200;
    bot.input.aimX = dx + (Math.random() * 60 - 30);
    bot.input.aimY = dy + (Math.random() * 30 - 20);
    bot.input.fire = dist < BOT.fireRange && dist > 28 && Math.random() > 0.42;
    bot.input.grenade = false;

    // Distance-based loadout (unlock all for bots)
    bot.state.ownedSniper = true;
    bot.state.ownedShotgun = true;
    if (dist > 420) bot.state.weapon = 'sniper';
    else if (dist < 180) bot.state.weapon = 'shotgun';
    else bot.state.weapon = 'rifle';

    // Bots skip cooking — instant full-fuse lob
    const nadeChance = dist < 120 ? 0.88 : 0.94;
    if (dist < 280 && bot.state.grenades > 0 && Math.random() > nadeChance) {
      this.throwGrenade(bot, GRENADE.fuseMs, { consumeInventory: true });
    }
  }

  private pickBotTarget(
    bot: InternalSoldier,
    pool: InternalSoldier[],
  ): InternalSoldier | undefined {
    const sticky = bot.botTargetId
      ? pool.find((s) => s.state.id === bot.botTargetId)
      : undefined;
    if (sticky && this.now < bot.botRetargetAt) return sticky;

    if (pool.length === 0) {
      bot.botTargetId = null;
      return undefined;
    }

    let next = pool[0]!;
    let best = Infinity;
    for (const s of pool) {
      const d = Math.hypot(s.state.x - bot.state.x, s.state.y - bot.state.y);
      if (d < best) {
        best = d;
        next = s;
      }
    }
    if (pool.length > 1 && Math.random() < 0.4) {
      next = pool[Math.floor(Math.random() * pool.length)]!;
    }
    bot.botTargetId = next.state.id;
    bot.botRetargetAt =
      this.now + BOT.retargetMinMs + Math.random() * (BOT.retargetMaxMs - BOT.retargetMinMs);
    return next;
  }

  private stepSoldier(soldier: InternalSoldier, dt: number): void {
    const p = soldier.state;

    if (!p.alive) {
      const body = toMoveBody(soldier);
      stepMovement(body, soldier.input, dt);
      fromMoveBody(soldier, body);
      if (soldier.respawnAt && this.now >= soldier.respawnAt) {
        this.respawn(soldier);
      }
      return;
    }

    const body = toMoveBody(soldier);
    stepMovement(body, soldier.input, dt);
    fromMoveBody(soldier, body);

    if (fellOutOfWorld(body) || p.y > GAME_HEIGHT + 40) {
      this.kill(soldier, undefined);
      return;
    }

    if (soldier.input.fire) this.tryFire(soldier);
    this.updateGrenadeCook(soldier);

    soldier.input.fire = false;
  }

  /**
   * @mechanic throwable-grenades
   * Hold grenade to cook; release to throw with remaining fuse.
   * Max cook → explode in hand.
   */
  private updateGrenadeCook(soldier: InternalSoldier): void {
    const p = soldier.state;
    const holding = !!soldier.input.grenade;

    if (!soldier.cooking) {
      if (
        holding &&
        p.grenades > 0 &&
        this.now >= soldier.lastGrenadeAt + PLAYER.grenadeCooldownMs
      ) {
        soldier.cooking = true;
        soldier.cookStartedAt = this.now;
        p.cooking = true;
        p.grenades -= 1;
      }
      return;
    }

    const cooked = this.now - soldier.cookStartedAt;
    if (cooked >= GRENADE.fuseMs) {
      // Cooked off in hand
      soldier.cooking = false;
      p.cooking = false;
      soldier.lastGrenadeAt = this.now;
      this.blastAt(p.x, p.y, soldier);
      return;
    }

    if (!holding) {
      soldier.cooking = false;
      p.cooking = false;
      soldier.lastGrenadeAt = this.now;
      this.throwGrenade(soldier, remainingFuse(cooked));
    }
  }

  private throwGrenade(
    soldier: InternalSoldier,
    fuseMs: number,
    opts: { consumeInventory: boolean } = { consumeInventory: false },
  ): void {
    const p = soldier.state;
    if (opts.consumeInventory) {
      if (p.grenades <= 0) return;
      if (this.now < soldier.lastGrenadeAt + PLAYER.grenadeCooldownMs) return;
      p.grenades -= 1;
      soldier.lastGrenadeAt = this.now;
    }

    const len = Math.hypot(p.aimX, p.aimY) || 1;
    const ax = p.aimX / len;
    const ay = p.aimY / len;
    const id = eid('g');
    const g = new GrenadeState();
    g.id = id;
    g.ownerId = p.id;
    g.x = p.x + ax * 16;
    g.y = p.y - 8;
    g.vx = ax * GRENADE.throwSpeed + p.vx * 0.35;
    g.vy = ay * GRENADE.throwSpeed - 180 + p.vy * 0.2;
    this.state.grenades.set(id, g);
    this.grenades.set(id, {
      state: g,
      explodeAt: this.now + Math.max(GRENADE.minFuseMs, fuseMs),
    });
  }

  /**
   * @mechanic ballistic-projectiles
   * @mechanic state-accuracy
   * @mechanic recoil
   * @mechanic weapon-arsenal
   * Spawn with weapon stats; shotgun fires multiple pellets.
   */
  private tryFire(soldier: InternalSoldier): void {
    const p = soldier.state;
    const weaponId = isWeaponId(p.weapon) ? p.weapon : DEFAULT_WEAPON;
    const weapon = WEAPONS[weaponId];
    if (this.now < soldier.lastFireAt + weapon.fireCooldownMs) return;
    soldier.lastFireAt = this.now;

    const stance = {
      vx: p.vx,
      vy: p.vy,
      onGround: soldier.onGround,
      jetting: p.jetting,
      crouching: p.crouching,
      rolling: soldier.rollMs > 0,
      cannonball: soldier.cannonballMs > 0,
    };
    const baseSeed = soldier.input.seq > 0 ? soldier.input.seq : Math.floor(this.now);
    const crouch = p.crouching;

    if (weaponId === 'shotgun') {
      const blast = shotgunBlastDirections(p.aimX, p.aimY, stance, soldier.recoil, baseSeed, {
        pellets: weapon.pellets,
        spreadMult: weapon.spreadMult,
        pelletSpread: weapon.pelletSpread,
        recoilKick: weapon.recoilKick,
        recoilMax: weapon.recoilMax,
      });
      soldier.recoil = blast.recoil;
      // Shared speed so the cone doesn't smear into different ranges.
      const center = blast.dirs[Math.floor(blast.dirs.length / 2)] ?? {
        aimX: p.aimX,
        aimY: p.aimY,
      };
      const base = muzzleVelocity(center.aimX, center.aimY, p.vx, p.vy, weapon.muzzleSpeed);
      const speed = Math.hypot(base.vx, base.vy);
      for (const dir of blast.dirs) {
        const id = eid('b');
        const b = new BulletState();
        b.id = id;
        b.ownerId = p.id;
        b.weapon = weaponId;
        b.x = p.x + dir.aimX * 18;
        b.y = p.y + dir.aimY * (crouch ? 6 : 12) - (crouch ? 2 : 4);
        b.vx = dir.aimX * speed;
        b.vy = dir.aimY * speed;
        this.state.bullets.set(id, b);
        this.bullets.set(id, {
          state: b,
          bornAt: this.now,
          power: base.power,
          baseDamage: weapon.damage,
          weapon: weaponId,
        });
      }
      return;
    }

    for (let i = 0; i < weapon.pellets; i++) {
      const fired = fireDirection(p.aimX, p.aimY, stance, soldier.recoil, baseSeed + i * 97, {
        spreadMult: weapon.spreadMult,
        pelletSpread: weapon.pelletSpread,
        recoilKick: weapon.recoilKick,
        recoilMax: weapon.recoilMax,
        applyRecoil: i === 0,
      });
      if (i === 0) soldier.recoil = fired.recoil;

      const id = eid('b');
      const b = new BulletState();
      b.id = id;
      b.ownerId = p.id;
      b.weapon = weaponId;
      b.x = p.x + fired.aimX * 20;
      b.y = p.y + fired.aimY * (crouch ? 6 : 12) - (crouch ? 2 : 4);
      const muzzle = muzzleVelocity(
        fired.aimX,
        fired.aimY,
        p.vx,
        p.vy,
        weapon.muzzleSpeed,
      );
      b.vx = muzzle.vx;
      b.vy = muzzle.vy;
      this.state.bullets.set(id, b);
      this.bullets.set(id, {
        state: b,
        bornAt: this.now,
        power: muzzle.power,
        baseDamage: weapon.damage,
        weapon: weaponId,
      });
    }
  }

  /**
   * @mechanic ballistic-projectiles
   * Gravity + drag, then swept hit test; damage scales with power.
   * @mechanic knockback
   */
  private stepBullet(bullet: InternalBullet, dt: number): void {
    const b = bullet.state;

    if (this.now - bullet.bornAt > BALLISTICS.lifeMs) {
      this.removeBullet(b.id);
      return;
    }

    const body = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, power: bullet.power };
    const { x0, y0, x1, y1 } = stepBallistic(body, dt);
    b.vx = body.vx;
    b.vy = body.vy;
    bullet.power = body.power;

    const targets = [...this.soldiers.values()].map((s) => ({
      id: s.state.id,
      x: s.state.x,
      y: s.state.y,
      alive: s.state.alive,
      crouching: s.state.crouching || s.rollMs > 0 || s.cannonballMs > 0,
    }));
    const hit = traceBullet(x0, y0, x1, y1, targets, b.ownerId);

    if (hit) {
      b.x = hit.x;
      b.y = hit.y;
      if (hit.kind === 'player') {
        const victim = this.soldiers.get(hit.playerId);
        const killer = this.soldiers.get(b.ownerId);
        if (victim) {
          // Sniper headshot is always lethal (Soldat-style reward for precision).
          const dmg =
            bullet.weapon === 'sniper' && hit.bodyPart === 'head'
              ? PLAYER.maxHealth
              : Math.round(
                  ballisticDamage(bullet.power, bullet.baseDamage) *
                    bodyDamageMult(hit.bodyPart),
                );
          const impulse = bulletImpulse(b.vx, b.vy, dmg);
          this.damage(victim, dmg, killer, impulse);
        }
      }
      this.removeBullet(b.id);
      return;
    }

    b.x = x1;
    b.y = y1;

    if (
      b.x < -40 ||
      b.x > GAME_WIDTH + 40 ||
      b.y < -40 ||
      b.y > GAME_HEIGHT + 40
    ) {
      this.removeBullet(b.id);
    }
  }

  private stepGrenade(grenade: InternalGrenade, dt: number): void {
    const g = grenade.state;
    g.vy += GRAVITY * dt;
    g.vx *= Math.max(0, 1 - 40 * dt);
    g.x += g.vx * dt;
    g.y += g.vy * dt;

    const bounceOn = (cx: number, cy: number, w: number, h: number) => {
      const left = cx - w / 2;
      const right = cx + w / 2;
      const top = cy - h / 2;
      const bottom = cy + h / 2;
      if (g.x < left || g.x > right || g.y < top - 10 || g.y > bottom + 4) return;
      // Prefer top bounce when falling onto the surface
      if (g.vy > 0 && g.y <= top + 14) {
        g.y = top - 8;
        g.vy *= -GRENADE.bounce;
        g.vx *= GRENADE.bounceFriction;
        return;
      }
      // Side bump
      if (g.x < cx) {
        g.x = left - 2;
        g.vx = -Math.abs(g.vx) * GRENADE.bounce;
      } else {
        g.x = right + 2;
        g.vx = Math.abs(g.vx) * GRENADE.bounce;
      }
    };

    for (const plat of PLATFORMS) bounceOn(plat.x, plat.y, plat.w, plat.h);
    for (const cover of COVERS) bounceOn(cover.x, cover.y, cover.w, cover.h);

    if (this.now >= grenade.explodeAt) {
      this.explodeGrenade(grenade);
    }
  }

  private explodeGrenade(grenade: InternalGrenade): void {
    const g = grenade.state;
    this.blastAt(g.x, g.y, this.soldiers.get(g.ownerId));
    this.grenades.delete(g.id);
    this.state.grenades.delete(g.id);
  }

  /** @mechanic knockback @mechanic throwable-grenades */
  private blastAt(x: number, y: number, killer?: InternalSoldier): void {
    for (const soldier of this.soldiers.values()) {
      if (!soldier.state.alive) continue;
      const dist = Math.hypot(soldier.state.x - x, soldier.state.y - y);
      if (dist > GRENADE.blastRadius) continue;
      const falloff = 1 - dist / GRENADE.blastRadius;
      const impulse = blastImpulse(x, y, soldier.state.x, soldier.state.y, falloff);
      this.damage(
        soldier,
        Math.round(GRENADE.blastDamage * (0.45 + 0.55 * falloff)),
        killer,
        impulse,
      );
    }
  }

  private stepPickups(): void {
    for (const pickup of this.pickups.values()) {
      const ps = pickup.state;
      if (!ps.active) {
        if (pickup.respawnAt && this.now >= pickup.respawnAt) {
          ps.active = true;
          pickup.respawnAt = 0;
        }
        continue;
      }
      for (const soldier of this.soldiers.values()) {
        if (!soldier.state.alive) continue;
        const dist = Math.hypot(soldier.state.x - ps.x, soldier.state.y - ps.y);
        if (dist > PICKUP_RADIUS) continue;
        if (!isWeaponId(ps.weapon)) continue;
        this.grantWeapon(soldier, ps.weapon);
        ps.active = false;
        pickup.respawnAt = this.now + PICKUP_RESPAWN_MS;
        break;
      }
    }
  }

  private removeBullet(id: string): void {
    this.bullets.delete(id);
    this.state.bullets.delete(id);
  }

  private damage(
    soldier: InternalSoldier,
    amount: number,
    killer?: InternalSoldier,
    impulse?: { vx: number; vy: number },
  ): void {
    if (!soldier.state.alive) return;
    if (impulse) {
      soldier.state.vx += impulse.vx;
      soldier.state.vy += impulse.vy;
    }
    soldier.state.health = Math.max(0, soldier.state.health - amount);
    if (soldier.state.health <= 0) this.kill(soldier, killer);
  }

  private kill(soldier: InternalSoldier, killer?: InternalSoldier): void {
    if (!soldier.state.alive) return;
    soldier.state.alive = false;
    soldier.state.health = 0;
    soldier.state.jetting = false;
    soldier.cooking = false;
    soldier.state.cooking = false;
    // Keep knockback velocity; add a death pop if barely moving
    const speed = Math.hypot(soldier.state.vx, soldier.state.vy);
    if (speed < 90) {
      soldier.state.vx += Math.random() * 240 - 120;
      soldier.state.vy -= 240;
    } else {
      soldier.state.vy -= 70;
    }
    if (killer && killer !== soldier) killer.state.kills += 1;
    soldier.respawnAt = this.now + PLAYER.respawnDelayMs;
    this.clearInputQueue(soldier);
  }

  private respawn(soldier: InternalSoldier): void {
    const spawn = randomSpawn();
    const p = soldier.state;
    p.alive = true;
    p.health = PLAYER.maxHealth;
    p.fuel = PLAYER.maxFuel;
    p.grenades = PLAYER.maxGrenades;
    p.x = spawn.x;
    p.y = spawn.y;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.crouching = false;
    p.rolling = false;
    p.rollMs = 0;
    p.cannonball = false;
    p.backflip = false;
    // Keep weapon unlocks across death; stay on current if still owned
    if (!this.ownsWeapon(soldier, isWeaponId(p.weapon) ? p.weapon : DEFAULT_WEAPON)) {
      p.weapon = DEFAULT_WEAPON;
    }
    soldier.respawnAt = 0;
    soldier.onGround = false;
    soldier.rollMs = 0;
    soldier.rollCdMs = 0;
    soldier.rollDir = 0;
    soldier.holdCrouch = false;
    soldier.holdJet = false;
    soldier.recoil = 0;
    soldier.landGraceMs = 0;
    soldier.cannonballMs = 0;
    soldier.backflipMs = 0;
    soldier.cooking = false;
    soldier.cookStartedAt = 0;
    p.cooking = false;
    this.clearInputQueue(soldier);
  }

  private clearInputQueue(soldier: InternalSoldier): void {
    soldier.inputQueue.length = 0;
    soldier.input = idleInput(soldier.state.lastProcessedInput);
    soldier.lastQueuedSeq = soldier.state.lastProcessedInput;
  }
}
