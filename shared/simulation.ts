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
import {
  BulletState,
  GameState,
  GrenadeState,
  PlayerState,
} from './schema.js';

type InternalSoldier = {
  state: PlayerState;
  input: PlayerInput;
  onGround: boolean;
  lastFireAt: number;
  lastGrenadeAt: number;
  respawnAt: number;
  botThinkAt: number;
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

function len(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

function randomSpawn(): { x: number; y: number } {
  return SPAWNS[Math.floor(Math.random() * SPAWNS.length)]!;
}

let nextEntityId = 1;
function eid(prefix: string): string {
  return `${prefix}_${nextEntityId++}`;
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
    this.state.players.set(id, p);
    this.soldiers.set(id, {
      state: p,
      input: { move: 0, jet: false, aimX: 1, aimY: 0, fire: false, grenade: false },
      onGround: false,
      lastFireAt: 0,
      lastGrenadeAt: 0,
      respawnAt: 0,
      botThinkAt: 0,
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
    s.input = {
      move: clamp(Math.round(input.move), -1, 1),
      jet: !!input.jet,
      aimX: input.aimX,
      aimY: input.aimY,
      fire: !!input.fire,
      grenade: !!input.grenade,
    };
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
      if (soldier.state.isBot) this.updateBotBrain(soldier);
      this.stepSoldier(soldier, dt);
    }

    for (const bullet of [...this.bullets.values()]) {
      this.stepBullet(bullet, dt);
    }

    for (const grenade of [...this.grenades.values()]) {
      this.stepGrenade(grenade, dt);
    }
  }

  private updateBotBrain(bot: InternalSoldier): void {
    if (!bot.state.alive) {
      bot.input = { move: 0, jet: false, aimX: 1, aimY: 0, fire: false, grenade: false };
      return;
    }
    if (this.now < bot.botThinkAt) return;
    bot.botThinkAt = this.now + BOT.thinkIntervalMs;

    const target = [...this.soldiers.values()].find(
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
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (soldier.respawnAt && this.now >= soldier.respawnAt) {
        this.respawn(soldier);
      }
      return;
    }

    const aimLen = len(soldier.input.aimX, soldier.input.aimY);
    p.aimX = soldier.input.aimX / aimLen;
    p.aimY = soldier.input.aimY / aimLen;
    if (p.aimX !== 0) p.facing = p.aimX >= 0 ? 1 : -1;

    if (soldier.input.move !== 0) {
      p.vx = soldier.input.move * PLAYER.speed;
      p.facing = soldier.input.move > 0 ? 1 : -1;
    } else {
      const drag = PLAYER.dragX * dt;
      if (Math.abs(p.vx) <= drag) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * drag;
    }

    p.jetting = false;
    if (soldier.input.jet && soldier.onGround && p.vy >= -10) {
      p.vy = PLAYER.jumpVelocity;
      soldier.onGround = false;
    } else if (soldier.input.jet && p.fuel > 0) {
      p.vy += PLAYER.jetAcceleration * dt;
      p.fuel = Math.max(0, p.fuel - PLAYER.fuelBurnRate * dt);
      p.jetting = true;
    } else {
      p.fuel = Math.min(PLAYER.maxFuel, p.fuel + PLAYER.fuelRegenRate * dt);
    }

    p.vy += GRAVITY * dt;
    p.vx = clamp(p.vx, -PLAYER.maxVelocityX, PLAYER.maxVelocityX);
    p.vy = clamp(p.vy, -PLAYER.maxVelocityY, PLAYER.maxVelocityY);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this.collideSoldier(soldier);

    if (p.y > GAME_HEIGHT + 40) {
      this.kill(soldier, undefined);
      return;
    }

    if (soldier.input.fire) this.tryFire(soldier);
    if (soldier.input.grenade) this.tryGrenade(soldier);

    // one-shot actions
    soldier.input.fire = false;
    soldier.input.grenade = false;
  }

  private collideSoldier(soldier: InternalSoldier): void {
    const p = soldier.state;
    const halfW = (PLAYER.width - 4) / 2;
    const halfH = (PLAYER.height - 2) / 2;
    soldier.onGround = false;

    p.x = clamp(p.x, halfW, GAME_WIDTH - halfW);

    for (const plat of PLATFORMS) {
      const left = plat.x - plat.w / 2;
      const right = plat.x + plat.w / 2;
      const top = plat.y - plat.h / 2;
      const bottom = plat.y + plat.h / 2;

      const sx = p.x;
      const sy = p.y;
      const playerLeft = sx - halfW;
      const playerRight = sx + halfW;
      const playerTop = sy - halfH;
      const playerBottom = sy + halfH;

      if (playerRight <= left || playerLeft >= right || playerBottom <= top || playerTop >= bottom) {
        continue;
      }

      // Prefer landing on top when falling
      const overlapTop = playerBottom - top;
      if (p.vy >= 0 && overlapTop > 0 && overlapTop <= 18 + Math.abs(p.vy) * 0.05) {
        p.y = top - halfH;
        p.vy = 0;
        soldier.onGround = true;
      }
    }
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

    // bounce on platforms
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
    soldier.respawnAt = 0;
    soldier.onGround = false;
  }
}
