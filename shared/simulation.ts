import {
  BOT,
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAP_NAME,
  PLAYER,
  PLATFORMS,
  RAMPS,
  WAYPOINTS,
  playerHalfExtents,
  type PlayerInput,
} from './constants.js';
import { bodyDamageMult } from './accuracy.js';
import { fellOutOfWorld, stepMovement, type MoveBody } from './physics.js';
import { terrainBandsAt, segmentHitsTerrain, sitOnWalkable } from './terrain.js';
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
  grenadeThrowOrigin,
  grenadeThrowVelocity,
  isNadeKind,
  NADE,
  NADE_KINDS,
  remainingFuse,
  stepGrenadeFlight,
  type NadeKind,
} from './grenades.js';
import { traceBullet } from './trace.js';
import { displayLabel } from './labels.js';
import {
  BulletState,
  ChatEntry,
  GameState,
  GrenadeState,
  KillFeedEntry,
  PickupState,
  PlayerState,
} from './schema.js';
import {
  DEFAULT_MELEE,
  DEFAULT_WEAPON,
  DESTINATION_GUNS,
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
  WEAPON_RESPAWN_MS,
  WEAPONS,
  type PickupKind,
  type WeaponId,
} from './weapons.js';
import { pickAntiCampSpawn } from './spawns.js';
import {
  BONUS,
  isBonusId,
  MULTI_WINDOW_MS,
  multiKillLabel,
  spreeLabel,
} from './bonuses.js';
import {
  blatImpulse,
  inRadius,
  isTeamMode,
  MATCH,
  OBJECTIVES,
  parseMode,
  sameTeam,
  sanitizeChat,
  scoreLimit,
  spawnPoolForTeam,
  TEAM,
  type MatchMode,
} from './match.js';

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
  botGoalX: number;
  botGoalY: number;
  botCookUntil: number;
  lastHitWeapon: string;
  dashCdMs: number;
  lastKillAt: number;
  multiCount: number;
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

const KILL_FEED_MAX = 8;

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
    berserk: p.bonus === 'berserk',
    dashCdMs: soldier.dashCdMs,
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
  soldier.dashCdMs = body.dashCdMs ?? 0;
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
    blat: !!input.blat,
    dash: !!input.dash,
    tossFlag: !!input.tossFlag,
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
    blat: false,
    dash: false,
    tossFlag: false,
  };
}

export class Simulation {
  readonly soldiers = new Map<string, InternalSoldier>();
  private bullets = new Map<string, InternalBullet>();
  private grenades = new Map<string, InternalGrenade>();
  private pickups = new Map<string, InternalPickup>();
  private now = 0;
  private recentSpawnIndices: number[] = [];
  private windAt = 0;
  private flagAReturnAt = 0;
  private flagBReturnAt = 0;
  private pointAcc = 0;
  private infilHold = new Map<string, number>();

  constructor(
    private readonly state: GameState,
    opts: { mode?: string; realistic?: boolean } = {},
  ) {
    this.state.mapName = MAP_NAME;
    this.state.mode = parseMode(opts.mode);
    this.state.realistic = !!opts.realistic;
    this.resetObjectives();
    this.initPickups();
  }

  private mode(): MatchMode {
    return parseMode(this.state.mode);
  }

  private resetObjectives(): void {
    this.state.flagAx = OBJECTIVES.flagAlpha.x;
    this.state.flagAy = OBJECTIVES.flagAlpha.y;
    this.state.flagBx = OBJECTIVES.flagBravo.x;
    this.state.flagBy = OBJECTIVES.flagBravo.y;
    this.state.flagACarrier = '';
    this.state.flagBCarrier = '';
    this.state.flagAHome = true;
    this.state.flagBHome = true;
    this.state.pointOwner = 0;
    this.flagAReturnAt = 0;
    this.flagBReturnAt = 0;
    this.infilHold.clear();
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

  /** @mechanic anti-camp-spawns */
  private pickSpawn(excludeId?: string, team = 0): { x: number; y: number } {
    const pool = spawnPoolForTeam(team as 0 | 1 | 2);
    const living = [...this.soldiers.values()]
      .filter((s) => s.state.alive && s.state.id !== excludeId)
      .map((s) => ({ x: s.state.x, y: s.state.y }));
    const recent = team ? [] : this.recentSpawnIndices;
    const { spawn, index } = pickAntiCampSpawn(pool, living, recent);
    if (!team) {
      this.recentSpawnIndices.push(index);
      if (this.recentSpawnIndices.length > 5) this.recentSpawnIndices.shift();
    }
    return spawn;
  }

  private assignTeam(): number {
    if (!isTeamMode(this.mode())) return TEAM.none;
    let a = 0;
    let b = 0;
    for (const s of this.soldiers.values()) {
      if (s.state.team === TEAM.alpha) a += 1;
      if (s.state.team === TEAM.bravo) b += 1;
    }
    return a <= b ? TEAM.alpha : TEAM.bravo;
  }

  addPlayer(id: string, name: string, isBot = false): PlayerState {
    const p = new PlayerState();
    p.id = id;
    p.name = displayLabel(name, isBot ? 'Bot' : 'Soldier').slice(0, 16);
    p.isBot = isBot;
    p.team = this.assignTeam();
    const spawn = this.pickSpawn(id, p.team);
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
    p.deaths = 0;
    p.ping = 0;
    p.deathKind = '';
    p.score = 0;
    p.blatReadyAt = 0;
    p.bonus = '';
    p.bonusUntil = 0;
    p.spree = 0;
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
      botGoalX: spawn.x,
      botGoalY: spawn.y,
      botCookUntil: 0,
      lastHitWeapon: '',
      dashCdMs: 0,
      lastKillAt: 0,
      multiCount: 0,
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

  setPing(id: string, ping: number): void {
    const s = this.soldiers.get(id);
    if (!s || s.state.isBot) return;
    s.state.ping = Math.max(0, Math.min(999, Math.round(ping)));
  }

  addChat(name: string, text: string, kind = 'chat'): void {
    const clean = sanitizeChat(text);
    if (!clean) return;
    const row = new ChatEntry();
    row.name = displayLabel(name, 'Soldier').slice(0, 16);
    row.text = clean;
    row.kind =
      kind === 'taunt' || kind === 'spree' || kind === 'medal' ? kind : 'chat';
    row.at = this.now;
    this.state.chat.unshift(row);
    while (this.state.chat.length > MATCH.chatKeep) this.state.chat.pop();
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
    if (want === 'punch') {
      p.weapon = 'punch';
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
    if (!this.state.roundEndsAt) this.state.roundEndsAt = this.now + MATCH.roundMs;
    this.state.now = this.now;

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
    this.stepWeather();
    this.stepObjectives(dt);
    this.checkRound();
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
      blat: false,
      dash: false,
      tossFlag: false,
    };
  }

  /**
   * @mechanic bot-dm-ai
   * Sticky target, waypoints/jets, loot + nade cook, strafe so bots use the map.
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
    const enemies = isTeamMode(this.mode())
      ? others.filter((s) => s.state.team !== bot.state.team)
      : others;
    const pool = humans.filter((s) => enemies.includes(s)).length
      ? humans.filter((s) => enemies.includes(s))
      : enemies.length
        ? enemies
        : others;
    const target = this.pickBotTarget(bot, pool);

    const p = bot.state;
    const goal = this.botGoal(bot, target);
    bot.botGoalX = goal.x;
    bot.botGoalY = goal.y;

    const dx = (target?.state.x ?? goal.x) - p.x;
    const dy = (target?.state.y ?? goal.y) - p.y;
    const dist = Math.hypot(dx, dy);
    const gdx = goal.x - p.x;
    const gdy = goal.y - p.y;
    const gdist = Math.hypot(gdx, gdy);
    const toward = Math.abs(gdx) > 14 ? (Math.sign(gdx) as -1 | 1) : 0;

    if (this.now >= bot.botStyleUntil) {
      const roll = Math.random();
      if (dist < 70) bot.botMoveStyle = roll < 0.5 ? 2 : roll < 0.85 ? 1 : 0;
      else if (dist < 220) bot.botMoveStyle = roll < 0.28 ? 1 : roll < 0.4 ? 2 : 0;
      else bot.botMoveStyle = roll < 0.18 ? 1 : 0;
      bot.botStrafeDir = (Math.random() < 0.5 ? -1 : 1) as -1 | 1;
      bot.botStyleUntil =
        this.now + BOT.styleMinMs + Math.random() * (BOT.styleMaxMs - BOT.styleMinMs);
    }

    if (gdist > BOT.waypointSlack && bot.botMoveStyle !== 2) {
      bot.input.move = toward || bot.botStrafeDir;
    } else if (bot.botMoveStyle === 2) {
      bot.input.move = toward ? ((-toward) as -1 | 1) : bot.botStrafeDir;
    } else if (bot.botMoveStyle === 1) {
      bot.input.move = bot.botStrafeDir;
    } else {
      bot.input.move = toward || bot.botStrafeDir;
    }

    const blocked =
      bot.onGround && toward !== 0 && Math.abs(p.vx) < 36 && p.fuel > 8;
    const caveFloor = p.y > 980;
    const goalInCave = goal.y > 980;
    bot.input.jet =
      blocked ||
      (gdy < -70 && gdist > 40) ||
      (!bot.onGround && gdy < -12) ||
      (caveFloor && !goalInCave && gdist > 80 && p.fuel > 20);
    bot.input.crouch = bot.botMoveStyle === 1 && bot.onGround && dist < 200 && gdist < 160;
    bot.input.aimX = dx + (Math.random() * 60 - 30);
    bot.input.aimY = dy + (Math.random() * 30 - 20);
    bot.input.fire = !!target && dist < BOT.fireRange && Math.random() > 0.42;
    bot.input.reload = false;
    bot.input.drop = false;
    bot.input.nadeCycle = false;

    if (p.reloading) bot.input.fire = false;

    if (dist < 48) {
      p.weapon = isWeaponId(p.melee) ? p.melee : DEFAULT_MELEE;
      bot.input.fire = dist < 46 && Math.random() > 0.25;
    } else if (isFirearm(p.firearm)) {
      p.weapon = p.firearm;
      if (p.ammo <= 0) {
        bot.input.reload = true;
        bot.input.fire = false;
      }
    }

    this.botNadeInput(bot, dist, target);
    bot.input.blat =
      !!target &&
      dist < MATCH.blatRadius &&
      this.now >= p.blatReadyAt &&
      Math.random() > 0.72;
    bot.input.dash = gdist > 160 && p.fuel > 30 && Math.random() > 0.82;
    bot.input.tossFlag =
      (this.state.flagACarrier === p.id || this.state.flagBCarrier === p.id) &&
      gdist < 90 &&
      Math.random() > 0.7;
    if (dist < 38 && Math.random() > 0.45) p.weapon = 'punch';
  }

  private botGoal(
    bot: InternalSoldier,
    target: InternalSoldier | undefined,
  ): { x: number; y: number } {
    const p = bot.state;
    const mode = this.mode();
    if (mode === 'ctf') {
      if (this.state.flagACarrier === p.id) return { ...OBJECTIVES.flagAlpha };
      if (this.state.flagBCarrier === p.id) return { ...OBJECTIVES.flagBravo };
      if (p.team === TEAM.alpha) return { x: this.state.flagBx, y: this.state.flagBy };
      if (p.team === TEAM.bravo) return { x: this.state.flagAx, y: this.state.flagAy };
    }
    if (mode === 'point') return { ...OBJECTIVES.point };
    if (mode === 'infil') {
      return p.team === TEAM.bravo ? { ...OBJECTIVES.infil } : { ...OBJECTIVES.flagAlpha };
    }
    if (p.health < BOT.medkitHp) {
      const med = this.nearestPickup(bot, (ps) => ps.kind === 'medkit' && ps.active);
      if (med) return { x: med.x, y: med.y };
    }
    if (p.firearm === DEFAULT_WEAPON || p.firearm === '') {
      const gun = this.nearestPickup(
        bot,
        (ps) => ps.kind === 'weapon' && ps.active && isFirearm(ps.item) && ps.item !== DEFAULT_WEAPON,
      );
      if (gun) {
        const gunDist = Math.hypot(gun.x - p.x, gun.y - p.y);
        const tDist = target
          ? Math.hypot(target.state.x - p.x, target.state.y - p.y)
          : 9999;
        const destination = isWeaponId(gun.item) && DESTINATION_GUNS.includes(gun.item);
        const take =
          destination ? gunDist < 720 && tDist > 130 : gunDist < tDist * 0.7;
        if (take) {
          if (segmentHitsTerrain(p.x, p.y, gun.x, gun.y)) {
            return this.steerViaWaypoint(p.x, p.y, gun.x, gun.y);
          }
          return { x: gun.x, y: gun.y };
        }
      }
    }
    if (!target) {
      const wp = this.nearestWaypoint(p.x, p.y);
      return wp ?? { x: p.x, y: p.y };
    }
    const tx = target.state.x;
    const ty = target.state.y;
    const dist = Math.hypot(tx - p.x, ty - p.y);
    if (dist < BOT.waypointSlack && !segmentHitsTerrain(p.x, p.y, tx, ty)) {
      return { x: tx, y: ty };
    }
    return this.steerViaWaypoint(p.x, p.y, tx, ty);
  }

  private nearestPickup(
    bot: InternalSoldier,
    ok: (ps: PickupState) => boolean,
  ): PickupState | null {
    let best: PickupState | null = null;
    let bestD = Infinity;
    for (const pickup of this.pickups.values()) {
      const ps = pickup.state;
      if (!ok(ps)) continue;
      const d = Math.hypot(ps.x - bot.state.x, ps.y - bot.state.y);
      if (d < bestD) {
        bestD = d;
        best = ps;
      }
    }
    return best;
  }

  private nearestWaypoint(x: number, y: number): { x: number; y: number } | null {
    let best = WAYPOINTS[0] ?? null;
    let bestD = Infinity;
    for (const w of WAYPOINTS) {
      const d = Math.hypot(w.x - x, w.y - y);
      if (d < 30) continue;
      if (segmentHitsTerrain(x, y, w.x, w.y)) continue;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  private steerViaWaypoint(
    x: number,
    y: number,
    tx: number,
    ty: number,
  ): { x: number; y: number } {
    const direct = Math.hypot(tx - x, ty - y);
    const directClear = !segmentHitsTerrain(x, y, tx, ty);
    let best = { x: tx, y: ty };
    let bestCost = directClear ? direct : direct + 2400;
    for (const w of WAYPOINTS) {
      const toWp = Math.hypot(w.x - x, w.y - y);
      if (toWp <= 40) continue;
      if (segmentHitsTerrain(x, y, w.x, w.y)) continue;
      const wpTo = Math.hypot(tx - w.x, ty - w.y);
      const cost = toWp + wpTo * 0.82;
      if (cost < bestCost) {
        bestCost = cost;
        best = w;
      }
    }
    return best;
  }

  private botNadeInput(
    bot: InternalSoldier,
    dist: number,
    target: InternalSoldier | undefined,
  ): void {
    const p = bot.state;
    if (this.now < bot.botCookUntil) {
      bot.input.grenade = true;
      bot.input.fire = false;
      return;
    }
    bot.input.grenade = false;
    if (!target || p.grenades <= 0) return;
    if (dist < BOT.nadeMinDist || dist > BOT.nadeMaxDist) return;
    const flush = !!target.state.crouching || !!target.state.prone;
    if (Math.random() > (flush ? 0.28 : 0.1)) return;
    bot.botCookUntil = this.now + 280 + Math.random() * 520;
    bot.input.grenade = true;
    bot.input.fire = false;
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

    const body = toMoveBody(soldier);
    body.realistic = this.state.realistic;
    body.windVx = this.state.windVx;
    body.berserk = p.bonus === 'berserk';
    stepMovement(body, soldier.input, dt);
    fromMoveBody(soldier, body);
    p.blatCd = Math.max(0, p.blatReadyAt - this.now);
    p.dashCd = soldier.dashCdMs;
    if (p.bonus && this.now >= p.bonusUntil) {
      p.bonus = '';
      p.bonusUntil = 0;
    }

    if (!p.alive) {
      if (soldier.respawnAt && this.now >= soldier.respawnAt) {
        this.respawn(soldier);
      }
      return;
    }

    if (fellOutOfWorld(body) || p.y > GAME_HEIGHT + 40) {
      soldier.lastHitWeapon = 'fall';
      this.kill(soldier, undefined);
      return;
    }

    if (soldier.input.nadeCycle) this.cycleNade(p);
    if (soldier.input.tossFlag) this.tossFlag(soldier);
    if (soldier.input.drop) this.dropFirearm(soldier);
    this.updateReload(soldier);
    if (soldier.input.reload) this.startReload(soldier);
    if (soldier.input.fire) this.tryFire(soldier);
    if (soldier.input.blat) this.tryBlat(soldier);
    this.updateGrenadeCook(soldier);

    soldier.input.fire = false;
    soldier.input.blat = false;
    soldier.input.dash = false;
    soldier.input.tossFlag = false;
  }

  /**
   * @mechanic throwable-grenades
   * Hold grenade to cook; release to throw with remaining fuse.
   * A one-tick tap still throws. Max cook → explode in hand.
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
        weapon: soldier.cookKind,
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

    const origin = grenadeThrowOrigin(p.x, p.y, p.aimX, p.aimY, p.facing);
    const vel = grenadeThrowVelocity(p.aimX, p.aimY, p.vx, p.vy, p.facing);
    this.spawnGrenade(
      p.id,
      origin.x,
      origin.y,
      vel.vx,
      vel.vy,
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
    const flameGod = p.bonus === 'flamegod';
    const weaponId = flameGod
      ? 'flamer'
      : isWeaponId(p.weapon)
        ? p.weapon
        : DEFAULT_WEAPON;
    const weapon = WEAPONS[weaponId];
    if (p.reloading && !flameGod) return;
    if (this.now < soldier.lastFireAt + weapon.fireCooldownMs) return;

    if (weapon.kind !== 'melee' && !flameGod) {
      if (p.ammo <= 0) {
        this.startReload(soldier);
        return;
      }
    }

    soldier.lastFireAt = this.now;
    if (weapon.kind !== 'melee' && !flameGod) {
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
    const dmg = Math.round(
      damage *
        bodyDamageMult(hit.bodyPart) *
        (p.bonus === 'berserk' ? BONUS.berserkMelee : 1),
    );
    const impulse = bulletImpulse(ax, ay, dmg);
    if (p.weapon === 'punch') {
      impulse.vx *= 2.1;
      impulse.vy *= 1.5;
    }
    this.damage(victim, dmg, soldier, impulse, hit.bodyPart, p.weapon);
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
          weapon: bullet.weapon,
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
          this.damage(victim, dmg, killer, impulse, hit.bodyPart, bullet.weapon);
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
    const flight = stepGrenadeFlight(g.vx, g.vy, dt, this.state.windVx);
    g.vx = flight.vx;
    g.vy = flight.vy;
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
    for (const r of RAMPS) {
      const lo = Math.min(r.ax, r.bx);
      const hi = Math.max(r.ax, r.bx);
      if (g.x < lo || g.x > hi) continue;
      const span = r.bx - r.ax || 1;
      const surfaceY = r.ay + ((g.x - r.ax) / span) * (r.by - r.ay);
      if (g.vy > 0 && g.y >= surfaceY - 12 && g.y <= surfaceY + 16) {
        g.y = surfaceY - 8;
        g.vy *= -GRENADE.bounce;
        g.vx *= GRENADE.bounceFriction;
      }
    }
    for (const band of terrainBandsAt(g.x)) {
      if (g.y > band.top + 4 && g.y < band.bottom - 4) {
        if (g.y - band.top <= band.bottom - g.y) {
          g.y = band.top - 8;
          if (g.vy > 0) g.vy *= -GRENADE.bounce;
        } else {
          g.y = band.bottom + 8;
          if (g.vy < 0) g.vy *= -GRENADE.bounce;
        }
        g.vx *= GRENADE.bounceFriction;
      } else if (g.vy > 0 && g.y >= band.top - 12 && g.y <= band.top + 18) {
        g.y = band.top - 8;
        g.vy *= -GRENADE.bounce;
        g.vx *= GRENADE.bounceFriction;
      } else if (g.vy < 0 && g.y <= band.bottom + 12 && g.y >= band.bottom - 18) {
        g.y = band.bottom + 8;
        g.vy *= -GRENADE.bounce;
        g.vx *= GRENADE.bounceFriction;
      }
    }

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
      weapon: grenade.kind,
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
            this.damage(
              victim,
              NADE.sting.pelletDamage,
              killer,
              undefined,
              hit.bodyPart,
              'sting',
            );
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
    opts?: { radius?: number; damage?: number; knockback?: number; weapon?: string },
  ): void {
    const radius = opts?.radius ?? GRENADE.blastRadius;
    const dmg = opts?.damage ?? GRENADE.blastDamage;
    const kb = opts?.knockback ?? 1;
    const weapon = opts?.weapon ?? 'frag';
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
        weapon,
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
          pickup.respawnAt =
            this.now +
            (ps.kind === 'bonus'
              ? BONUS.respawnMs
              : ps.kind === 'weapon'
                ? WEAPON_RESPAWN_MS
                : PICKUP_RESPAWN_MS);
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
      p.ammo = Number.isFinite(ps.ammo) ? ps.ammo : spawnAmmoFor(item).ammo;
      p.reserve = 0;
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
      return false;
    }
    if (kind === 'nade') {
      const nk = isNadeKind(ps.item) ? ps.item : 'frag';
      this.setNadeCount(p, nk, this.nadeCount(p, nk) + 1);
      p.nadeType = nk;
      return true;
    }
    if (kind === 'bonus') {
      if (!isBonusId(ps.item)) return false;
      p.bonus = ps.item;
      p.bonusUntil = this.now + BONUS.durationMs;
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
    const seated = sitOnWalkable(x, y);
    const ps = new PickupState();
    ps.id = id;
    ps.kind = 'weapon';
    ps.item = weapon;
    ps.weapon = weapon;
    ps.ammo = ammo;
    ps.reserve = reserve;
    ps.x = seated.x;
    ps.y = seated.y;
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
    if (p.ammo >= w.magSize) return;
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
    p.ammo = w.magSize;
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
    weapon = '',
  ): void {
    if (!soldier.state.alive) return;
    if (killer && sameTeam(killer.state.team, soldier.state.team, this.mode())) return;
    if (
      soldier.state.bonus === 'flamegod' &&
      (weapon === 'flamer' || weapon === 'flame')
    ) {
      return;
    }
    if (impulse) {
      soldier.state.vx += impulse.vx;
      soldier.state.vy += impulse.vy;
    }
    if (weapon) soldier.lastHitWeapon = weapon;
    else if (killer) soldier.lastHitWeapon = killer.state.weapon;
    const scaled = this.state.realistic ? amount * MATCH.realisticDamage : amount;
    const next = applyVestDamage(soldier.state.health, soldier.state.vest, scaled, bodyPart);
    soldier.state.health = next.health;
    soldier.state.vest = next.vest;
    if (soldier.state.health <= 0) this.kill(soldier, killer, bodyPart);
  }

  private kill(
    soldier: InternalSoldier,
    killer?: InternalSoldier,
    bodyPart: 'head' | 'torso' | 'legs' | 'blast' = 'torso',
  ): void {
    if (!soldier.state.alive) return;
    soldier.state.alive = false;
    soldier.state.health = 0;
    soldier.state.jetting = false;
    soldier.cooking = false;
    soldier.state.cooking = false;
    soldier.state.reloading = false;
    soldier.state.deaths += 1;
    soldier.state.spree = 0;
    soldier.multiCount = 0;
    soldier.lastKillAt = 0;
    soldier.state.bonus = '';
    soldier.state.bonusUntil = 0;
    soldier.state.deathKind =
      soldier.lastHitWeapon === 'fall'
        ? 'fall'
        : bodyPart === 'head'
          ? 'head'
          : bodyPart === 'blast'
            ? 'blast'
            : 'body';
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
    if (killer && killer !== soldier) {
      killer.state.kills += 1;
      killer.state.spree += 1;
      if (this.now - killer.lastKillAt <= MULTI_WINDOW_MS) killer.multiCount += 1;
      else killer.multiCount = 1;
      killer.lastKillAt = this.now;
      const mode = this.mode();
      if (mode === 'dm' || mode === 'tdm') killer.state.score += 1;
      if (mode === 'tdm') {
        if (killer.state.team === TEAM.alpha) this.state.alphaScore += 1;
        if (killer.state.team === TEAM.bravo) this.state.bravoScore += 1;
      }
      if (!this.state.firstBlood) {
        this.state.firstBlood = true;
        this.addChat(killer.state.name, 'FIRST BLOOD', 'spree');
      }
      const multi = multiKillLabel(killer.multiCount);
      if (multi) this.addChat(killer.state.name, multi, 'medal');
      const spree = spreeLabel(killer.state.spree);
      if (spree) this.addChat(killer.state.name, spree, 'spree');
    }
    this.dropCarriedFlags(soldier);
    this.pushKillFeed(killer, soldier, soldier.lastHitWeapon, bodyPart === 'head');
    soldier.respawnAt = this.now + PLAYER.respawnDelayMs;
    this.clearInputQueue(soldier);
  }

  private pushKillFeed(
    killer: InternalSoldier | undefined,
    victim: InternalSoldier,
    weapon: string,
    headshot: boolean,
  ): void {
    const row = new KillFeedEntry();
    row.killer = killer && killer !== victim ? displayLabel(killer.state.name, 'Soldier') : '';
    row.victim = displayLabel(victim.state.name, 'Soldier');
    row.weapon = displayLabel(weapon || (killer ? killer.state.weapon : 'fall'), 'fall');
    row.headshot = headshot;
    row.at = this.now;
    this.state.killFeed.unshift(row);
    while (this.state.killFeed.length > KILL_FEED_MAX) this.state.killFeed.pop();
  }

  private respawn(soldier: InternalSoldier): void {
    const spawn = this.pickSpawn(soldier.state.id, soldier.state.team);
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
    p.deathKind = '';
    soldier.lastHitWeapon = '';
    soldier.dashCdMs = 0;
    soldier.botCookUntil = 0;
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
    p.bonus = '';
    p.bonusUntil = 0;
    this.clearInputQueue(soldier);
  }

  private tossFlag(soldier: InternalSoldier): void {
    const p = soldier.state;
    const id = p.id;
    const len = Math.hypot(p.aimX, p.aimY) || 1;
    const nx = p.aimX / len;
    const ny = p.aimY / len;
    const x = Math.max(20, Math.min(GAME_WIDTH - 20, p.x + nx * BONUS.tossFlagDist));
    const y = Math.max(20, Math.min(GAME_HEIGHT - 20, p.y + ny * BONUS.tossFlagDist));
    if (this.state.flagACarrier === id) {
      this.state.flagACarrier = '';
      this.state.flagAx = x;
      this.state.flagAy = y;
      this.state.flagAHome = false;
      this.flagAReturnAt = this.now + MATCH.flagReturnMs;
    }
    if (this.state.flagBCarrier === id) {
      this.state.flagBCarrier = '';
      this.state.flagBx = x;
      this.state.flagBy = y;
      this.state.flagBHome = false;
      this.flagBReturnAt = this.now + MATCH.flagReturnMs;
    }
  }

  private clearInputQueue(soldier: InternalSoldier): void {
    soldier.inputQueue.length = 0;
    soldier.input = idleInput(soldier.state.lastProcessedInput);
    soldier.lastQueuedSeq = soldier.state.lastProcessedInput;
  }

  /** @mechanic blat-pulse */
  private tryBlat(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (this.now < p.blatReadyAt) return;
    p.blatReadyAt = this.now + MATCH.blatCooldownMs;
    this.state.pulseX = p.x;
    this.state.pulseY = p.y;
    this.state.pulseAt = this.now;
    const aim = Math.hypot(p.aimX, p.aimY) || 1;
    p.vx += (p.aimX / aim) * MATCH.blatSelf * 0.35;
    p.vy += (p.aimY / aim) * MATCH.blatSelf * 0.2 - 40;
    for (const other of this.soldiers.values()) {
      if (other === soldier || !other.state.alive) continue;
      if (sameTeam(p.team, other.state.team, this.mode())) continue;
      if (!inRadius(other.state.x, other.state.y, p.x, p.y, MATCH.blatRadius)) continue;
      const imp = blatImpulse(p.x, p.y, other.state.x, other.state.y, MATCH.blatForce);
      this.damage(other, 8, soldier, imp, 'torso', 'blat');
    }
  }

  private dropCarriedFlags(soldier: InternalSoldier): void {
    const id = soldier.state.id;
    if (this.state.flagACarrier === id) {
      this.state.flagACarrier = '';
      this.state.flagAx = soldier.state.x;
      this.state.flagAy = soldier.state.y;
      this.state.flagAHome = false;
      this.flagAReturnAt = this.now + MATCH.flagReturnMs;
    }
    if (this.state.flagBCarrier === id) {
      this.state.flagBCarrier = '';
      this.state.flagBx = soldier.state.x;
      this.state.flagBy = soldier.state.y;
      this.state.flagBHome = false;
      this.flagBReturnAt = this.now + MATCH.flagReturnMs;
    }
  }

  /** @mechanic wind-weather */
  private stepWeather(): void {
    if (this.now < this.windAt) return;
    this.windAt = this.now + MATCH.windShiftMs * (0.7 + Math.random() * 0.6);
    const next = (Math.random() * 2 - 1) * MATCH.windMax;
    this.state.windVx = this.state.windVx * 0.2 + next * 0.8;
    this.state.weather = Math.abs(this.state.windVx) > 70 ? 1 : Math.abs(this.state.windVx) > 40 ? 2 : 0;
  }

  /** @mechanic match-modes */
  private stepObjectives(dt: number): void {
    const mode = this.mode();
    if (mode === 'ctf') this.stepCtf();
    else if (mode === 'point') this.stepPoint(dt);
    else if (mode === 'infil') this.stepInfil(dt);
    this.followFlagCarriers();
  }

  private followFlagCarriers(): void {
    const a = this.soldiers.get(this.state.flagACarrier);
    if (a?.state.alive) {
      this.state.flagAx = a.state.x;
      this.state.flagAy = a.state.y - 18;
    }
    const b = this.soldiers.get(this.state.flagBCarrier);
    if (b?.state.alive) {
      this.state.flagBx = b.state.x;
      this.state.flagBy = b.state.y - 18;
    }
  }

  private stepCtf(): void {
    if (this.state.winner) return;
    if (!this.state.flagACarrier && !this.state.flagAHome && this.now >= this.flagAReturnAt) {
      this.returnFlag('a');
    }
    if (!this.state.flagBCarrier && !this.state.flagBHome && this.now >= this.flagBReturnAt) {
      this.returnFlag('b');
    }
    for (const s of this.soldiers.values()) {
      if (!s.state.alive) continue;
      const p = s.state;
      if (
        !this.state.flagACarrier &&
        inRadius(p.x, p.y, this.state.flagAx, this.state.flagAy, MATCH.captureRadius)
      ) {
        if (p.team === TEAM.bravo) {
          this.state.flagACarrier = p.id;
          this.state.flagAHome = false;
        } else if (p.team === TEAM.alpha && !this.state.flagAHome) {
          this.returnFlag('a');
        }
      }
      if (
        !this.state.flagBCarrier &&
        inRadius(p.x, p.y, this.state.flagBx, this.state.flagBy, MATCH.captureRadius)
      ) {
        if (p.team === TEAM.alpha) {
          this.state.flagBCarrier = p.id;
          this.state.flagBHome = false;
        } else if (p.team === TEAM.bravo && !this.state.flagBHome) {
          this.returnFlag('b');
        }
      }
      if (
        this.state.flagBCarrier === p.id &&
        this.state.flagAHome &&
        inRadius(p.x, p.y, OBJECTIVES.flagAlpha.x, OBJECTIVES.flagAlpha.y, MATCH.captureRadius)
      ) {
        this.state.alphaScore += 1;
        p.score += 1;
        this.returnFlag('b');
      }
      if (
        this.state.flagACarrier === p.id &&
        this.state.flagBHome &&
        inRadius(p.x, p.y, OBJECTIVES.flagBravo.x, OBJECTIVES.flagBravo.y, MATCH.captureRadius)
      ) {
        this.state.bravoScore += 1;
        p.score += 1;
        this.returnFlag('a');
      }
    }
  }

  private returnFlag(which: 'a' | 'b'): void {
    if (which === 'a') {
      this.state.flagAx = OBJECTIVES.flagAlpha.x;
      this.state.flagAy = OBJECTIVES.flagAlpha.y;
      this.state.flagACarrier = '';
      this.state.flagAHome = true;
      this.flagAReturnAt = 0;
    } else {
      this.state.flagBx = OBJECTIVES.flagBravo.x;
      this.state.flagBy = OBJECTIVES.flagBravo.y;
      this.state.flagBCarrier = '';
      this.state.flagBHome = true;
      this.flagBReturnAt = 0;
    }
  }

  private stepPoint(dt: number): void {
    if (this.state.winner) return;
    const inside = [...this.soldiers.values()].filter(
      (s) =>
        s.state.alive &&
        inRadius(s.state.x, s.state.y, OBJECTIVES.point.x, OBJECTIVES.point.y, MATCH.pointRadius),
    );
    if (inside.length === 1) {
      const s = inside[0]!;
      this.state.pointOwner = s.state.team || 1;
      this.pointAcc += dt * MATCH.pointScorePerSec;
      while (this.pointAcc >= 1) {
        this.pointAcc -= 1;
        s.state.score += 1;
      }
    } else {
      this.state.pointOwner = 0;
      this.pointAcc = 0;
    }
  }

  private stepInfil(dt: number): void {
    if (this.state.winner) return;
    for (const s of this.soldiers.values()) {
      const p = s.state;
      if (!p.alive || p.team !== TEAM.bravo) {
        this.infilHold.delete(p.id);
        continue;
      }
      if (inRadius(p.x, p.y, OBJECTIVES.infil.x, OBJECTIVES.infil.y, MATCH.infilRadius)) {
        const held = (this.infilHold.get(p.id) || 0) + dt * 1000;
        this.infilHold.set(p.id, held);
        if (held >= MATCH.infilHoldMs) {
          this.infilHold.set(p.id, 0);
          this.state.bravoScore += 1;
          p.score += 1;
        }
      } else {
        this.infilHold.delete(p.id);
      }
    }
  }

  private checkRound(): void {
    if (this.state.winner) return;
    const mode = this.mode();
    const limit = scoreLimit(mode);
    if (mode === 'dm' || mode === 'point') {
      let best: InternalSoldier | undefined;
      for (const s of this.soldiers.values()) {
        if (!best || s.state.score > best.state.score) best = s;
      }
      if (best && best.state.score >= limit) this.state.winner = displayLabel(best.state.name, 'Soldier');
    } else if (this.state.alphaScore >= limit) {
      this.state.winner = 'Alpha';
    } else if (this.state.bravoScore >= limit) {
      this.state.winner = 'Bravo';
    }
    if (!this.state.winner && this.state.roundEndsAt && this.now >= this.state.roundEndsAt) {
      if (mode === 'dm' || mode === 'point') {
        let best: InternalSoldier | undefined;
        for (const s of this.soldiers.values()) {
          if (!best || s.state.score > best.state.score) best = s;
        }
        this.state.winner = displayLabel(best?.state.name, 'draw');
      } else if (this.state.alphaScore === this.state.bravoScore) {
        this.state.winner = 'draw';
      } else {
        this.state.winner =
          this.state.alphaScore > this.state.bravoScore ? 'Alpha' : 'Bravo';
      }
    }
  }
}
