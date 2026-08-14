import {
  BOT,
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
  SPAWNS,
  playerHalfExtents,
  type PlayerInput,
} from './constants.js';
import { bodyDamageMult } from './accuracy.js';
import { fellOutOfWorld, stepMovement, type MoveBody } from './physics.js';
import { ballisticDamage, stepBallistic } from './ballistics.js';
import {
  applyVestDamage,
  planFire,
  spawnAmmoFor,
  stanceFromBody,
} from './fire.js';
import {
  blastImpulse,
  bulletImpulse,
  GRENADE,
  isNadeKind,
  NADE,
  NADE_KINDS,
  remainingFuse,
  type NadeKind,
} from './grenades.js';
import { traceBullet } from './trace.js';
import {
  BulletState,
  GameState,
  GrenadeState,
  PickupState,
  PlayerState,
} from './schema.js';
import {
  AMMO_BOX,
  DEFAULT_MELEE,
  DEFAULT_WEAPON,
  isFirearm,
  isMelee,
  isWeaponId,
  MAP_PICKUPS,
  MAX_VEST,
  MEDKIT_HEAL,
  PICKUP_ARM_MS,
  PICKUP_RADIUS,
  PICKUP_RESPAWN_MS,
  VEST_PICKUP,
  WEAPONS,
  type PickupKind,
  type WeaponId,
} from './weapons.js';

const MAX_INPUT_QUEUE = 48;
/** When buffered, drain extra steps so seqs aren't dropped. */
const MAX_INPUT_CATCHUP = 8;

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
  proneHoldMs: number;
  /** Pin pulled — fuse ticks until throw or self-blast. */
  cooking: boolean;
  cookStartedAt: number;
  cookKind: NadeKind;
  lastFireAt: number;
  lastGrenadeAt: number;
  reloadEndsAt: number;
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
  gravityScale: number;
  dragPerSec: number;
  lifeMs: number;
  explodeOnHit: boolean;
  blastRadius: number;
  blastDamage: number;
};

type InternalGrenade = {
  state: GrenadeState;
  explodeAt: number;
  kind: NadeKind;
  cluster: boolean;
};

type InternalPickup = {
  state: PickupState;
  respawnAt: number;
  ephemeral: boolean;
  armedAt: number;
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
    prone: soldier.state.prone,
    proneHoldMs: soldier.proneHoldMs,
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
  p.prone = body.prone;
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
  soldier.proneHoldMs = body.proneHoldMs;
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
    reload: !!input.reload,
    drop: !!input.drop,
    nadeCycle: !!input.nadeCycle,
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
    reload: false,
    drop: false,
    nadeCycle: false,
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
    for (const spec of MAP_PICKUPS) {
      const p = new PickupState();
      p.id = spec.id;
      p.kind = spec.kind;
      p.item = spec.item;
      p.weapon = spec.item;
      if (spec.kind === 'weapon' && isWeaponId(spec.item)) {
        const ammo = spawnAmmoFor(spec.item);
        p.ammo = ammo.ammo;
        p.reserve = ammo.reserve;
      }
      p.x = spec.x;
      p.y = spec.y;
      p.active = true;
      this.state.pickups.set(spec.id, p);
      this.pickups.set(spec.id, { state: p, respawnAt: 0, ephemeral: false, armedAt: 0 });
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
    p.vest = 0;
    p.fuel = PLAYER.maxFuel;
    p.weapon = DEFAULT_WEAPON;
    p.firearm = DEFAULT_WEAPON;
    p.melee = DEFAULT_MELEE;
    const spawnAmmo = spawnAmmoFor(DEFAULT_WEAPON);
    p.ammo = spawnAmmo.ammo;
    p.reserve = spawnAmmo.reserve;
    p.reloading = false;
    p.frags = 2;
    p.clusters = 1;
    p.stings = 1;
    p.nadeType = 'frag';
    p.grenades = 4;
    p.alive = true;
    p.onGround = false;
    p.crouching = false;
    p.rolling = false;
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
      proneHoldMs: 0,
      cooking: false,
      cookStartedAt: 0,
      cookKind: 'frag',
      lastFireAt: 0,
      lastGrenadeAt: 0,
      reloadEndsAt: 0,
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

  /** Equip firearm or melee (client keys 1–2). */
  setWeapon(id: string, weaponRaw: string): void {
    const s = this.soldiers.get(id);
    if (!s || !s.state.alive || s.state.isBot) return;
    this.equipHands(s, weaponRaw);
  }

  private equipHands(s: InternalSoldier, want: string): void {
    const p = s.state;
    if (want === 'firearm' || want === 'gun') {
      if (isFirearm(p.firearm)) p.weapon = p.firearm;
      return;
    }
    if (want === 'melee' || want === 'knife') {
      p.weapon = isWeaponId(p.melee) ? p.melee : DEFAULT_MELEE;
      return;
    }
    if (!isWeaponId(want)) return;
    if (isMelee(want)) {
      if (p.melee === want || want === 'knife') p.weapon = p.melee || DEFAULT_MELEE;
      return;
    }
    if (p.firearm === want) p.weapon = want;
  }

  private nadeCount(p: PlayerState, kind: NadeKind): number {
    if (kind === 'cluster') return p.clusters;
    if (kind === 'sting') return p.stings;
    return p.frags;
  }

  private setNadeCount(p: PlayerState, kind: NadeKind, n: number): void {
    if (kind === 'cluster') p.clusters = n;
    else if (kind === 'sting') p.stings = n;
    else p.frags = n;
    p.grenades = p.frags + p.clusters + p.stings;
  }

  private currentNade(p: PlayerState): NadeKind {
    return isNadeKind(p.nadeType) ? p.nadeType : 'frag';
  }

  private cycleNade(p: PlayerState): void {
    const start = NADE_KINDS.indexOf(this.currentNade(p));
    for (let i = 1; i <= NADE_KINDS.length; i++) {
      const k = NADE_KINDS[(start + i) % NADE_KINDS.length]!;
      if (this.nadeCount(p, k) > 0) {
        p.nadeType = k;
        return;
      }
    }
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

    this.separateSoldiers();

    for (const bullet of [...this.bullets.values()]) {
      this.stepBullet(bullet, dt);
    }

    for (const grenade of [...this.grenades.values()]) {
      this.stepGrenade(grenade, dt);
    }

    this.stepPickups();
  }

  private separateSoldiers(): void {
    const list = [...this.soldiers.values()].filter((s) => s.state.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const sa = list[i]!;
        const sb = list[j]!;
        const a = toMoveBody(sa);
        const b = toMoveBody(sb);
        const ha = playerHalfExtents(a.crouching, a.prone);
        const hb = playerHalfExtents(b.crouching, b.prone);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const overlapX = ha.halfW + hb.halfW - Math.abs(dx);
        const overlapY = ha.halfH + hb.halfH - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (overlapX < overlapY) {
          const dir = dx >= 0 ? 1 : -1;
          const push = overlapX * 0.5;
          a.x += dir * push;
          b.x -= dir * push;
          a.vx += dir * 28;
          b.vx -= dir * 28;
        } else if (dy < 0) {
          a.y = b.y - hb.halfH - ha.halfH;
          a.vy = 0;
          a.onGround = true;
        } else {
          b.y = a.y - ha.halfH - hb.halfH;
          b.vy = 0;
          b.onGround = true;
        }
        fromMoveBody(sa, a);
        fromMoveBody(sb, b);
      }
    }
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
      reload: false,
      drop: false,
      nadeCycle: false,
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
    const p = bot.state;
    bot.input.fire = dist < BOT.fireRange && Math.random() > 0.42;
    bot.input.grenade = false;
    bot.input.reload = false;
    bot.input.drop = false;
    bot.input.nadeCycle = false;

    if (p.reloading) bot.input.fire = false;

    if (dist < 48) {
      p.weapon = isWeaponId(p.melee) ? p.melee : DEFAULT_MELEE;
      bot.input.fire = dist < 46 && Math.random() > 0.25;
    } else if (isFirearm(p.firearm)) {
      p.weapon = p.firearm;
      if (p.ammo <= 0 && p.reserve > 0) bot.input.reload = true;
      if (p.ammo <= 0) bot.input.fire = false;
    }

    const nadeChance = dist < 120 ? 0.88 : 0.94;
    if (dist < 280 && p.grenades > 0 && Math.random() > nadeChance) {
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

    if (soldier.input.nadeCycle) this.cycleNade(p);
    if (soldier.input.drop) this.dropFirearm(soldier);
    this.updateReload(soldier);
    if (soldier.input.reload) this.startReload(soldier);
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
        this.nadeCount(p, this.currentNade(p)) > 0 &&
        this.now >= soldier.lastGrenadeAt + PLAYER.grenadeCooldownMs
      ) {
        soldier.cooking = true;
        soldier.cookStartedAt = this.now;
        soldier.cookKind = this.currentNade(p);
        p.cooking = true;
        this.setNadeCount(p, soldier.cookKind, this.nadeCount(p, soldier.cookKind) - 1);
      }
      return;
    }

    const cooked = this.now - soldier.cookStartedAt;
    if (cooked >= GRENADE.fuseMs) {
      // Cooked off in hand
      soldier.cooking = false;
      p.cooking = false;
      soldier.lastGrenadeAt = this.now;
      this.blastAt(p.x, p.y, soldier, {
        radius: NADE[soldier.cookKind].blastRadius,
        damage: NADE[soldier.cookKind].blastDamage,
        knockback: NADE[soldier.cookKind].knockback,
      });
      return;
    }

    if (!holding) {
      soldier.cooking = false;
      p.cooking = false;
      soldier.lastGrenadeAt = this.now;
      this.throwGrenade(soldier, remainingFuse(cooked), { consumeInventory: false, kind: soldier.cookKind });
    }
  }

  private throwGrenade(
    soldier: InternalSoldier,
    fuseMs: number,
    opts: { consumeInventory: boolean; kind?: NadeKind } = { consumeInventory: false },
  ): void {
    const p = soldier.state;
    const kind = opts.kind ?? this.currentNade(p);
    if (opts.consumeInventory) {
      if (this.nadeCount(p, kind) <= 0) return;
      if (this.now < soldier.lastGrenadeAt + PLAYER.grenadeCooldownMs) return;
      this.setNadeCount(p, kind, this.nadeCount(p, kind) - 1);
      soldier.lastGrenadeAt = this.now;
    }

    const len = Math.hypot(p.aimX, p.aimY) || 1;
    const ax = p.aimX / len;
    const ay = p.aimY / len;
    this.spawnGrenade(
      p.id,
      p.x + ax * 16,
      p.y - 8,
      ax * GRENADE.throwSpeed + p.vx * 0.35,
      ay * GRENADE.throwSpeed - 180 + p.vy * 0.2,
      Math.max(GRENADE.minFuseMs, fuseMs),
      kind,
      false,
    );
  }

  private spawnGrenade(
    ownerId: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    fuseMs: number,
    kind: NadeKind,
    cluster: boolean,
  ): void {
    const id = eid('g');
    const g = new GrenadeState();
    g.id = id;
    g.ownerId = ownerId;
    g.kind = kind;
    g.x = x;
    g.y = y;
    g.vx = vx;
    g.vy = vy;
    this.state.grenades.set(id, g);
    this.grenades.set(id, {
      state: g,
      explodeAt: this.now + fuseMs,
      kind,
      cluster,
    });
  }

  /**
   * @mechanic ballistic-projectiles
   * @mechanic state-accuracy
   * @mechanic recoil
   * @mechanic weapon-arsenal
   * @mechanic magazines-reload
   * @mechanic melee
   * @mechanic special-ballistics
   */
  private tryFire(soldier: InternalSoldier): void {
    const p = soldier.state;
    const weaponId = isWeaponId(p.weapon) ? p.weapon : DEFAULT_WEAPON;
    const weapon = WEAPONS[weaponId];
    if (p.reloading) return;
    if (this.now < soldier.lastFireAt + weapon.fireCooldownMs) return;

    if (weapon.kind !== 'melee') {
      if (p.ammo <= 0) {
        this.startReload(soldier);
        return;
      }
    }

    soldier.lastFireAt = this.now;
    if (weapon.kind !== 'melee') {
      p.ammo = Math.max(0, p.ammo - 1);
      if (p.ammo <= 0) this.startReload(soldier);
    }

    const stance = stanceFromBody({
      vx: p.vx,
      vy: p.vy,
      onGround: soldier.onGround,
      jetting: p.jetting,
      crouching: p.crouching,
      prone: p.prone,
      rollMs: soldier.rollMs,
      cannonballMs: soldier.cannonballMs,
    });
    const baseSeed = soldier.input.seq > 0 ? soldier.input.seq : Math.floor(this.now);
    const plan = planFire(
      {
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        aimX: p.aimX,
        aimY: p.aimY,
        crouching: p.crouching,
        recoil: soldier.recoil,
      },
      weapon,
      stance,
      baseSeed,
    );
    soldier.recoil = plan.recoil;

    if (plan.melee) {
      this.resolveMelee(soldier, plan.meleeRange, plan.meleeDamage);
      return;
    }

    for (const shot of plan.shots) {
      const id = eid('b');
      const b = new BulletState();
      b.id = id;
      b.ownerId = p.id;
      b.weapon = weaponId;
      b.x = shot.x;
      b.y = shot.y;
      b.vx = shot.vx;
      b.vy = shot.vy;
      this.state.bullets.set(id, b);
      this.bullets.set(id, {
        state: b,
        bornAt: this.now,
        power: shot.power,
        baseDamage: weapon.damage,
        weapon: weaponId,
        gravityScale: shot.gravityScale,
        dragPerSec: shot.dragPerSec,
        lifeMs: shot.lifeMs,
        explodeOnHit: shot.explodeOnHit,
        blastRadius: shot.blastRadius,
        blastDamage: shot.blastDamage,
      });
    }
  }

  private resolveMelee(soldier: InternalSoldier, range: number, damage: number): void {
    const p = soldier.state;
    const len = Math.hypot(p.aimX, p.aimY) || 1;
    const ax = p.aimX / len;
    const ay = p.aimY / len;
    const x0 = p.x + ax * 10;
    const y0 = p.y + ay * 6;
    const x1 = p.x + ax * range;
    const y1 = p.y + ay * range;
    const targets = [...this.soldiers.values()].map((s) => ({
      id: s.state.id,
      x: s.state.x,
      y: s.state.y,
      alive: s.state.alive,
      crouching: s.state.crouching || s.rollMs > 0 || s.cannonballMs > 0,
      prone: !!s.state.prone,
    }));
    const hit = traceBullet(x0, y0, x1, y1, targets, p.id);
    if (hit?.kind !== 'player') return;
    const victim = this.soldiers.get(hit.playerId);
    if (!victim) return;
    const dmg = Math.round(damage * bodyDamageMult(hit.bodyPart));
    const impulse = bulletImpulse(ax, ay, dmg);
    this.damage(victim, dmg, soldier, impulse, hit.bodyPart);
  }

  /**
   * @mechanic ballistic-projectiles
   * Gravity + drag, then swept hit test; damage scales with power.
   * @mechanic knockback
   * @mechanic special-ballistics
   */
  private stepBullet(bullet: InternalBullet, dt: number): void {
    const b = bullet.state;

    if (this.now - bullet.bornAt > bullet.lifeMs) {
      this.removeBullet(b.id);
      return;
    }

    const body = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, power: bullet.power };
    const { x0, y0, x1, y1 } = stepBallistic(body, dt, bullet.gravityScale, bullet.dragPerSec);
    b.vx = body.vx;
    b.vy = body.vy;
    bullet.power = body.power;

    const targets = [...this.soldiers.values()].map((s) => ({
      id: s.state.id,
      x: s.state.x,
      y: s.state.y,
      alive: s.state.alive,
      crouching: s.state.crouching || s.rollMs > 0 || s.cannonballMs > 0,
      prone: !!s.state.prone,
    }));
    const hit = traceBullet(x0, y0, x1, y1, targets, b.ownerId);

    if (hit) {
      b.x = hit.x;
      b.y = hit.y;
      const killer = this.soldiers.get(b.ownerId);
      if (bullet.explodeOnHit) {
        this.blastAt(hit.x, hit.y, killer, {
          radius: bullet.blastRadius,
          damage: bullet.blastDamage,
        });
      } else if (hit.kind === 'player') {
        const victim = this.soldiers.get(hit.playerId);
        if (victim) {
          const dmg =
            WEAPONS[bullet.weapon]?.headOhk && hit.bodyPart === 'head'
              ? PLAYER.maxHealth
              : Math.round(
                  ballisticDamage(bullet.power, bullet.baseDamage) *
                    bodyDamageMult(hit.bodyPart),
                );
          const impulse = bulletImpulse(b.vx, b.vy, dmg);
          this.damage(victim, dmg, killer, impulse, hit.bodyPart);
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
    const killer = this.soldiers.get(g.ownerId);
    const def = NADE[grenade.kind];
    this.blastAt(g.x, g.y, killer, {
      radius: def.blastRadius,
      damage: def.blastDamage,
      knockback: def.knockback,
    });

    if (grenade.kind === 'cluster' && !grenade.cluster) {
      for (let i = 0; i < NADE.cluster.children; i++) {
        const a = (i / NADE.cluster.children) * Math.PI * 2 + 0.4;
        this.spawnGrenade(
          g.ownerId,
          g.x,
          g.y - 6,
          Math.cos(a) * 180 + (Math.random() - 0.5) * 40,
          Math.sin(a) * 90 - 160,
          GRENADE.clusterChildFuseMs + i * 40,
          'frag',
          true,
        );
      }
    }

    if (grenade.kind === 'sting') {
      const targets = [...this.soldiers.values()].map((s) => ({
        id: s.state.id,
        x: s.state.x,
        y: s.state.y,
        alive: s.state.alive,
        crouching: s.state.crouching || s.rollMs > 0 || s.cannonballMs > 0,
        prone: !!s.state.prone,
      }));
      for (let i = 0; i < NADE.sting.pellets; i++) {
        const a = (i / NADE.sting.pellets) * Math.PI * 2;
        const x1 = g.x + Math.cos(a) * 140;
        const y1 = g.y + Math.sin(a) * 140;
        const hit = traceBullet(g.x, g.y, x1, y1, targets, '');
        if (hit?.kind === 'player') {
          const victim = this.soldiers.get(hit.playerId);
          if (victim) {
            this.damage(victim, NADE.sting.pelletDamage, killer, undefined, hit.bodyPart);
          }
        }
      }
    }

    this.grenades.delete(g.id);
    this.state.grenades.delete(g.id);
  }

  /** @mechanic knockback @mechanic throwable-grenades */
  private blastAt(
    x: number,
    y: number,
    killer?: InternalSoldier,
    opts?: { radius?: number; damage?: number; knockback?: number },
  ): void {
    const radius = opts?.radius ?? GRENADE.blastRadius;
    const dmg = opts?.damage ?? GRENADE.blastDamage;
    const kb = opts?.knockback ?? 1;
    for (const soldier of this.soldiers.values()) {
      if (!soldier.state.alive) continue;
      const dist = Math.hypot(soldier.state.x - x, soldier.state.y - y);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const impulse = blastImpulse(x, y, soldier.state.x, soldier.state.y, falloff, kb);
      this.damage(
        soldier,
        Math.round(dmg * (0.45 + 0.55 * falloff)),
        killer,
        impulse,
        'blast',
      );
    }
  }

  private stepPickups(): void {
    for (const [id, pickup] of [...this.pickups.entries()]) {
      const ps = pickup.state;
      if (!ps.active) {
        if (!pickup.ephemeral && pickup.respawnAt && this.now >= pickup.respawnAt) {
          ps.active = true;
          pickup.respawnAt = 0;
          if (ps.kind === 'weapon' && isWeaponId(ps.item)) {
            const ammo = spawnAmmoFor(ps.item);
            ps.ammo = ammo.ammo;
            ps.reserve = ammo.reserve;
          }
        }
        continue;
      }
      if (this.now < pickup.armedAt) continue;
      for (const soldier of this.soldiers.values()) {
        if (!soldier.state.alive) continue;
        const dist = Math.hypot(soldier.state.x - ps.x, soldier.state.y - ps.y);
        if (dist > PICKUP_RADIUS) continue;
        if (!this.collectPickup(soldier, pickup)) continue;
        if (pickup.ephemeral) {
          this.pickups.delete(id);
          this.state.pickups.delete(id);
        } else {
          ps.active = false;
          pickup.respawnAt = this.now + PICKUP_RESPAWN_MS;
        }
        break;
      }
    }
  }

  private collectPickup(soldier: InternalSoldier, pickup: InternalPickup): boolean {
    const p = soldier.state;
    const ps = pickup.state;
    const kind = (ps.kind || 'weapon') as PickupKind;
    if (kind === 'weapon') {
      const item = isWeaponId(ps.item) ? ps.item : isWeaponId(ps.weapon) ? ps.weapon : null;
      if (!item) return false;
      if (isMelee(item)) {
        if (p.melee === 'chainsaw' && item === 'knife') return false;
        p.melee = item;
        p.weapon = item;
        return true;
      }
      if (isFirearm(p.firearm) && p.firearm !== item) {
        this.dropAt(soldier, p.firearm as WeaponId, p.ammo, p.reserve);
      }
      p.firearm = item;
      p.weapon = item;
      p.ammo = ps.ammo || spawnAmmoFor(item).ammo;
      p.reserve = ps.reserve || spawnAmmoFor(item).reserve;
      p.reloading = false;
      soldier.reloadEndsAt = 0;
      return true;
    }
    if (kind === 'medkit') {
      if (p.health >= PLAYER.maxHealth) return false;
      p.health = Math.min(PLAYER.maxHealth, p.health + MEDKIT_HEAL);
      return true;
    }
    if (kind === 'vest') {
      if (p.vest >= MAX_VEST) return false;
      p.vest = Math.min(MAX_VEST, p.vest + VEST_PICKUP);
      return true;
    }
    if (kind === 'ammo') {
      if (!isFirearm(p.firearm)) return false;
      const cap = WEAPONS[p.firearm as WeaponId].reserveMax;
      if (p.reserve >= cap) return false;
      p.reserve = Math.min(cap, p.reserve + AMMO_BOX);
      return true;
    }
    if (kind === 'nade') {
      const nk = isNadeKind(ps.item) ? ps.item : 'frag';
      this.setNadeCount(p, nk, this.nadeCount(p, nk) + 1);
      p.nadeType = nk;
      return true;
    }
    return false;
  }

  private dropAt(
    soldier: InternalSoldier,
    weapon: WeaponId,
    ammo: number,
    reserve: number,
  ): void {
    const face = soldier.state.facing || 1;
    this.spawnDroppedWeapon(
      soldier.state.x - face * 40,
      soldier.state.y + 10,
      weapon,
      ammo,
      reserve,
      this.now + PICKUP_ARM_MS,
    );
  }

  private spawnDroppedWeapon(
    x: number,
    y: number,
    weapon: WeaponId,
    ammo: number,
    reserve: number,
    armedAt = 0,
  ): void {
    const id = eid('drop');
    const ps = new PickupState();
    ps.id = id;
    ps.kind = 'weapon';
    ps.item = weapon;
    ps.weapon = weapon;
    ps.ammo = ammo;
    ps.reserve = reserve;
    ps.x = x;
    ps.y = y;
    ps.active = true;
    this.state.pickups.set(id, ps);
    this.pickups.set(id, { state: ps, respawnAt: 0, ephemeral: true, armedAt });
  }

  private dropFirearm(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (!isFirearm(p.firearm)) return;
    this.dropAt(soldier, p.firearm as WeaponId, p.ammo, p.reserve);
    p.firearm = '';
    p.ammo = 0;
    p.reserve = 0;
    p.reloading = false;
    soldier.reloadEndsAt = 0;
    p.weapon = isWeaponId(p.melee) ? p.melee : DEFAULT_MELEE;
  }

  private startReload(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (p.reloading) return;
    const id = isWeaponId(p.weapon) ? p.weapon : DEFAULT_WEAPON;
    if (isMelee(id) || !isFirearm(p.firearm)) return;
    const w = WEAPONS[p.firearm as WeaponId];
    if (p.ammo >= w.magSize || p.reserve <= 0) return;
    p.reloading = true;
    soldier.reloadEndsAt = this.now + w.reloadMs;
  }

  private updateReload(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (!p.reloading) return;
    if (this.now < soldier.reloadEndsAt) return;
    const id = isFirearm(p.firearm) ? (p.firearm as WeaponId) : null;
    if (!id) {
      p.reloading = false;
      return;
    }
    const w = WEAPONS[id];
    const need = w.magSize - p.ammo;
    const take = Math.min(need, p.reserve);
    p.ammo += take;
    p.reserve -= take;
    p.reloading = false;
    soldier.reloadEndsAt = 0;
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
    bodyPart: 'head' | 'torso' | 'legs' | 'blast' = 'torso',
  ): void {
    if (!soldier.state.alive) return;
    if (impulse) {
      soldier.state.vx += impulse.vx;
      soldier.state.vy += impulse.vy;
    }
    const next = applyVestDamage(soldier.state.health, soldier.state.vest, amount, bodyPart);
    soldier.state.health = next.health;
    soldier.state.vest = next.vest;
    if (soldier.state.health <= 0) this.kill(soldier, killer);
  }

  private kill(soldier: InternalSoldier, killer?: InternalSoldier): void {
    if (!soldier.state.alive) return;
    soldier.state.alive = false;
    soldier.state.health = 0;
    soldier.state.jetting = false;
    soldier.cooking = false;
    soldier.state.cooking = false;
    soldier.state.reloading = false;
    if (isFirearm(soldier.state.firearm)) {
      this.spawnDroppedWeapon(
        soldier.state.x,
        soldier.state.y,
        soldier.state.firearm as WeaponId,
        soldier.state.ammo,
        soldier.state.reserve,
      );
    }
    if (soldier.state.melee === 'chainsaw') {
      this.spawnDroppedWeapon(soldier.state.x + 12, soldier.state.y, 'chainsaw', 0, 0);
    }
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
    p.vest = 0;
    p.fuel = PLAYER.maxFuel;
    p.weapon = DEFAULT_WEAPON;
    p.firearm = DEFAULT_WEAPON;
    p.melee = DEFAULT_MELEE;
    const ammo = spawnAmmoFor(DEFAULT_WEAPON);
    p.ammo = ammo.ammo;
    p.reserve = ammo.reserve;
    p.reloading = false;
    p.frags = 2;
    p.clusters = 1;
    p.stings = 1;
    p.nadeType = 'frag';
    p.grenades = 4;
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
    soldier.reloadEndsAt = 0;
    p.cooking = false;
    this.clearInputQueue(soldier);
  }

  private clearInputQueue(soldier: InternalSoldier): void {
    soldier.inputQueue.length = 0;
    soldier.input = idleInput(soldier.state.lastProcessedInput);
    soldier.lastQueuedSeq = soldier.state.lastProcessedInput;
  }
}
