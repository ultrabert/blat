import Phaser from 'phaser';
import { BOT, COLORS, GAME_HEIGHT, GAME_WIDTH, PLAYER } from '../constants';
import { Soldier } from '../entities/Soldier';

type PlatformSpec = { x: number; y: number; w: number };

const PLATFORMS: PlatformSpec[] = [
  { x: 640, y: 680, w: 1200 },
  { x: 220, y: 540, w: 280 },
  { x: 640, y: 480, w: 220 },
  { x: 1060, y: 540, w: 280 },
  { x: 140, y: 360, w: 180 },
  { x: 640, y: 300, w: 300 },
  { x: 1140, y: 360, w: 180 },
  { x: 400, y: 200, w: 160 },
  { x: 880, y: 200, w: 160 },
];

const SPAWNS = [
  { x: 160, y: 500 },
  { x: 1120, y: 500 },
  { x: 640, y: 250 },
  { x: 200, y: 320 },
  { x: 1080, y: 320 },
];

export class GameScene extends Phaser.Scene {
  private player!: Soldier;
  private bots: Soldier[] = [];
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private bullets!: Phaser.Physics.Arcade.Group;
  private grenades!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;
  private hud!: Phaser.GameObjects.Text;
  private botThinkAt = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.drawBackground();
    this.platforms = this.physics.add.staticGroup();
    for (const p of PLATFORMS) {
      const plat = this.platforms.create(p.x, p.y, 'platform') as Phaser.Physics.Arcade.Image;
      plat.setDisplaySize(p.w, 22);
      plat.refreshBody();
    }

    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 64,
      runChildUpdate: false,
    });
    this.grenades = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 16,
      runChildUpdate: false,
    });

    this.player = new Soldier(this, SPAWNS[0].x, SPAWNS[0].y, 'player');
    this.bots = [
      new Soldier(this, SPAWNS[1].x, SPAWNS[1].y, 'bot'),
      new Soldier(this, SPAWNS[2].x, SPAWNS[2].y, 'bot'),
    ];

    const soldiers = [this.player, ...this.bots];
    this.physics.add.collider(soldiers, this.platforms);
    this.physics.add.collider(this.grenades, this.platforms);
    this.physics.add.overlap(this.bullets, soldiers, this.onBulletHitSoldier, undefined, this);

    this.events.on('soldier-died', this.onSoldierDied, this);
    this.events.on('grenade-explode', this.onGrenadeExplode, this);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyG = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.player.alive) return;
      const dir = this.player.aimAt(pointer.worldX, pointer.worldY);
      if (pointer.rightButtonDown() || pointer.button === 2) {
        this.player.tryThrowGrenade(dir, this.grenades, this.time.now);
      } else {
        this.player.tryFire(dir, this.bullets, this.time.now);
      }
    });
    this.input.mouse?.disableContextMenu();

    this.hud = this.add
      .text(16, 12, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '14px',
        color: COLORS.hud,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(
        16,
        GAME_HEIGHT - 52,
        'A/D move · W/Space jump/jet · mouse aim · LMB shoot · RMB/G grenade',
        {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          color: COLORS.muted,
        },
      )
      .setScrollFactor(0)
      .setDepth(100);

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  update(_time: number, delta: number): void {
    this.updatePlayer(delta);
    this.updateBots(delta);
    this.cullProjectiles();
    this.updateHud();

    for (const s of [this.player, ...this.bots]) {
      if (s.alive && s.y > GAME_HEIGHT + 40) {
        s.takeDamage(999);
      }
    }
  }

  private updatePlayer(delta: number): void {
    if (!this.player.alive) return;

    let move = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) move -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) move += 1;
    this.player.moveHorizontal(move);

    const thrust =
      this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown;
    this.player.jumpOrJet(thrust, delta);

    const pointer = this.input.activePointer;
    this.player.aimAt(pointer.worldX, pointer.worldY);

    if (Phaser.Input.Keyboard.JustDown(this.keyG)) {
      const dir = this.player.aimAt(pointer.worldX, pointer.worldY);
      this.player.tryThrowGrenade(dir, this.grenades, this.time.now);
    }

    if (pointer.isDown && pointer.leftButtonDown()) {
      const dir = this.player.aimAt(pointer.worldX, pointer.worldY);
      this.player.tryFire(dir, this.bullets, this.time.now);
    }
  }

  private updateBots(delta: number): void {
    if (this.time.now < this.botThinkAt) {
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        bot.jumpOrJet(false, delta);
      }
      return;
    }
    this.botThinkAt = this.time.now + BOT.thinkIntervalMs;

    for (const bot of this.bots) {
      if (!bot.alive) continue;

      const target = this.player.alive
        ? this.player
        : this.bots.find((b) => b !== bot && b.alive);
      if (!target) {
        bot.moveHorizontal(0);
        bot.jumpOrJet(false, delta);
        continue;
      }

      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const dist = Math.hypot(dx, dy);

      const moveDir = Math.abs(dx) > 18 ? Math.sign(dx) : 0;
      bot.moveHorizontal(moveDir);

      const wantsJet = dy < -40 || (!bot.isOnGround && dy < 20);
      bot.jumpOrJet(wantsJet, delta);

      if (dist < BOT.fireRange) {
        const aim = bot.aimAt(
          target.x + Phaser.Math.FloatBetween(-30, 30),
          target.y + Phaser.Math.FloatBetween(-20, 10),
        );
        aim.x += Phaser.Math.FloatBetween(-BOT.aimError, BOT.aimError);
        aim.y += Phaser.Math.FloatBetween(-BOT.aimError, BOT.aimError);
        aim.normalize();

        if (Phaser.Math.Between(0, 100) > 55) {
          bot.tryFire(aim, this.bullets, this.time.now);
        } else if (dist < 260 && bot.grenades > 0 && Phaser.Math.Between(0, 100) > 92) {
          bot.tryThrowGrenade(aim, this.grenades, this.time.now);
        }
      }
    }
  }

  private onBulletHitSoldier: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    bulletObj,
    soldierObj,
  ) => {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image;
    const soldier = soldierObj as Soldier;
    const owner = bullet.getData('owner') as Soldier | undefined;
    if (!soldier.alive || owner === soldier) return;

    const damage = (bullet.getData('damage') as number) ?? PLAYER.bulletDamage;
    this.bullets.killAndHide(bullet);
    const body = bullet.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.enable = false;
    soldier.takeDamage(damage, owner);
  };

  private onGrenadeExplode = (grenade: Phaser.Physics.Arcade.Image): void => {
    if (!grenade.active) return;
    const owner = grenade.getData('owner') as Soldier | undefined;
    const damage = (grenade.getData('damage') as number) ?? PLAYER.grenadeDamage;
    const x = grenade.x;
    const y = grenade.y;

    this.grenades.killAndHide(grenade);
    const body = grenade.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.enable = false;

    this.spawnExplosion(x, y);

    for (const s of [this.player, ...this.bots]) {
      if (!s.alive) continue;
      const dist = Phaser.Math.Distance.Between(x, y, s.x, s.y);
      if (dist <= PLAYER.grenadeBlastRadius) {
        const falloff = 1 - dist / PLAYER.grenadeBlastRadius;
        s.takeDamage(Math.round(damage * (0.45 + 0.55 * falloff)), owner);
        const body = s.body as Phaser.Physics.Arcade.Body;
        const angle = Math.atan2(s.y - y, s.x - x);
        body.setVelocity(
          body.velocity.x + Math.cos(angle) * 280 * falloff,
          body.velocity.y + Math.sin(angle) * 280 * falloff - 80,
        );
      }
    }
  };

  private onSoldierDied = (soldier: Soldier): void => {
    this.spawnExplosion(soldier.x, soldier.y, soldier.kind === 'player' ? COLORS.player : COLORS.bot);
    this.time.delayedCall(PLAYER.respawnDelayMs, () => {
      if (!soldier.active) return;
      const spawn = Phaser.Utils.Array.GetRandom(SPAWNS);
      soldier.respawn(spawn.x, spawn.y);
    });
  };

  private spawnExplosion(x: number, y: number, tint = 0xfbbf24): void {
    for (let i = 0; i < 10; i++) {
      const p = this.add.image(x, y, 'particle');
      p.setTint(tint);
      p.setDepth(20);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-40, 40),
        y: y + Phaser.Math.Between(-40, 40),
        alpha: 0,
        scale: 0.2,
        duration: 220,
        onComplete: () => p.destroy(),
      });
    }
  }

  private cullProjectiles(): void {
    for (const child of this.bullets.getChildren()) {
      const b = child as Phaser.Physics.Arcade.Image;
      if (!b.active) continue;
      if (b.x < -40 || b.x > GAME_WIDTH + 40 || b.y < -40 || b.y > GAME_HEIGHT + 40) {
        this.bullets.killAndHide(b);
        const body = b.body as Phaser.Physics.Arcade.Body | undefined;
        if (body) body.enable = false;
      }
    }
  }

  private updateHud(): void {
    const fuelBar = this.bar(this.player.fuel, PLAYER.maxFuel, 10);
    const hpBar = this.bar(this.player.health, PLAYER.maxHealth, 10);
    const botKills = this.bots.reduce((sum, b) => sum + b.kills, 0);
    this.hud.setText(
      [
        `HP ${hpBar} ${Math.ceil(this.player.health)}`,
        `FUEL ${fuelBar} ${Math.ceil(this.player.fuel)}`,
        `NADES ${this.player.grenades}/${PLAYER.maxGrenades}`,
        `KILLS ${this.player.kills}  DEATHS ${botKills}`,
        this.player.alive ? '' : 'RESPAWNING…',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private bar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillGradientStyle(COLORS.bgTop, COLORS.bgTop, COLORS.bgBottom, COLORS.bgBottom, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = 0; x < GAME_WIDTH; x += 40) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 40) g.lineBetween(0, y, GAME_WIDTH, y);
    g.setDepth(-10);

    this.add
      .text(GAME_WIDTH / 2, 28, 'BLAT', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '28px',
        color: '#e8eefc',
      })
      .setOrigin(0.5)
      .setAlpha(0.35)
      .setDepth(0);
  }
}
