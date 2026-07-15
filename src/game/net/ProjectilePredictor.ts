import {
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
} from '../../../shared/constants';
import type { MoveBody } from '../../../shared/physics';
import type { BulletState, GrenadeState } from '../../../shared/schema';

type PredBullet = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  serverId: string | null;
};

type PredGrenade = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  serverId: string | null;
};

const BULLET_LIFE_MS = 1400;
const GRENADE_LIFE_MS = 1600;
/** Drop ghost shots if the server never confirms. */
const MATCH_TIMEOUT_MS = 700;

function aimLen(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

export class ProjectilePredictor {
  private bullets: PredBullet[] = [];
  private grenades: PredGrenade[] = [];
  private hiddenBullets = new Set<string>();
  private hiddenGrenades = new Set<string>();
  private lastFireAt = -Infinity;
  private lastGrenadeAt = -Infinity;
  private nextId = 1;
  private explosions: { x: number; y: number }[] = [];

  clear(): void {
    this.bullets = [];
    this.grenades = [];
    this.hiddenBullets.clear();
    this.hiddenGrenades.clear();
    this.explosions = [];
  }

  /** Pending local throws not yet reflected in server grenade count. */
  pendingGrenades(): number {
    return this.grenades.filter((g) => !g.serverId).length;
  }

  tryFire(body: MoveBody, now: number): boolean {
    if (!body.alive) return false;
    if (now < this.lastFireAt + PLAYER.fireCooldownMs) return false;
    this.lastFireAt = now;

    const len = aimLen(body.aimX, body.aimY);
    const ax = body.aimX / len;
    const ay = body.aimY / len;
    this.bullets.push({
      id: `pb_${this.nextId++}`,
      x: body.x + ax * 20,
      y: body.y + ay * 12 - 4,
      vx: ax * PLAYER.bulletSpeed,
      vy: ay * PLAYER.bulletSpeed,
      bornAt: now,
      serverId: null,
    });
    return true;
  }

  tryGrenade(body: MoveBody, serverGrenades: number, now: number): boolean {
    if (!body.alive) return false;
    if (serverGrenades - this.pendingGrenades() <= 0) return false;
    if (now < this.lastGrenadeAt + PLAYER.grenadeCooldownMs) return false;
    this.lastGrenadeAt = now;

    const len = aimLen(body.aimX, body.aimY);
    const ax = body.aimX / len;
    const ay = body.aimY / len;
    this.grenades.push({
      id: `pg_${this.nextId++}`,
      x: body.x + ax * 16,
      y: body.y - 8,
      vx: ax * PLAYER.grenadeSpeed,
      vy: ay * PLAYER.grenadeSpeed - 180,
      bornAt: now,
      serverId: null,
    });
    return true;
  }

  step(dt: number, now: number): void {
    // Bullets keep local integration after match so the shot never rewinds.
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // Unmatched grenades simulate locally; matched ones follow server in match().
    for (const g of this.grenades) {
      if (g.serverId) continue;
      g.vy += GRAVITY * dt;
      g.vx *= Math.max(0, 1 - 40 * dt);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      this.bounceGrenade(g);
    }

    this.bullets = this.bullets.filter((b) => {
      if (!b.serverId && now - b.bornAt > MATCH_TIMEOUT_MS) return false;
      if (now - b.bornAt > BULLET_LIFE_MS) return false;
      if (b.x < -40 || b.x > GAME_WIDTH + 40 || b.y < -40 || b.y > GAME_HEIGHT + 40) {
        return false;
      }
      return true;
    });

    this.grenades = this.grenades.filter((g) => {
      if (g.serverId) return true;
      if (now - g.bornAt > MATCH_TIMEOUT_MS) return false;
      if (now - g.bornAt > GRENADE_LIFE_MS) {
        this.explosions.push({ x: g.x, y: g.y });
        return false;
      }
      return true;
    });
  }

  match(
    bullets: { forEach: (cb: (b: BulletState, id: string) => void) => void } | undefined,
    grenades: { forEach: (cb: (g: GrenadeState, id: string) => void) => void } | undefined,
    localId: string,
  ): void {
    const seenBullets = new Set<string>();
    bullets?.forEach((b, id) => {
      seenBullets.add(id);
      if (b.ownerId !== localId) return;
      if (this.hiddenBullets.has(id)) return;
      const pred = this.bullets.find((p) => !p.serverId);
      if (!pred) return;
      pred.serverId = id;
      this.hiddenBullets.add(id);
    });

    const seenGrenades = new Set<string>();
    grenades?.forEach((g, id) => {
      seenGrenades.add(id);
      if (g.ownerId !== localId) return;
      if (this.hiddenGrenades.has(id)) return;
      const pred = this.grenades.find((p) => !p.serverId);
      if (!pred) return;
      pred.serverId = id;
      this.hiddenGrenades.add(id);
    });

    // Server removed → finish local stand-in
    for (const id of [...this.hiddenBullets]) {
      if (!seenBullets.has(id)) {
        this.hiddenBullets.delete(id);
        this.bullets = this.bullets.filter((b) => b.serverId !== id);
      }
    }
    for (const id of [...this.hiddenGrenades]) {
      if (!seenGrenades.has(id)) {
        this.hiddenGrenades.delete(id);
        const pred = this.grenades.find((g) => g.serverId === id);
        if (pred) this.explosions.push({ x: pred.x, y: pred.y });
        this.grenades = this.grenades.filter((g) => g.serverId !== id);
      }
    }

    // If local stand-in is gone but server entity remains, show the server one.
    for (const id of [...this.hiddenBullets]) {
      if (!this.bullets.some((b) => b.serverId === id)) this.hiddenBullets.delete(id);
    }
    for (const id of [...this.hiddenGrenades]) {
      if (!this.grenades.some((g) => g.serverId === id)) this.hiddenGrenades.delete(id);
    }

    // Matched grenades follow server so bounce/explosion stay authoritative.
    grenades?.forEach((g, id) => {
      const pred = this.grenades.find((p) => p.serverId === id);
      if (pred) {
        pred.x = g.x;
        pred.y = g.y;
        pred.vx = g.vx;
        pred.vy = g.vy;
      }
    });
  }

  shouldHideServerBullet(id: string): boolean {
    return this.hiddenBullets.has(id);
  }

  shouldHideServerGrenade(id: string): boolean {
    return this.hiddenGrenades.has(id);
  }

  visibleBullets(): PredBullet[] {
    return this.bullets;
  }

  visibleGrenades(): PredGrenade[] {
    return this.grenades;
  }

  takeExplosions(): { x: number; y: number }[] {
    const out = this.explosions;
    this.explosions = [];
    return out;
  }

  private bounceGrenade(g: PredGrenade): void {
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
  }
}
