import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLATFORMS,
  PLAYER,
} from '../../../shared/constants';
import type { GameState, PlayerState } from '../../../shared/schema';
import { PredictionController } from '../net/PredictionController';
import { ProjectilePredictor } from '../net/ProjectilePredictor';

type SoldierSprite = Phaser.GameObjects.Image;

export class GameScene extends Phaser.Scene {
  private room!: Room<GameState>;
  private roomCode = '';
  private sessionId = '';
  private soldiers = new Map<string, SoldierSprite>();
  private bullets = new Map<string, Phaser.GameObjects.Image>();
  private grenades = new Map<string, Phaser.GameObjects.Image>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;
  private hud!: Phaser.GameObjects.Text;
  private fireHeld = false;
  private prediction = new PredictionController();
  private projectiles = new ProjectilePredictor();
  private nowMs = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.room = this.game.registry.get('room') as Room<GameState>;
    this.roomCode = (this.game.registry.get('roomCode') as string) || '';
    this.sessionId = this.room.sessionId;

    this.drawBackground();
    this.drawPlatforms();

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyG = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.button === 2) this.prediction.latchGrenade();
      else this.fireHeld = true;
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.fireHeld = false;
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
    if (!this.room?.state?.players) return;
    this.nowMs += delta;

    if (this.fireHeld) this.prediction.latchFire();
    if (Phaser.Input.Keyboard.JustDown(this.keyG)) this.prediction.latchGrenade();

    const serverMe = this.room.state.players.get(this.sessionId);
    const aim = this.aimFromPointer(serverMe);
    let move = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) move -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) move += 1;

    if (serverMe && !serverMe.alive) this.projectiles.clear();

    const packets = this.prediction.tick(
      delta,
      {
        move,
        jet: this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown,
        aimX: aim.x,
        aimY: aim.y,
      },
      serverMe,
    );
    for (const packet of packets) {
      this.room.send('input', packet);
      const body = this.prediction.predicted;
      if (body && packet.fire) this.projectiles.tryFire(body, this.nowMs);
      if (body && packet.grenade) {
        this.projectiles.tryGrenade(body, serverMe?.grenades ?? 0, this.nowMs);
      }
    }

    this.projectiles.step(delta / 1000, this.nowMs);
    this.projectiles.match(this.room.state.bullets, this.room.state.grenades, this.sessionId);

    this.syncEntities();
    this.updateHud(serverMe);
  }

  private aimFromPointer(serverMe: PlayerState | undefined): { x: number; y: number } {
    const pointer = this.input.activePointer;
    const originX = this.prediction.predicted?.x ?? serverMe?.x ?? GAME_WIDTH / 2;
    const originY = this.prediction.predicted?.y ?? serverMe?.y ?? GAME_HEIGHT / 2;
    return {
      x: pointer.worldX - originX,
      y: pointer.worldY - originY,
    };
  }

  private syncEntities(): void {
    if (!this.room.state.players) return;
    const seenSoldiers = new Set<string>();
    const seenBullets = new Set<string>();
    const seenGrenades = new Set<string>();

    this.room.state.players.forEach((player, id) => {
      seenSoldiers.add(id);
      let sprite = this.soldiers.get(id);
      if (!sprite) {
        sprite = this.add.image(player.x, player.y, 'soldier');
        sprite.setDepth(10);
        this.soldiers.set(id, sprite);
      }

      if (id === this.sessionId && this.prediction.predicted) {
        const local = this.prediction.predicted;
        sprite.setPosition(local.x, local.y);
        sprite.setFlipX(local.facing < 0);
        sprite.setAlpha(local.alive ? 1 : 0.45);
        sprite.setTint(COLORS.player);
        if (local.jetting && local.alive) this.emitJet(local.x, local.y);
      } else {
        this.prediction.pushRemote(id, player, this.nowMs);
        const sample = this.prediction.sampleRemote(id, this.nowMs);
        if (sample) {
          sprite.setPosition(sample.x, sample.y);
          sprite.setFlipX(sample.facing < 0);
          sprite.setAlpha(sample.alpha);
          sprite.setTint(this.tintFor(player, id));
          if (sample.jetting && sample.alive) this.emitJet(sample.x, sample.y);
        } else {
          sprite.setPosition(player.x, player.y);
          sprite.setFlipX(player.facing < 0);
          sprite.setAlpha(player.alive ? 1 : 0.45);
          sprite.setTint(this.tintFor(player, id));
        }
      }
    });

    this.prediction.pruneRemotes(seenSoldiers);

    this.room.state.bullets?.forEach((bullet, id) => {
      if (this.projectiles.shouldHideServerBullet(id)) {
        const existing = this.bullets.get(id);
        if (existing) {
          existing.destroy();
          this.bullets.delete(id);
        }
        return;
      }
      seenBullets.add(id);
      let sprite = this.bullets.get(id);
      if (!sprite) {
        sprite = this.add.image(bullet.x, bullet.y, 'bullet');
        sprite.setDepth(8);
        this.bullets.set(id, sprite);
      }
      sprite.setPosition(bullet.x, bullet.y);
    });

    for (const pred of this.projectiles.visibleBullets()) {
      const id = pred.id;
      seenBullets.add(id);
      let sprite = this.bullets.get(id);
      if (!sprite) {
        sprite = this.add.image(pred.x, pred.y, 'bullet');
        sprite.setDepth(8);
        this.bullets.set(id, sprite);
      }
      sprite.setPosition(pred.x, pred.y);
    }

    this.room.state.grenades?.forEach((grenade, id) => {
      if (this.projectiles.shouldHideServerGrenade(id)) {
        const existing = this.grenades.get(id);
        if (existing) {
          existing.destroy();
          this.grenades.delete(id);
        }
        return;
      }
      seenGrenades.add(id);
      let sprite = this.grenades.get(id);
      if (!sprite) {
        sprite = this.add.image(grenade.x, grenade.y, 'grenade');
        sprite.setDepth(9);
        this.grenades.set(id, sprite);
      }
      sprite.setPosition(grenade.x, grenade.y);
    });

    for (const pred of this.projectiles.visibleGrenades()) {
      const id = pred.id;
      seenGrenades.add(id);
      let sprite = this.grenades.get(id);
      if (!sprite) {
        sprite = this.add.image(pred.x, pred.y, 'grenade');
        sprite.setDepth(9);
        this.grenades.set(id, sprite);
      }
      sprite.setPosition(pred.x, pred.y);
    }

    for (const boom of this.projectiles.takeExplosions()) {
      this.spawnExplosion(boom.x, boom.y);
    }

    for (const [id, sprite] of this.soldiers) {
      if (!seenSoldiers.has(id)) {
        sprite.destroy();
        this.soldiers.delete(id);
      }
    }
    for (const [id, sprite] of this.bullets) {
      if (!seenBullets.has(id)) {
        sprite.destroy();
        this.bullets.delete(id);
      }
    }
    for (const [id, sprite] of this.grenades) {
      if (!seenGrenades.has(id)) {
        // Server-despawned grenades we were rendering (others / unmatched)
        if (!id.startsWith('pg_')) this.spawnExplosion(sprite.x, sprite.y);
        sprite.destroy();
        this.grenades.delete(id);
      }
    }
  }

  private tintFor(player: PlayerState, id: string): number {
    if (id === this.sessionId) return COLORS.player;
    if (player.isBot) return COLORS.bot;
    return COLORS.other;
  }

  private updateHud(serverMe: PlayerState | undefined): void {
    if (!serverMe) {
      this.hud.setText('Waiting for spawn…');
      return;
    }

    const fuel = this.prediction.predicted?.fuel ?? serverMe.fuel;
    const nades = Math.max(0, serverMe.grenades - this.projectiles.pendingGrenades());
    const others = [...this.room.state.players.entries()]
      .filter(([id]) => id !== this.sessionId)
      .map(
        ([, p]) =>
          `${p.isBot ? 'BOT' : p.name} ${p.alive ? `${Math.ceil(p.health)}HP` : 'DEAD'}`,
      );

    this.hud.setText(
      [
        `HP ${this.bar(serverMe.health, PLAYER.maxHealth, 10)} ${Math.ceil(serverMe.health)}`,
        `FUEL ${this.bar(fuel, PLAYER.maxFuel, 10)} ${Math.ceil(fuel)}`,
        `NADES ${nades}/${PLAYER.maxGrenades}`,
        `KILLS ${serverMe.kills}`,
        ...others,
        serverMe.alive ? '' : 'RESPAWNING…',
        this.roomCode ? `CODE ${this.roomCode}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  private bar(value: number, max: number, width: number): string {
    const filled = Math.round((value / max) * width);
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled));
  }

  private emitJet(x: number, y: number): void {
    if (Math.random() > 0.4) return;
    const p = this.add.image(x, y + 16, 'particle');
    p.setTint(0x38bdf8);
    p.setAlpha(0.8);
    p.setDepth(5);
    this.tweens.add({
      targets: p,
      y: p.y + 18,
      alpha: 0,
      scale: 0.2,
      duration: 180,
      onComplete: () => p.destroy(),
    });
  }

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

  private drawPlatforms(): void {
    for (const p of PLATFORMS) {
      const plat = this.add.image(p.x, p.y, 'platform');
      plat.setDisplaySize(p.w, p.h);
      plat.setDepth(1);
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bgTop, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(COLORS.bgBottom, 0.85);
    g.fillRect(0, GAME_HEIGHT * 0.55, GAME_WIDTH, GAME_HEIGHT * 0.45);
    g.lineStyle(1, 0xffffff, 0.04);
    for (let x = 0; x < GAME_WIDTH; x += 40) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 40) g.lineBetween(0, y, GAME_WIDTH, y);
    g.setDepth(-10);

    this.add
      .text(GAME_WIDTH / 2, 28, 'BLAT', {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: '28px',
        color: '#e8eefc',
      })
      .setOrigin(0.5)
      .setAlpha(0.35)
      .setDepth(0);
  }
}
