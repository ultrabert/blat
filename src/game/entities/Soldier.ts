import Phaser from 'phaser';
import { COLORS, PLAYER } from '../constants';

export type SoldierKind = 'player' | 'bot';

export class Soldier extends Phaser.Physics.Arcade.Sprite {
  readonly kind: SoldierKind;
  health: number = PLAYER.maxHealth;
  fuel: number = PLAYER.maxFuel;
  grenades: number = PLAYER.maxGrenades;
  kills = 0;
  alive = true;

  private lastFireAt = 0;
  private lastGrenadeAt = 0;
  private facing = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: SoldierKind) {
    super(scene, x, y, 'soldier');
    this.kind = kind;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setDragX(900);
    body.setMaxVelocity(420, 900);
    body.setSize(PLAYER.width - 4, PLAYER.height - 2);
    body.setOffset(2, 1);

    this.setTint(kind === 'player' ? COLORS.player : COLORS.bot);
    this.setDepth(10);
  }

  get isOnGround(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    return body.blocked.down || body.touching.down;
  }

  aimAt(worldX: number, worldY: number): Phaser.Math.Vector2 {
    const dir = new Phaser.Math.Vector2(worldX - this.x, worldY - this.y).normalize();
    this.facing = dir.x >= 0 ? 1 : -1;
    this.setFlipX(this.facing < 0);
    return dir;
  }

  moveHorizontal(dir: number): void {
    if (!this.alive) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (dir !== 0) {
      body.setVelocityX(dir * PLAYER.speed);
      this.facing = dir > 0 ? 1 : -1;
      this.setFlipX(this.facing < 0);
    }
  }

  jumpOrJet(wantsThrust: boolean, deltaMs: number): void {
    if (!this.alive) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const dt = deltaMs / 1000;

    if (wantsThrust && this.isOnGround && body.velocity.y >= -10) {
      body.setVelocityY(PLAYER.jumpVelocity);
      return;
    }

    if (wantsThrust && this.fuel > 0) {
      body.setAccelerationY(PLAYER.jetAcceleration);
      this.fuel = Math.max(0, this.fuel - PLAYER.fuelBurnRate * dt);
      this.emitJetParticles();
    } else {
      body.setAccelerationY(0);
      if (!wantsThrust || this.fuel <= 0) {
        this.fuel = Math.min(PLAYER.maxFuel, this.fuel + PLAYER.fuelRegenRate * dt);
      }
    }
  }

  tryFire(
    dir: Phaser.Math.Vector2,
    bullets: Phaser.Physics.Arcade.Group,
    time: number,
  ): boolean {
    if (!this.alive || time < this.lastFireAt + PLAYER.fireCooldownMs) return false;

    this.lastFireAt = time;
    const muzzleX = this.x + dir.x * 18;
    const muzzleY = this.y + dir.y * 10 - 4;
    const bullet = bullets.get(muzzleX, muzzleY, 'bullet') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return false;

    bullet.setActive(true).setVisible(true);
    bullet.setCircle(4);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(false);
    body.setVelocity(dir.x * PLAYER.bulletSpeed, dir.y * PLAYER.bulletSpeed);
    bullet.setData('owner', this);
    bullet.setData('damage', PLAYER.bulletDamage);
    bullet.setDepth(8);

    this.scene.time.delayedCall(1400, () => {
      if (bullet.active) bullets.killAndHide(bullet);
    });
    return true;
  }

  tryThrowGrenade(
    dir: Phaser.Math.Vector2,
    grenades: Phaser.Physics.Arcade.Group,
    time: number,
  ): boolean {
    if (
      !this.alive ||
      this.grenades <= 0 ||
      time < this.lastGrenadeAt + PLAYER.grenadeCooldownMs
    ) {
      return false;
    }

    this.lastGrenadeAt = time;
    this.grenades -= 1;

    const spawnX = this.x + dir.x * 16;
    const spawnY = this.y - 8;
    const grenade = grenades.get(spawnX, spawnY, 'grenade') as Phaser.Physics.Arcade.Image | null;
    if (!grenade) return false;

    grenade.setActive(true).setVisible(true);
    grenade.setCircle(7);
    const body = grenade.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.setAllowGravity(true);
    body.setBounce(0.45, 0.35);
    body.setDrag(40, 0);
    body.setVelocity(dir.x * PLAYER.grenadeSpeed, dir.y * PLAYER.grenadeSpeed - 180);
    grenade.setData('owner', this);
    grenade.setData('damage', PLAYER.grenadeDamage);
    grenade.setData('spawnedAt', time);
    grenade.setDepth(9);

    this.scene.time.delayedCall(1600, () => {
      if (grenade.active) {
        this.scene.events.emit('grenade-explode', grenade);
      }
    });
    return true;
  }

  takeDamage(amount: number, killer?: Soldier): boolean {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => {
      if (this.active) {
        this.setTint(this.kind === 'player' ? COLORS.player : COLORS.bot);
      }
    });

    if (this.health <= 0) {
      this.die(killer);
      return true;
    }
    return false;
  }

  die(killer?: Soldier): void {
    if (!this.alive) return;
    this.alive = false;
    if (killer && killer !== this) killer.kills += 1;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Phaser.Math.Between(-180, 180), -220);
    body.setAcceleration(0, 0);
    this.setAlpha(0.45);

    this.scene.events.emit('soldier-died', this);
  }

  respawn(x: number, y: number): void {
    this.alive = true;
    this.health = PLAYER.maxHealth;
    this.fuel = PLAYER.maxFuel;
    this.grenades = PLAYER.maxGrenades;
    this.setAlpha(1);
    this.clearTint();
    this.setTint(this.kind === 'player' ? COLORS.player : COLORS.bot);
    this.setPosition(x, y);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
  }

  private emitJetParticles(): void {
    const p = this.scene.add.image(this.x, this.y + 16, 'particle');
    p.setTint(0x38bdf8);
    p.setAlpha(0.8);
    p.setScale(0.8);
    p.setDepth(5);
    this.scene.tweens.add({
      targets: p,
      y: p.y + 18,
      alpha: 0,
      scale: 0.2,
      duration: 180,
      onComplete: () => p.destroy(),
    });
  }
}
