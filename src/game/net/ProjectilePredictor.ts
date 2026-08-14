import {
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  PLAYER,
  PLATFORMS,
} from '../../../shared/constants';
import { fireDirection, shotgunBlastDirections } from '../../../shared/accuracy';
import { BALLISTICS, muzzleVelocity, stepBallistic } from '../../../shared/ballistics';
import { GRENADE } from '../../../shared/grenades';
import type { MoveBody } from '../../../shared/physics';
import type { BulletState, GrenadeState } from '../../../shared/schema';
import { DEFAULT_WEAPON, isWeaponId, WEAPONS } from '../../../shared/weapons';
import { traceBullet, type TraceTarget } from '../../../shared/trace';

type PredBullet = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  power: number;
  bornAt: number;
  weapon: string;
  /** Muzzle origin — used for sniper fade streaks. */
  ox: number;
  oy: number;
  serverId: string | null;
};

type PredGrenade = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  fuseMs: number;
  serverId: string | null;
};

const BULLET_LIFE_MS = BALLISTICS.lifeMs;
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

  private impacts: {
    x: number;
    y: number;
    kind: string;
    weapon: string;
    ox: number;
    oy: number;
  }[] = [];
  private muzzleFlashes: {
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    weapon: string;
  }[] = [];

  clear(): void {
    this.bullets = [];
    this.grenades = [];
    this.hiddenBullets.clear();
    this.hiddenGrenades.clear();
    this.explosions = [];
    this.impacts = [];
    this.muzzleFlashes = [];
  }

  /** Pending local throws not yet reflected in server grenade count. */
  pendingGrenades(): number {
    return this.grenades.filter((g) => !g.serverId).length;
  }

  /**
   * @mechanic ballistic-projectiles
   * @mechanic client-prediction
   * @mechanic state-accuracy
   * @mechanic recoil
   * @mechanic weapon-arsenal
   */
  tryFire(body: MoveBody, now: number, seed: number, weaponId: string = 'rifle'): boolean {
    if (!body.alive) return false;
    const weapon = WEAPONS[isWeaponId(weaponId) ? weaponId : DEFAULT_WEAPON];
    if (now < this.lastFireAt + weapon.fireCooldownMs) return false;
    this.lastFireAt = now;

    const stance = {
      vx: body.vx,
      vy: body.vy,
      onGround: body.onGround,
      jetting: body.jetting,
      crouching: body.crouching,
      rolling: body.rollMs > 0,
      cannonball: body.cannonballMs > 0,
    };

    const crouch = body.crouching || body.rollMs > 0;
    const muzzleY = (dirY: number) => body.y + dirY * (crouch ? 6 : 12) - (crouch ? 2 : 4);

    if (weapon.id === 'shotgun') {
      const blast = shotgunBlastDirections(body.aimX, body.aimY, stance, body.recoil, seed, {
        pellets: weapon.pellets,
        spreadMult: weapon.spreadMult,
        pelletSpread: weapon.pelletSpread,
        recoilKick: weapon.recoilKick,
        recoilMax: weapon.recoilMax,
      });
      body.recoil = blast.recoil;
      const center = blast.dirs[Math.floor(blast.dirs.length / 2)] ?? {
        aimX: body.aimX,
        aimY: body.aimY,
      };
      const base = muzzleVelocity(center.aimX, center.aimY, body.vx, body.vy, weapon.muzzleSpeed);
      const speed = Math.hypot(base.vx, base.vy);
      const ox = body.x + center.aimX * 18;
      const oy = muzzleY(center.aimY);
      this.muzzleFlashes.push({
        x: ox,
        y: oy,
        aimX: center.aimX,
        aimY: center.aimY,
        weapon: weapon.id,
      });
      for (const dir of blast.dirs) {
        this.bullets.push({
          id: `pb_${this.nextId++}`,
          x: body.x + dir.aimX * 18,
          y: muzzleY(dir.aimY),
          vx: dir.aimX * speed,
          vy: dir.aimY * speed,
          power: base.power,
          bornAt: now,
          weapon: weapon.id,
          ox,
          oy,
          serverId: null,
        });
      }
      return true;
    }

    for (let i = 0; i < weapon.pellets; i++) {
      const fired = fireDirection(body.aimX, body.aimY, stance, body.recoil, seed + i * 97, {
        spreadMult: weapon.spreadMult,
        pelletSpread: weapon.pelletSpread,
        recoilKick: weapon.recoilKick,
        recoilMax: weapon.recoilMax,
        applyRecoil: i === 0,
      });
      if (i === 0) body.recoil = fired.recoil;

      const muzzle = muzzleVelocity(
        fired.aimX,
        fired.aimY,
        body.vx,
        body.vy,
        weapon.muzzleSpeed,
      );
      const ox = body.x + fired.aimX * 20;
      const oy = muzzleY(fired.aimY);
      this.bullets.push({
        id: `pb_${this.nextId++}`,
        x: ox,
        y: oy,
        vx: muzzle.vx,
        vy: muzzle.vy,
        power: muzzle.power,
        bornAt: now,
        weapon: weapon.id,
        ox,
        oy,
        serverId: null,
      });
    }
    return true;
  }

  /**
   * @mechanic throwable-grenades
   * @mechanic client-prediction
   */
  tryGrenade(
    body: MoveBody,
    serverGrenades: number,
    now: number,
    fuseMs: number,
    opts: { inventoryReserved?: boolean } = {},
  ): boolean {
    if (!body.alive) return false;
    if (!opts.inventoryReserved) {
      if (serverGrenades - this.pendingGrenades() <= 0) return false;
    }
    if (now < this.lastGrenadeAt + PLAYER.grenadeCooldownMs) return false;
    this.lastGrenadeAt = now;

    const len = aimLen(body.aimX, body.aimY);
    const ax = body.aimX / len;
    const ay = body.aimY / len;
    this.grenades.push({
      id: `pg_${this.nextId++}`,
      x: body.x + ax * 16,
      y: body.y - 8,
      vx: ax * GRENADE.throwSpeed + body.vx * 0.35,
      vy: ay * GRENADE.throwSpeed - 180 + body.vy * 0.2,
      bornAt: now,
      fuseMs: Math.max(GRENADE.minFuseMs, fuseMs),
      serverId: null,
    });
    return true;
  }

  step(dt: number, now: number, targets: TraceTarget[] = [], ownerId = ''): void {
    const kept: PredBullet[] = [];
    for (const b of this.bullets) {
      const { x0, y0, x1, y1 } = stepBallistic(b, dt);
      const hit = traceBullet(x0, y0, x1, y1, targets, ownerId);
      if (hit) {
        this.impacts.push({
          x: hit.x,
          y: hit.y,
          kind: hit.kind,
          weapon: b.weapon,
          ox: b.ox,
          oy: b.oy,
        });
        continue;
      }
      // stepBallistic already wrote x/y
      kept.push(b);
    }
    this.bullets = kept;

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
      if (now - g.bornAt > g.fuseMs) {
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

  takeImpacts(): {
    x: number;
    y: number;
    kind: string;
    weapon: string;
    ox: number;
    oy: number;
  }[] {
    const out = this.impacts;
    this.impacts = [];
    return out;
  }

  takeMuzzleFlashes(): {
    x: number;
    y: number;
    aimX: number;
    aimY: number;
    weapon: string;
  }[] {
    const out = this.muzzleFlashes;
    this.muzzleFlashes = [];
    return out;
  }

  private bounceGrenade(g: PredGrenade): void {
    const bounceOn = (cx: number, cy: number, w: number, h: number) => {
      const left = cx - w / 2;
      const right = cx + w / 2;
      const top = cy - h / 2;
      const bottom = cy + h / 2;
      if (g.x < left || g.x > right || g.y < top - 10 || g.y > bottom + 4) return;
      if (g.vy > 0 && g.y <= top + 14) {
        g.y = top - 8;
        g.vy *= -GRENADE.bounce;
        g.vx *= GRENADE.bounceFriction;
        return;
      }
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
  }
}
