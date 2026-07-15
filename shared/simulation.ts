import {
  BOT,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
  SPAWNS,
  type PlayerInput,
} from './constants.js';
import { fellOutOfWorld, stepMovement, type MoveBody } from './physics.js';
import {
  BulletState,
  GameState,
  GrenadeState,
  PlayerState,
} from './schema.js';

const MAX_INPUT_QUEUE = 48;
/** When buffered, drain extra steps so seqs aren't dropped. */
const MAX_INPUT_CATCHUP = 3;

type InternalSoldier = {
  state: PlayerState;
  input: PlayerInput;
  inputQueue: PlayerInput[];
  onGround: boolean;
  lastFireAt: number;
  lastGrenadeAt: number;
  respawnAt: number;
  botThinkAt: number;
  lastQueuedSeq: number;
};

type InternalBullet = {
  state: BulletState;
  bornAt: number;
};

type InternalGrenade = {
  state: GrenadeState;
  explodeAt: number;
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
  soldier.onGround = body.onGround;
}

function normalizeInput(input: PlayerInput, seq: number): PlayerInput {
  return {
    seq,
    move: clamp(Math.round(input.move), -1, 1),
    jet: !!input.jet,
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
  private now = 0;

  constructor(private readonly state: GameState) {}

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
    p.lastProcessedInput = 0;
    this.state.players.set(id, p);
    this.soldiers.set(id, {
      state: p,
      input: idleInput(0),
      inputQueue: [],
      onGround: false,
      lastFireAt: 0,
      lastGrenadeAt: 0,
      respawnAt: 0,
      botThinkAt: 0,
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
  }

  /** Pop next queued input, or hold last (with fire/grenade cleared). */
  private consumeNextInput(soldier: InternalSoldier): void {
    const next = soldier.inputQueue.shift();
    if (next) {
      soldier.input = next;
      soldier.state.lastProcessedInput = next.seq;
      return;
    }
    // Hold movement/aim, but don't re-fire on empty ticks
    soldier.input = {
      ...soldier.input,
      fire: false,
      grenade: false,
    };
  }

  private updateBotBrain(bot: InternalSoldier): void {
    if (!bot.state.alive) {
      bot.input = idleInput(bot.state.lastProcessedInput);
      return;
    }
    if (this.now < bot.botThinkAt) return;
    bot.botThinkAt = this.now + BOT.thinkIntervalMs;

    const target =
      [...this.soldiers.values()].find(
        (s) => s !== bot && s.state.alive && !s.state.isBot,
      ) ?? [...this.soldiers.values()].find((s) => s !== bot && s.state.alive);

    if (!target) {
      bot.input.move = 0;
      bot.input.jet = false;
      bot.input.fire = false;
      return;
    }

    const dx = target.state.x - bot.state.x;
    const dy = target.state.y - bot.state.y;
    const dist = Math.hypot(dx, dy);
    bot.input.move = Math.abs(dx) > 18 ? Math.sign(dx) : 0;
    bot.input.jet = dy < -40 || (!bot.onGround && dy < 20);
    bot.input.aimX = dx + (Math.random() * 60 - 30);
    bot.input.aimY = dy + (Math.random() * 30 - 20);
    bot.input.fire = dist < BOT.fireRange && Math.random() > 0.45;
    bot.input.grenade = dist < 260 && bot.state.grenades > 0 && Math.random() > 0.92;
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
    if (soldier.input.grenade) this.tryGrenade(soldier);

    soldier.input.fire = false;
    soldier.input.grenade = false;
  }

  private tryFire(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (this.now < soldier.lastFireAt + PLAYER.fireCooldownMs) return;
    soldier.lastFireAt = this.now;

    const id = eid('b');
    const b = new BulletState();
    b.id = id;
    b.ownerId = p.id;
    b.x = p.x + p.aimX * 20;
    b.y = p.y + p.aimY * 12 - 4;
    b.vx = p.aimX * PLAYER.bulletSpeed;
    b.vy = p.aimY * PLAYER.bulletSpeed;
    this.state.bullets.set(id, b);
    this.bullets.set(id, { state: b, bornAt: this.now });
  }

  private tryGrenade(soldier: InternalSoldier): void {
    const p = soldier.state;
    if (p.grenades <= 0) return;
    if (this.now < soldier.lastGrenadeAt + PLAYER.grenadeCooldownMs) return;
    soldier.lastGrenadeAt = this.now;
    p.grenades -= 1;

    const id = eid('g');
    const g = new GrenadeState();
    g.id = id;
    g.ownerId = p.id;
    g.x = p.x + p.aimX * 16;
    g.y = p.y - 8;
    g.vx = p.aimX * PLAYER.grenadeSpeed;
    g.vy = p.aimY * PLAYER.grenadeSpeed - 180;
    this.state.grenades.set(id, g);
    this.grenades.set(id, { state: g, explodeAt: this.now + 1600 });
  }

  private stepBullet(bullet: InternalBullet, dt: number): void {
    const b = bullet.state;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (
      b.x < -40 ||
      b.x > GAME_WIDTH + 40 ||
      b.y < -40 ||
      b.y > GAME_HEIGHT + 40 ||
      this.now - bullet.bornAt > 1400
    ) {
      this.removeBullet(b.id);
      return;
    }

    for (const soldier of this.soldiers.values()) {
      if (!soldier.state.alive || soldier.state.id === b.ownerId) continue;
      if (Math.abs(b.x - soldier.state.x) < 16 && Math.abs(b.y - soldier.state.y) < 22) {
        const killer = this.soldiers.get(b.ownerId);
        this.damage(soldier, PLAYER.bulletDamage, killer);
        this.removeBullet(b.id);
        return;
      }
    }
  }

  private stepGrenade(grenade: InternalGrenade, dt: number): void {
    const g = grenade.state;
    g.vy += GRAVITY * dt;
    g.vx *= Math.max(0, 1 - 40 * dt);
    g.x += g.vx * dt;
    g.y += g.vy * dt;

    for (const plat of PLATFORMS) {
      const left = plat.x - plat.w / 2;
      const right = plat.x + plat.w / 2;
      const top = plat.y - plat.h / 2;
      if (g.x >= left && g.x <= right && g.y >= top - 8 && g.y <= top + 12 && g.vy > 0) {
        g.y = top - 8;
        g.vy *= -0.45;
        g.vx *= 0.85;
      }
    }

    if (this.now >= grenade.explodeAt) {
      this.explodeGrenade(grenade);
    }
  }

  private explodeGrenade(grenade: InternalGrenade): void {
    const g = grenade.state;
    const killer = this.soldiers.get(g.ownerId);
    for (const soldier of this.soldiers.values()) {
      if (!soldier.state.alive) continue;
      const dist = Math.hypot(soldier.state.x - g.x, soldier.state.y - g.y);
      if (dist <= PLAYER.grenadeBlastRadius) {
        const falloff = 1 - dist / PLAYER.grenadeBlastRadius;
        this.damage(
          soldier,
          Math.round(PLAYER.grenadeDamage * (0.45 + 0.55 * falloff)),
          killer,
        );
        const angle = Math.atan2(soldier.state.y - g.y, soldier.state.x - g.x);
        soldier.state.vx += Math.cos(angle) * 280 * falloff;
        soldier.state.vy += Math.sin(angle) * 280 * falloff - 80;
      }
    }
    this.grenades.delete(g.id);
    this.state.grenades.delete(g.id);
  }

  private removeBullet(id: string): void {
    this.bullets.delete(id);
    this.state.bullets.delete(id);
  }

  private damage(soldier: InternalSoldier, amount: number, killer?: InternalSoldier): void {
    if (!soldier.state.alive) return;
    soldier.state.health = Math.max(0, soldier.state.health - amount);
    if (soldier.state.health <= 0) this.kill(soldier, killer);
  }

  private kill(soldier: InternalSoldier, killer?: InternalSoldier): void {
    if (!soldier.state.alive) return;
    soldier.state.alive = false;
    soldier.state.health = 0;
    soldier.state.jetting = false;
    soldier.state.vx = Math.random() * 360 - 180;
    soldier.state.vy = -220;
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
    soldier.respawnAt = 0;
    soldier.onGround = false;
    this.clearInputQueue(soldier);
  }

  private clearInputQueue(soldier: InternalSoldier): void {
    soldier.inputQueue.length = 0;
    soldier.input = idleInput(soldier.state.lastProcessedInput);
    soldier.lastQueuedSeq = soldier.state.lastProcessedInput;
  }
}
