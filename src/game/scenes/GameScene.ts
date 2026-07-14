import Phaser from 'phaser';
import { Client, Room } from 'colyseus.js';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLATFORMS,
  PLAYER,
  type PlayerInput,
} from '../../../shared/constants';
import type { GameState, PlayerState } from '../../../shared/schema';

type SoldierSprite = Phaser.GameObjects.Image & { jetting?: boolean };

const COLYSEUS_URL = import.meta.env.VITE_COLYSEUS_URL ?? 'http://localhost:2567';

export class GameScene extends Phaser.Scene {
  private room: Room<GameState> | null = null;
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
  private status!: Phaser.GameObjects.Text;
  private fireHeld = false;
  private grenadeQueued = false;

  constructor() {
    super('Game');
  }

  create(): void {
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
      if (pointer.rightButtonDown() || pointer.button === 2) this.grenadeQueued = true;
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

    this.status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Connecting…', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '18px',
        color: COLORS.hud,
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.add
      .text(
        16,
        GAME_HEIGHT - 52,
        'A/D move · W/Space jump/jet · mouse aim · LMB shoot · RMB/G grenade · open 2 tabs to PvP',
        {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          color: COLORS.muted,
        },
      )
      .setScrollFactor(0)
      .setDepth(100);

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    void this.connect();
  }

  update(): void {
    if (!this.room) return;
    this.sendInput();
    this.syncEntities();
    this.updateHud();
  }

  private async connect(): Promise<void> {
    this.status.setVisible(true);
    this.status.setText('Connecting to server…');

    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const client = new Client(COLYSEUS_URL);
        const room = await Promise.race([
          client.joinOrCreate<GameState>('dm', { name: 'Soldier' }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Join timed out after 5s')), 5000),
          ),
        ]);
        this.room = room;
        this.sessionId = room.sessionId;
        this.status.setText('');
        this.status.setVisible(false);
        console.log('[blat] joined room', room.roomId, this.sessionId);
        return;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'WebSocket connection failed';
        console.error('[blat] connect failed', attempt, message, err);
        this.status.setText(
          `Connecting… retry ${attempt}/10\n${message}\n${COLYSEUS_URL}`,
        );
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    this.status.setText(
      `Could not connect to ${COLYSEUS_URL}\nStart the stack with: npm run dev`,
    );
  }

  private sendInput(): void {
    if (!this.room) return;

    let move = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) move -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) move += 1;

    const pointer = this.input.activePointer;
    const me = this.room.state.players.get(this.sessionId);
    const originX = me?.x ?? GAME_WIDTH / 2;
    const originY = me?.y ?? GAME_HEIGHT / 2;
    const aimX = pointer.worldX - originX;
    const aimY = pointer.worldY - originY;

    const grenade =
      this.grenadeQueued || Phaser.Input.Keyboard.JustDown(this.keyG);
    this.grenadeQueued = false;

    const input: PlayerInput = {
      move,
      jet: this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown,
      aimX,
      aimY,
      fire: this.fireHeld || (pointer.isDown && pointer.leftButtonDown()),
      grenade,
    };
    this.room.send('input', input);
  }

  private syncEntities(): void {
    if (!this.room) return;
    const seenSoldiers = new Set<string>();
    const seenBullets = new Set<string>();
    const seenGrenades = new Set<string>();

    this.room.state.players.forEach((player, id) => {
      seenSoldiers.add(id);
      let sprite = this.soldiers.get(id);
      if (!sprite) {
        sprite = this.add.image(player.x, player.y, 'soldier') as SoldierSprite;
        sprite.setDepth(10);
        this.soldiers.set(id, sprite);
      }
      sprite.setPosition(player.x, player.y);
      sprite.setFlipX(player.facing < 0);
      sprite.setAlpha(player.alive ? 1 : 0.45);
      sprite.setTint(this.tintFor(player, id));

      if (player.jetting && player.alive) this.emitJet(player.x, player.y);
    });

    this.room.state.bullets.forEach((bullet, id) => {
      seenBullets.add(id);
      let sprite = this.bullets.get(id);
      if (!sprite) {
        sprite = this.add.image(bullet.x, bullet.y, 'bullet');
        sprite.setDepth(8);
        this.bullets.set(id, sprite);
      }
      sprite.setPosition(bullet.x, bullet.y);
    });

    this.room.state.grenades.forEach((grenade, id) => {
      seenGrenades.add(id);
      let sprite = this.grenades.get(id);
      if (!sprite) {
        sprite = this.add.image(grenade.x, grenade.y, 'grenade');
        sprite.setDepth(9);
        this.grenades.set(id, sprite);
      }
      sprite.setPosition(grenade.x, grenade.y);
    });

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
        this.spawnExplosion(sprite.x, sprite.y);
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

  private updateHud(): void {
    if (!this.room) return;
    const me = this.room.state.players.get(this.sessionId);
    if (!me) {
      this.hud.setText('Waiting for spawn…');
      return;
    }

    const others = [...this.room.state.players.entries()]
      .filter(([id]) => id !== this.sessionId)
      .map(
        ([, p]) =>
          `${p.isBot ? 'BOT' : p.name} ${p.alive ? `${Math.ceil(p.health)}HP` : 'DEAD'}`,
      );

    this.hud.setText(
      [
        `HP ${this.bar(me.health, PLAYER.maxHealth, 10)} ${Math.ceil(me.health)}`,
        `FUEL ${this.bar(me.fuel, PLAYER.maxFuel, 10)} ${Math.ceil(me.fuel)}`,
        `NADES ${me.grenades}/${PLAYER.maxGrenades}`,
        `KILLS ${me.kills}`,
        ...others,
        me.alive ? '' : 'RESPAWNING…',
        `room ${this.room.roomId.slice(0, 8)}`,
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
