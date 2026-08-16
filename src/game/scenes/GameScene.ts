import Phaser from 'phaser';
import type { Room } from 'colyseus.js';
import { stanceSpreadRad } from '../../../shared/accuracy';
import {
  COLORS,
  COVERS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLATFORMS,
  PLAYER,
  RAMPS,
  TERRAIN_BOWLS,
  TERRAIN_CAVE_FLOORS,
  TERRAIN_PIT,
  TERRAIN_POLYS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from '../../../shared/constants';
import { GRENADE, remainingFuse } from '../../../shared/grenades';
import { hillOccludes } from '../../../shared/terrain';
import type { GameState, PlayerState } from '../../../shared/schema';
import type { TraceTarget } from '../../../shared/trace';
import {
  DEFAULT_WEAPON,
  isMelee,
  isWeaponId,
  weaponIconKey,
  WEAPONS,
  type WeaponId,
} from '../../../shared/weapons';
import { StickSoldier } from '../StickSoldier';
import { skinForId, SKINS } from '../skins';
import { SCENERY } from '../scenery';
import { sound } from '../audio/SoundBus';
import { impactSurface } from '../audio/surfaces';
import { VisceraFx } from '../fx/VisceraFx';
import { CombatHud } from '../hud';
import { MiniMap } from '../minimap';
import { MATCH, OBJECTIVES, parseMode, sameTeam } from '../../../shared/match';
import { BONUS } from '../../../shared/bonuses';
import { displayLabel } from '../../../shared/labels';
import { PredictionController } from '../net/PredictionController';
import { ProjectilePredictor } from '../net/ProjectilePredictor';

export class GameScene extends Phaser.Scene {
  private room!: Room<GameState>;
  private roomCode = '';
  private sessionId = '';
  private soldiers = new Map<string, StickSoldier>();
  private tracerGfx!: Phaser.GameObjects.Graphics;
  /** Recent positions for Soldat-style tracer streams. */
  private bulletTrails = new Map<string, { x: number; y: number }[]>();
  private grenades = new Map<string, Phaser.GameObjects.Image>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;
  private key1!: Phaser.Input.Keyboard.Key;
  private key2!: Phaser.Input.Keyboard.Key;
  private key3!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyT!: Phaser.Input.Keyboard.Key;
  private keyF1!: Phaser.Input.Keyboard.Key;
  private keyF2!: Phaser.Input.Keyboard.Key;
  private keyF3!: Phaser.Input.Keyboard.Key;
  private keyF4!: Phaser.Input.Keyboard.Key;
  private hud!: CombatHud;
  private miniMap!: MiniMap;
  private objGfx!: Phaser.GameObjects.Graphics;
  private lastPulseAt = 0;
  private lastChatLen = 0;
  private crosshair!: Phaser.GameObjects.Graphics;
  private pickupSprites = new Map<string, Phaser.GameObjects.Container>();
  private localWeapon: WeaponId = DEFAULT_WEAPON;
  private fireHeld = false;
  private grenadeHeld = false;
  private cookStartedAt = 0;
  private wasGrenadeHeld = false;
  private localCooking = false;
  private prediction = new PredictionController();
  private projectiles = new ProjectilePredictor();
  private fx!: VisceraFx;
  private nowMs = 0;
  private lastDelta = 16;
  private lastLocalHealth: number = PLAYER.maxHealth;
  private lastHealth = new Map<string, number>();
  private lastAlive = new Map<string, boolean>();
  private pendingBlast: { x: number; y: number; at: number } | null = null;
  private lastFirearm = '';
  private lastVest = 0;
  private lastNades = 0;
  private lastReserve = 0;
  private lastBonus = '';
  private wasRolling = false;
  private wasDashing = false;
  private aimReadyUntil = 0;
  private spectating = false;
  private camX = GAME_WIDTH / 2;
  private camY = GAME_HEIGHT / 2;
  private shakeMs = 0;
  private shakeAmp = 0;
  private lastPingAt = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.room = this.game.registry.get('room') as Room<GameState>;
    this.roomCode = (this.game.registry.get('roomCode') as string) || '';
    this.sessionId = this.room.sessionId;
    this.spectating = !!this.game.registry.get('spectate');

    this.drawBackground();
    this.drawTerrain();
    this.drawPlatforms();
    this.drawRamps();
    this.drawCovers();
    this.drawScenery();
    this.tracerGfx = this.add.graphics().setDepth(8);
    this.fx = new VisceraFx(this);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyS = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyG = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.key1 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyV = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyShift = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.TAB,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.F1,
      Phaser.Input.Keyboard.KeyCodes.F2,
      Phaser.Input.Keyboard.KeyCodes.F3,
      Phaser.Input.Keyboard.KeyCodes.F4,
    ]);
    this.keyTab = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB, true);
    this.keyE = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyT = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.keyF1 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
    this.keyF2 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2);
    this.keyF3 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    this.keyF4 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F4);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      sound.unlock();
      if (pointer.rightButtonDown() || pointer.button === 2) this.grenadeHeld = true;
      else {
        this.fireHeld = true;
        if (!this.chatFocused()) this.prediction.latchFire();
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.fireHeld = false;
      if (pointer.button === 2) this.grenadeHeld = false;
    });
    // RMB release can come through buttons state
    this.input.on('pointerup', () => {
      if (!this.input.activePointer.rightButtonDown()) this.grenadeHeld = false;
    });
    this.input.keyboard?.on('keydown', () => sound.unlock());
    this.input.mouse?.disableContextMenu();
    sound.unlock();

    this.hud = new CombatHud(this);
    this.miniMap = new MiniMap(this);
    this.objGfx = this.add.graphics().setDepth(3);

    this.crosshair = this.add.graphics().setDepth(90);
    this.input.setDefaultCursor(this.spectating ? 'default' : 'none');

    this.add
      .text(
        VIEW_WIDTH - 16,
        VIEW_HEIGHT - 14,
        this.spectating ? 'DEMO  ·  Tab scores' : 'Tab  ·  T chat',
        {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '10px',
          color: COLORS.muted,
        },
      )
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.4);

    this.room.onMessage('pong', (sentAt: number) => {
      if (typeof sentAt === 'number') this.room.send('rtt', Date.now() - sentAt);
    });

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.setRoundPixels(false);
    if (this.spectating) this.cameras.main.setZoom(1.08);
  }

  update(_time: number, delta: number): void {
    if (!this.room?.state?.players) return;
    this.nowMs += delta;
    this.lastDelta = delta;

    if (this.spectating) {
      this.syncEntities();
      this.syncPickups();
      this.watchWounds();
      this.tickPing();
      this.updateHud(undefined);
      this.updateCamera(undefined);
      this.drawObjectives();
      this.miniMap.draw(this.room.state, '', parseMode(this.room.state.mode));
      this.syncChat();
      this.drawWeather();
      this.watchPulse();
      return;
    }

    const chatting = this.chatFocused();
    const serverMe = this.room.state.players.get(this.sessionId);
    if (!chatting) this.handleWeaponKeys(serverMe);

    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyR)) this.prediction.latchReload();
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyQ)) this.prediction.latchDrop();
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyV)) this.prediction.latchNadeCycle();
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyE)) this.prediction.latchBlat();
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyShift)) this.prediction.latchDash();
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyF)) this.prediction.latchTossFlag();
    this.handleChatKeys(chatting);
    if (chatting) this.grenadeHeld = false;
    else if (this.keyG.isDown) this.grenadeHeld = true;
    if (Phaser.Input.Keyboard.JustUp(this.keyG) && !this.input.activePointer.rightButtonDown()) {
      this.grenadeHeld = false;
    }
    const canCook = !!(serverMe?.alive && (serverMe.grenades > 0 || this.localCooking || serverMe.cooking));
    this.prediction.setGrenadeHeld(this.grenadeHeld && canCook);
    this.updateGrenadeCookPredict(serverMe);

    const aim = this.aimFromPointer(serverMe);
    let move = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) move -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) move += 1;

    if (serverMe && !serverMe.alive) {
      this.projectiles.clear();
      this.localCooking = false;
      this.grenadeHeld = false;
    }

    if (serverMe) {
      if (serverMe.health < this.lastLocalHealth && serverMe.alive) {
        sound.hit();
        sound.wetHit();
        // Adopt server knockback onto predicted body
        if (this.prediction.predicted) {
          this.prediction.predicted.vx = serverMe.vx;
          this.prediction.predicted.vy = serverMe.vy;
        }
      }
      if (serverMe.alive) this.lastLocalHealth = serverMe.health;
      else this.lastLocalHealth = PLAYER.maxHealth;
    }

    this.watchWounds();
    this.prediction.setWorld(!!this.room.state.realistic, this.room.state.windVx || 0);

    const packets = this.prediction.tick(
      delta,
      {
        move: chatting ? 0 : move,
        jet:
          !chatting &&
          (this.cursors.up.isDown || this.keyW.isDown || this.keySpace.isDown),
        crouch: !chatting && (this.cursors.down.isDown || this.keyS.isDown),
        aimX: aim.x,
        aimY: aim.y,
        fireHeld: !chatting && this.fireHeld,
      },
      serverMe,
    );
    for (const packet of packets) {
      this.room.send('input', packet);
      const body = this.prediction.predicted;
      if (body && packet.fire) {
        const w = isWeaponId(serverMe?.weapon ?? this.localWeapon)
          ? ((serverMe?.weapon as WeaponId) ?? this.localWeapon)
          : this.localWeapon;
        const melee = isMelee(w);
        const canShoot =
          !!body.alive &&
          !serverMe?.reloading &&
          (melee || (serverMe?.ammo ?? 1) > 0);
        if (canShoot && this.projectiles.tryFire(body, this.nowMs, packet.seq, w)) {
          sound.shoot(w);
          this.aimReadyUntil = this.nowMs + 220;
        }
      }
    }

    const localJet = !!(this.prediction.predicted?.jetting && this.prediction.predicted?.alive);
    sound.setJetting(localJet);

    const bulletTargets: TraceTarget[] = [];
    this.room.state.players?.forEach((p, id) => {
      if (id === this.sessionId) return;
      this.prediction.pushRemote(id, p, this.nowMs);
      const s = this.prediction.sampleRemote(id, this.nowMs);
      bulletTargets.push({
        id,
        x: s?.x ?? p.x,
        y: s?.y ?? p.y,
        alive: s?.alive ?? p.alive,
        crouching: !!(s?.crouching ?? p.crouching) || !!(s?.rolling ?? p.rolling) || !!(s?.cannonball ?? p.cannonball),
        prone: !!(s?.prone ?? p.prone),
      });
    });
    this.projectiles.step(delta / 1000, this.nowMs, bulletTargets, this.sessionId);
    this.projectiles.match(this.room.state.bullets, this.room.state.grenades, this.sessionId);

    this.syncEntities();
    this.syncPickups();
    this.tickPing();
    this.updateHud(serverMe);
    this.updateCamera(serverMe);
    this.input.activePointer.updateWorldPoint(this.cameras.main);
    this.drawCrosshair(serverMe);
    this.drawObjectives();
    this.miniMap.draw(this.room.state, this.sessionId, parseMode(this.room.state.mode));
    this.syncChat();
    this.drawWeather();
    this.watchPulse();
  }

  private handleWeaponKeys(serverMe: PlayerState | undefined): void {
    if (!serverMe?.alive) return;
    if (Phaser.Input.Keyboard.JustDown(this.key1)) {
      this.room.send('weapon', { weapon: 'firearm' });
    }
    if (Phaser.Input.Keyboard.JustDown(this.key2)) {
      this.room.send('weapon', { weapon: 'melee' });
    }
    if (Phaser.Input.Keyboard.JustDown(this.key3)) {
      this.room.send('weapon', { weapon: 'punch' });
    }
    if (isWeaponId(serverMe.weapon)) this.localWeapon = serverMe.weapon;
  }

  /** Local cook timer + predicted throw on release. */
  private updateGrenadeCookPredict(serverMe: PlayerState | undefined): void {
    const holding = this.grenadeHeld && !!serverMe?.alive;
    const nades = serverMe?.grenades ?? 0;

    if (!this.wasGrenadeHeld && holding && (nades > 0 || serverMe?.cooking)) {
      this.localCooking = true;
      this.cookStartedAt = this.nowMs;
      sound.grenade();
    }

    if (this.localCooking && holding) {
      const cooked = this.nowMs - this.cookStartedAt;
      // Tick faster as fuse runs down
      const urgency = cooked / GRENADE.fuseMs;
      if (urgency > 0.08) sound.cookTick(urgency);
      if (cooked >= GRENADE.fuseMs) {
        // Self-blast predicted — server will confirm
        const body = this.prediction.predicted;
        if (body) this.detonate(body.x, body.y);
        this.localCooking = false;
      }
    }

    if (this.wasGrenadeHeld && !holding && this.localCooking) {
      const body = this.prediction.predicted;
      const fuse = remainingFuse(this.nowMs - this.cookStartedAt);
      if (body) {
        this.projectiles.tryGrenade(body, nades, this.nowMs, fuse, {
          inventoryReserved: true,
        });
      }
      this.localCooking = false;
    }

    if (!holding) this.localCooking = this.localCooking && !!serverMe?.cooking;
    this.wasGrenadeHeld = holding;
  }

  private updateCamera(serverMe: PlayerState | undefined): void {
    if (this.spectating) {
      const alive: { x: number; y: number }[] = [];
      this.room.state.players?.forEach((p) => {
        if (p.alive) alive.push({ x: p.x, y: p.y });
      });
      let tx = GAME_WIDTH / 2;
      let ty = GAME_HEIGHT / 2;
      if (alive.length === 1) {
        tx = alive[0]!.x;
        ty = alive[0]!.y;
      } else if (alive.length >= 2) {
        const radius = 780;
        let best: { x: number; y: number }[] = alive;
        let bestCount = 0;
        for (const p of alive) {
          const group = alive.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius);
          if (group.length > bestCount) {
            bestCount = group.length;
            best = group;
          }
        }
        tx = best.reduce((s, p) => s + p.x, 0) / best.length;
        ty = best.reduce((s, p) => s + p.y, 0) / best.length;
      }
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
      this.centerCam();
      return;
    }
    const x =
      this.prediction.predicted?.x ?? serverMe?.x ?? GAME_WIDTH / 2;
    const y =
      this.prediction.predicted?.y ?? serverMe?.y ?? GAME_HEIGHT / 2;
    const pointer = this.input.activePointer;
    let lx = pointer.worldX - x;
    let ly = pointer.worldY - y;
    const dist = Math.hypot(lx, ly) || 1;
    const maxLead = 240;
    if (dist > maxLead) {
      lx = (lx / dist) * maxLead;
      ly = (ly / dist) * maxLead;
    }
    const lead = 0.42;
    const tx = x + lx * lead;
    const ty = y + ly * lead;
    // @mechanic mouse-lead-camera — dt follow, not 0.5/frame (high Hz hops)
    const dt = Math.max(0.001, Math.min(0.05, (this.lastDelta || 16) / 1000));
    const follow = 1 - Math.exp(-18 * dt);
    this.camX += (tx - this.camX) * follow;
    this.camY += (ty - this.camY) * follow;
    this.centerCam();
  }

  private kickCam(durationMs: number, intensity: number): void {
    this.shakeMs = Math.max(this.shakeMs, durationMs);
    this.shakeAmp = Math.max(this.shakeAmp, intensity * 520);
  }

  private centerCam(): void {
    let ox = 0;
    let oy = 0;
    if (this.shakeMs > 0) {
      this.shakeMs = Math.max(0, this.shakeMs - this.lastDelta);
      const mag = this.shakeAmp * Math.min(1, this.shakeMs / 90);
      ox = (Math.random() - 0.5) * mag;
      oy = (Math.random() - 0.5) * mag;
      this.shakeAmp *= 0.86;
    }
    this.cameras.main.centerOn(this.camX + ox, this.camY + oy);
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
    const dt = this.lastDelta;

    this.room.state.players.forEach((player, id) => {
      seenSoldiers.add(id);
      let stick = this.soldiers.get(id);
      if (!stick) {
        stick = new StickSoldier(this, 10);
        this.soldiers.set(id, stick);
      }

      const skin = skinForId(id, !!player.isBot, id === this.sessionId, player.team);
      const me = this.room.state.players.get(this.sessionId);
      const hidden =
        player.bonus === 'predator' &&
        id !== this.sessionId &&
        !sameTeam(me?.team || 0, player.team, parseMode(this.room.state.mode));
      const visAlpha = hidden ? BONUS.predatorAlpha : player.alive ? 1 : 0.9;
      const weapon: WeaponId =
        player.bonus === 'flamegod'
          ? 'flamer'
          : isWeaponId(player.weapon)
            ? player.weapon
            : DEFAULT_WEAPON;
      const tint = SKINS[skin].tint;

      if (id === this.sessionId && this.prediction.predicted) {
        const local = this.prediction.predicted;
        const rolling = local.rollMs > 0;
        if (rolling && !this.wasRolling) sound.roll();
        this.wasRolling = rolling;
        const dashing = (local.dashMs ?? 0) > 0;
        if (dashing && !this.wasDashing) sound.dash();
        this.wasDashing = dashing;
        if (this.fireHeld) this.aimReadyUntil = this.nowMs + 220;
        stick.update(
          {
            x: local.x,
            y: local.y,
            vx: local.vx,
            vy: local.vy,
            aimX: local.aimX,
            aimY: local.aimY,
            facing: local.facing,
            onGround: local.onGround,
            jetting: local.jetting,
            crouching: local.crouching,
            prone: local.prone,
            rolling: local.rollMs > 0,
            cannonball: local.cannonballMs > 0,
            backflip: local.backflipMs > 0,
            alive: local.alive,
            skin,
            weapon: isWeaponId(this.localWeapon) ? this.localWeapon : weapon,
            aimReady: this.fireHeld || this.nowMs < this.aimReadyUntil,
            local: true,
            name: displayLabel(player.name, player.isBot ? 'Bot' : 'Soldier'),
            showName: false,
            vest: player.vest,
            deathKind: player.deathKind,
            team: player.team,
            tint,
            alpha: visAlpha,
          },
          dt,
        );
        if (local.jetting && local.alive) this.emitJet(local.x, local.y);
      } else {
        this.prediction.pushRemote(id, player, this.nowMs);
        const sample = this.prediction.sampleRemote(id, this.nowMs);
        const view = sample ?? {
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          aimX: player.aimX,
          aimY: player.aimY,
          facing: player.facing,
          onGround: !!player.onGround,
          jetting: player.jetting,
          crouching: !!player.crouching,
          prone: !!player.prone,
          rolling: !!player.rolling,
          cannonball: !!player.cannonball,
          backflip: !!player.backflip,
          alive: player.alive,
          alpha: player.alive ? 1 : 0.9,
        };
        stick.update(
          {
            ...view,
            crouching: view.crouching,
            prone: view.prone,
            rolling: view.rolling,
            cannonball: view.cannonball,
            backflip: view.backflip,
            skin,
            weapon,
            aimReady: true,
            name: displayLabel(player.name, player.isBot ? 'Bot' : 'Soldier'),
            showName: !hidden,
            vest: player.vest,
            deathKind: player.deathKind,
            team: player.team,
            tint,
            alpha: hidden ? visAlpha : view.alive ? view.alpha : 0.9,
          },
          dt,
        );
        if (view.jetting && view.alive) this.emitJet(view.x, view.y);
      }

      const land = stick.consumeLandFx();
      if (land) {
        this.emitLandDust(land.x, land.y);
        sound.land(id === this.sessionId);
      }
      if (stick.consumeDeathFx()) sound.death();
      if (id === this.sessionId && stick.consumeFootstep()) sound.footstep();
    });

    this.prediction.pruneRemotes(seenSoldiers);

    type Tracer = {
      id: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      weapon: string;
    };
    const tracers: Tracer[] = [];

    this.room.state.bullets?.forEach((bullet, id) => {
      if (this.projectiles.shouldHideServerBullet(id)) return;
      seenBullets.add(id);
      tracers.push({
        id,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        weapon: bullet.weapon || 'rifle',
      });
    });

    for (const pred of this.projectiles.visibleBullets()) {
      seenBullets.add(pred.id);
      tracers.push({
        id: pred.id,
        x: pred.x,
        y: pred.y,
        vx: pred.vx,
        vy: pred.vy,
        weapon: pred.weapon || 'rifle',
      });
    }

    this.drawTracers(tracers, seenBullets);

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
      this.detonate(boom.x, boom.y);
    }
    for (const flash of this.projectiles.takeMuzzleFlashes()) {
      if (flash.weapon === 'spas') {
        this.fx.shotgunMuzzle(flash.x, flash.y, flash.aimX, flash.aimY);
      }
    }
    for (const hit of this.projectiles.takeImpacts()) {
      if (hit.kind === 'player') {
        this.fx.bulletWound(hit.x, hit.y);
        sound.wetHit();
      } else {
        this.fx.wallSpark(hit.x, hit.y);
        sound.impact(impactSurface(hit.kind, hit.x, hit.y));
      }
    }

    for (const [id, stick] of this.soldiers) {
      if (!seenSoldiers.has(id)) {
        stick.destroy();
        this.soldiers.delete(id);
      }
    }
    for (const [id, sprite] of this.grenades) {
      if (!seenGrenades.has(id)) {
        // Server-despawned grenades we were rendering (others / unmatched)
        if (!id.startsWith('pg_')) {
          this.detonate(sprite.x, sprite.y);
        }
        sprite.destroy();
        this.grenades.delete(id);
      }
    }
  }

  private syncPickups(): void {
    const me = this.room.state.players?.get(this.sessionId);
    if (me) {
      if (
        (this.lastFirearm && me.firearm !== this.lastFirearm) ||
        me.vest > this.lastVest + 4 ||
        me.grenades > this.lastNades ||
        me.reserve > this.lastReserve + 8 ||
        (!!me.bonus && me.bonus !== this.lastBonus)
      ) {
        sound.pickup();
      }
      this.lastFirearm = me.firearm;
      this.lastVest = me.vest;
      this.lastNades = me.grenades;
      this.lastReserve = me.reserve;
      this.lastBonus = me.bonus || '';
    }

    const seen = new Set<string>();
    this.room.state.pickups?.forEach((p, id) => {
      seen.add(id);
      let box = this.pickupSprites.get(id);
      if (!box) {
        const kind = p.kind || 'weapon';
        const item = p.item || p.weapon;
        const iconKey = kind === 'weapon' ? weaponIconKey(item) : '';
        const hasIcon = !!iconKey && this.textures.exists(iconKey) && kind === 'weapon';
        const parts: Phaser.GameObjects.GameObject[] = [];
        const pad = this.add.graphics();
        const tint =
          kind === 'medkit'
            ? 0x14532d
            : kind === 'vest'
              ? 0x1e3a5f
              : kind === 'ammo'
                ? 0x713f12
                : kind === 'nade'
                  ? 0x7c2d12
                  : kind === 'bonus'
                    ? item === 'berserk'
                      ? 0x7f1d1d
                      : item === 'predator'
                        ? 0x3f3f46
                        : 0x9a3412
                    : 0x0b1020;
        pad.fillStyle(tint, 0.7);
        pad.fillRoundedRect(-22, -18, 44, 36, 6);
        pad.lineStyle(2, 0xe8eefc, 0.35);
        pad.strokeRoundedRect(-22, -18, 44, 36, 6);
        parts.push(pad);
        if (hasIcon) {
          const icon = this.add.image(0, -2, iconKey);
          const src = this.textures.get(iconKey).getSourceImage() as { width: number; height: number };
          const iw = src.width || 36;
          const ih = src.height || 16;
          const s = Math.min(34 / iw, 16 / ih);
          icon.setDisplaySize(iw * s, ih * s);
          parts.push(icon);
        } else {
          const label =
            kind === 'medkit'
              ? '+'
              : kind === 'vest'
                ? 'V'
                : kind === 'ammo'
                  ? 'A'
                  : kind === 'nade'
                    ? (item === 'cluster' ? 'C' : item === 'sting' ? 'S' : 'F')
                    : kind === 'bonus'
                      ? item === 'berserk'
                        ? 'B'
                        : item === 'predator'
                          ? 'P'
                          : 'G'
                      : isWeaponId(item)
                        ? (WEAPONS[item]?.short ?? '?')
                        : '?';
          parts.push(
            this.add
              .text(0, 0, label, {
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: '12px',
                color: '#e8eefc',
              })
              .setOrigin(0.5),
          );
        }
        box = this.add.container(p.x, p.y, parts).setDepth(4);
        this.pickupSprites.set(id, box);
      }
      box.setPosition(p.x, p.y - 8);
      const behindHill = hillOccludes(p.x, p.y, this.camY);
      box.setVisible(!!p.active && !behindHill);
      box.setAlpha(0.8 + Math.sin(this.nowMs / 280) * 0.15);
      box.y = p.y - 8 + Math.sin(this.nowMs / 400) * 3;
    });
    for (const [id, box] of this.pickupSprites) {
      if (!seen.has(id)) {
        box.destroy();
        this.pickupSprites.delete(id);
      }
    }
  }

  /**
   * Rifle: streaming tracers. Shotgun: short cone pellets.
   * Sniper: long fast streak + brief persistence-of-vision trail (no beam).
   */
  private drawTracers(
    tracers: { id: string; x: number; y: number; vx: number; vy: number; weapon: string }[],
    seen: Set<string>,
  ): void {
    const g = this.tracerGfx;
    g.clear();

    for (const t of tracers) {
      const isShot = t.weapon === 'spas';
      const isSniper = t.weapon === 'barrett';
      const isFlame = t.weapon === 'flamer';
      const isRocket = t.weapon === 'law' || t.weapon === 'm79';
      const trailLen = isShot ? 3 : isSniper ? 8 : isFlame ? 4 : 5;

      let trail = this.bulletTrails.get(t.id);
      if (!trail) {
        trail = [];
        this.bulletTrails.set(t.id, trail);
      }
      const last = trail[trail.length - 1];
      const minStep = isSniper ? 6 : 2;
      if (!last || Math.hypot(last.x - t.x, last.y - t.y) > minStep) {
        trail.push({ x: t.x, y: t.y });
        if (trail.length > trailLen) trail.shift();
      }

      const speed = Math.hypot(t.vx, t.vy) || 1;
      const ux = t.vx / speed;
      const uy = t.vy / speed;
      const streak = Math.min(
        isSniper ? 72 : isShot ? 16 : 40,
        Math.max(isSniper ? 36 : isShot ? 8 : 18, speed * (isSniper ? 0.055 : isShot ? 0.018 : 0.036)),
      );
      const x1 = t.x;
      const y1 = t.y;
      const x0 = x1 - ux * streak;
      const y0 = y1 - uy * streak;

      const glow = isFlame
        ? 0xf97316
        : isRocket
          ? 0xfacc15
          : isSniper
            ? 0xa5f3fc
            : isShot
              ? 0xfb923c
              : 0xfbbf24;
      const core = isFlame ? 0xffedd5 : isSniper ? 0xecfeff : isShot ? 0xffedd5 : 0xfff7c2;
      g.lineStyle(isShot ? 2.6 : isSniper ? 2.4 : 3.4, glow, isShot ? 0.4 : isSniper ? 0.22 : 0.28);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.strokePath();
      g.lineStyle(isShot ? 1.35 : isSniper ? 1.15 : 1.55, core, isSniper ? 0.85 : 0.95);
      g.beginPath();
      g.moveTo(
        x0 + ux * streak * (isShot ? 0.15 : isSniper ? 0.45 : 0.32),
        y0 + uy * streak * (isShot ? 0.15 : isSniper ? 0.45 : 0.32),
      );
      g.lineTo(x1, y1);
      g.strokePath();
      g.fillStyle(0xfffbeb, isSniper ? 0.75 : 1);
      g.fillCircle(x1, y1, isShot ? 1.6 : isSniper ? 1.1 : 1.35);

      // Persistence-of-vision ghost (stronger / longer for sniper)
      if (!isShot && trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1]!;
          const b = trail[i]!;
          const alpha = isSniper
            ? 0.04 + (i / trail.length) * 0.18
            : 0.08 + (i / trail.length) * 0.22;
          g.lineStyle(isSniper ? 1.0 : 1.2, glow, alpha);
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.strokePath();
        }
      }
    }

    for (const id of [...this.bulletTrails.keys()]) {
      if (!seen.has(id)) this.bulletTrails.delete(id);
    }
  }

  private tickPing(): void {
    if (this.spectating) return;
    if (this.nowMs - this.lastPingAt < 1500) return;
    this.lastPingAt = this.nowMs;
    this.room.send('ping', Date.now());
  }

  private updateHud(serverMe: PlayerState | undefined): void {
    const fuel = this.prediction.predicted?.fuel ?? serverMe?.fuel ?? PLAYER.maxFuel;
    const cooking = this.localCooking || !!serverMe?.cooking;
    const cookFrac = cooking
      ? Math.min(1, (this.nowMs - this.cookStartedAt) / GRENADE.fuseMs)
      : 0;
    this.hud.update(this.room.state, {
      me: serverMe,
      fuel,
      cooking,
      cookFrac,
      spectating: this.spectating,
      scoreboard: this.keyTab?.isDown ?? false,
      roomCode: this.roomCode,
      nowMs: this.nowMs,
    });
  }

  private drawCrosshair(serverMe?: PlayerState): void {
    const g = this.crosshair;
    g.clear();
    const body = this.prediction.predicted;
    if (!body?.alive) return;

    const pointer = this.input.activePointer;
    const px = pointer.worldX;
    const py = pointer.worldY;
    const weaponId = isWeaponId(serverMe?.weapon ?? this.localWeapon)
      ? ((serverMe?.weapon as WeaponId) ?? this.localWeapon)
      : DEFAULT_WEAPON;
    const weapon = WEAPONS[weaponId];
    const spread =
      stanceSpreadRad({
        vx: body.vx,
        vy: body.vy,
        onGround: body.onGround,
        jetting: body.jetting,
        crouching: body.crouching,
        prone: body.prone,
        rolling: body.rollMs > 0,
        cannonball: body.cannonballMs > 0,
      }) *
        weapon.spreadMult +
      weapon.pelletSpread;
    const cone = Math.min(56, 10 + spread * 220 + body.recoil * 90);

    g.lineStyle(1.5, 0xe8e4dc, 0.85);
    g.strokeCircle(px, py, cone);
    g.lineStyle(1, 0xe8e4dc, 0.55);
    g.beginPath();
    g.moveTo(px - cone - 4, py);
    g.lineTo(px - 3, py);
    g.moveTo(px + 3, py);
    g.lineTo(px + cone + 4, py);
    g.moveTo(px, py - cone - 4);
    g.lineTo(px, py - 3);
    g.moveTo(px, py + 3);
    g.lineTo(px, py + cone + 4);
    g.strokePath();
    g.fillStyle(0xe8e4dc, 0.9);
    g.fillCircle(px, py, 1.5);
  }

  private watchWounds(): void {
    if (!this.room.state.players) return;
    const seen = new Set<string>();
    this.room.state.players.forEach((p, id) => {
      seen.add(id);
      const prevH = this.lastHealth.get(id);
      const prevAlive = this.lastAlive.get(id);

      if (prevH !== undefined && p.health < prevH && p.alive) {
        const sample =
          id === this.sessionId && this.prediction.predicted
            ? this.prediction.predicted
            : p;
        if (id === this.sessionId) {
          const dmg = prevH - p.health;
          this.kickCam(80 + dmg * 0.6, 0.0035 + dmg * 0.00007);
          this.fx.lensBlood(dmg);
          sound.pain();
        }
        // Prefer blast wound if a grenade just went off nearby
        if (
          this.pendingBlast &&
          this.nowMs - this.pendingBlast.at < 120 &&
          Math.hypot(sample.x - this.pendingBlast.x, sample.y - this.pendingBlast.y) <
            PLAYER.grenadeBlastRadius + 20
        ) {
          this.fx.blastWound(
            sample.x,
            sample.y,
            this.pendingBlast.x,
            this.pendingBlast.y,
            prevH - p.health,
          );
        } else if (id !== this.sessionId || prevH - p.health >= PLAYER.bulletDamage - 1) {
          // Local predicted bulletWound already fired on impact; still spray for remotes
          if (id !== this.sessionId) {
            this.fx.bulletWound(sample.x, sample.y, -p.aimX, -p.aimY);
            sound.wetHit();
          }
        }
      }

      if (prevAlive === true && !p.alive) {
        const sample =
          id === this.sessionId && this.prediction.predicted
            ? this.prediction.predicted
            : p;
        this.fx.deathGibs(sample.x, sample.y, sample.vx, sample.vy);
        this.fx.bloodPool(sample.x, sample.y + 16);
        sound.wetHit();
      }

      this.lastHealth.set(id, p.health);
      this.lastAlive.set(id, p.alive);
    });

    for (const id of this.lastHealth.keys()) {
      if (!seen.has(id)) {
        this.lastHealth.delete(id);
        this.lastAlive.delete(id);
      }
    }
  }

  private detonate(x: number, y: number): void {
    this.fx.explosion(x, y);
    sound.explode(1);
    this.pendingBlast = { x, y, at: this.nowMs };
    const me = this.prediction.predicted;
    if (me) {
      const d = Math.hypot(me.x - x, me.y - y);
      if (d < 420) this.kickCam(140, 0.008 * (1 - d / 420));
    }
    // Gib anyone standing in the blast (visual; damage comes from server)
    this.room.state.players?.forEach((p) => {
      if (!p.alive) return;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist <= PLAYER.grenadeBlastRadius) {
        this.fx.blastWound(p.x, p.y, x, y, PLAYER.grenadeDamage * (1 - dist / PLAYER.grenadeBlastRadius));
      }
    });
  }

  private emitLandDust(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const p = this.add.image(x, y, 'particle');
      p.setTint(0x94a3b8);
      p.setAlpha(0.7);
      p.setDepth(6);
      const dir = i % 2 === 0 ? -1 : 1;
      this.tweens.add({
        targets: p,
        x: x + dir * Phaser.Math.Between(8, 28),
        y: y - Phaser.Math.Between(2, 12),
        alpha: 0,
        scale: 0.25,
        duration: 220 + i * 20,
        onComplete: () => p.destroy(),
      });
    }
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

  private drawPlatforms(): void {
    const useArt = this.textures.exists('terrain_dirt') && this.textures.exists('terrain_edge');
    for (const p of PLATFORMS) {
      const sky = p.y < 180;
      const cave = p.y > 980;
      const pit = p.y >= 800 && p.y <= 980;
      const rim = !sky && !cave && !pit && (p.x < 520 || p.x > 2040);
      if (useArt) {
        const fillH = Math.max(p.h, p.w > 800 ? 48 : 28);
        const body = this.add.tileSprite(p.x, p.y + 4, p.w, fillH, 'terrain_dirt');
        body.setDepth(1);
        body.setTint(sky ? 0x8a9bb5 : pit ? 0xd2b48c : cave ? 0x6b5340 : 0xc4a574);
        const edge = this.add.image(p.x, p.y - fillH / 2 + 6, 'terrain_edge');
        edge.setDisplaySize(p.w + 4, Math.min(22, 14 + p.h * 0.2));
        edge.setDepth(1.1);
        const outline = this.add.graphics().setDepth(0.9);
        outline.lineStyle(2, 0x1a1208, 0.65);
        outline.strokeRect(p.x - p.w / 2, p.y - fillH / 2 + 4, p.w, fillH);
      } else {
        const plat = this.add.image(p.x, p.y, 'platform');
        plat.setDisplaySize(p.w, p.h);
        plat.setDepth(1);
        if (sky) plat.setTint(0x8a9bb5);
        if (pit) plat.setTint(0xd4b896);
        if (cave) plat.setTint(0x6b5340);
      }
      if (rim || pit) {
        const top = p.y - p.h / 2;
        const cap = this.add.tileSprite(p.x, top - 2, p.w + 6, 12, 'grass_cap');
        cap.setDepth(1.2);
        if (pit) cap.setTint(0xc9a86c);
      }
    }
  }

  private drawRamps(): void {
    const g = this.add.graphics().setDepth(0.85);
    g.lineStyle(3, 0x2a2118, 0.55);
    for (const r of RAMPS) {
      if (Math.max(r.ay, r.by) <= 860) continue;
      g.lineBetween(r.ax, r.ay, r.bx, r.by);
    }
  }

  private drawCovers(): void {
    const bags = this.textures.exists('prop_sandbags');
    const ruin = this.textures.exists('prop_ruin');
    const crate = this.textures.exists('prop_crate');
    for (const c of COVERS) {
      if (c.mat === 'wood' && crate) {
        const img = this.add.image(c.x, c.y, 'prop_crate');
        img.setDisplaySize(c.w * 1.25, c.h * 1.15);
        img.setDepth(2);
      } else if (c.mat === 'stone' && ruin) {
        const img = this.add.image(c.x, c.y, 'prop_ruin');
        img.setDisplaySize(c.w * 1.35, c.h * 1.15);
        img.setDepth(2);
        img.setTint(0x9aa8b8);
      } else if (bags) {
        const img = this.add.image(c.x, c.y, 'prop_sandbags');
        img.setDisplaySize(c.w * 1.4, c.h * 1.25);
        img.setDepth(2);
      } else {
        const cover = this.add.image(c.x, c.y, 'cover');
        cover.setDisplaySize(c.w, c.h);
        cover.setDepth(2);
        cover.setTint(c.mat === 'stone' ? 0x5a6a82 : c.mat === 'wood' ? 0x8b6914 : 0x8b9cb3);
      }
    }
  }

  private drawScenery(): void {
    for (const s of SCENERY) {
      if (!this.textures.exists(s.key)) continue;
      const img = this.add.image(s.x, s.y, s.key);
      img.setOrigin(0.5, s.originY ?? 1);
      img.setScale(s.scale);
      img.setDepth(s.depth ?? 0);
      img.setScrollFactor(s.scroll ?? 1);
      if (s.flipX) img.setFlipX(true);
      if (s.alpha !== undefined) img.setAlpha(s.alpha);
    }
  }

  private drawTerrain(): void {
    this.paintCaves();
    this.paintMaskedFill(TERRAIN_BOWLS, 'dirt_tile', 0x9a7a52, -5);
    this.paintMaskedFill([TERRAIN_PIT], 'sand_tile', 0xd2b48c, -5);
    this.paintMaskedFill(TERRAIN_CAVE_FLOORS, 'dirt_tile', 0x4a3728, -5);
    this.paintHillShade();
    this.paintOutlines();
    this.paintGrassCaps();
  }

  private fillPoly(
    g: Phaser.GameObjects.Graphics,
    poly: { x: number; y: number }[],
  ): void {
    if (poly.length < 3) return;
    g.beginPath();
    g.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i]!.x, poly[i]!.y);
    g.closePath();
    g.fillPath();
  }

  private paintMaskedFill(
    polys: { x: number; y: number }[][],
    tileKey: string,
    tint: number,
    depth: number,
  ): void {
    const key = this.textures.exists(tileKey)
      ? tileKey
      : this.textures.exists('terrain_dirt')
        ? 'terrain_dirt'
        : 'dirt_tile';
    const maskG = this.add.graphics().setVisible(false);
    maskG.fillStyle(0xffffff, 1);
    for (const poly of polys) this.fillPoly(maskG, poly);
    const tile = this.add.tileSprite(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      key,
    );
    tile.setDepth(depth);
    tile.setTint(tint);
    tile.setMask(maskG.createGeometryMask());
  }

  private paintCaves(): void {
    const g = this.add.graphics().setDepth(-6);
    g.fillStyle(0x0c0a08, 0.94);
    g.fillRect(0, 328, 412, 820);
    g.fillRect(2148, 328, 412, 820);
    g.fillStyle(0x090706, 0.9);
    g.beginPath();
    g.moveTo(400, 960);
    g.lineTo(520, 1020);
    g.lineTo(700, 1000);
    g.lineTo(920, 849);
    g.lineTo(920, GAME_HEIGHT);
    g.lineTo(400, GAME_HEIGHT);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(2160, 960);
    g.lineTo(2040, 1020);
    g.lineTo(1860, 1000);
    g.lineTo(1640, 849);
    g.lineTo(1640, GAME_HEIGHT);
    g.lineTo(2160, GAME_HEIGHT);
    g.closePath();
    g.fillPath();
  }

  private paintHillShade(): void {
    const g = this.add.graphics().setDepth(-4.85);
    g.fillStyle(0x1a120c, 0.32);
    g.fillTriangle(400, 960, 720, 1008, 430, 520);
    g.fillTriangle(2160, 960, 1840, 1008, 2130, 520);
  }

  private paintOutlines(): void {
    const g = this.add.graphics().setDepth(-4.7);
    g.lineStyle(3, 0x1a1208, 0.8);
    for (const poly of TERRAIN_POLYS) {
      if (poly.length < 3) continue;
      g.beginPath();
      g.moveTo(poly[0]!.x, poly[0]!.y);
      for (let i = 1; i < poly.length; i++) g.lineTo(poly[i]!.x, poly[i]!.y);
      g.closePath();
      g.strokePath();
    }
  }

  private paintGrassCaps(): void {
    const g = this.add.graphics().setDepth(-4.4);
    for (const r of RAMPS) {
      if (Math.max(r.ay, r.by) > 860) continue;
      const dx = r.bx - r.ax;
      const dy = r.by - r.ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (dy / len) * 5;
      const ny = (-dx / len) * 5;
      g.lineStyle(11, 0x2f541c, 1);
      g.lineBetween(r.ax + nx, r.ay + ny, r.bx + nx, r.by + ny);
      g.lineStyle(6, 0x5a8f38, 1);
      g.lineBetween(r.ax + nx * 1.4, r.ay + ny * 1.4, r.bx + nx * 1.4, r.by + ny * 1.4);
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(0x152238, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.fillStyle(0x243656, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.38);
    g.fillStyle(0x3d2a1a, 0.28);
    g.fillRect(0, GAME_HEIGHT * 0.52, GAME_WIDTH, GAME_HEIGHT * 0.48);
    g.setDepth(-12);

    const ridges = this.add.graphics().setDepth(-11).setScrollFactor(0.18);
    ridges.fillStyle(0x1b2a44, 1);
    ridges.beginPath();
    ridges.moveTo(-80, 420);
    ridges.lineTo(220, 260);
    ridges.lineTo(480, 340);
    ridges.lineTo(820, 210);
    ridges.lineTo(1180, 300);
    ridges.lineTo(1500, 190);
    ridges.lineTo(1860, 280);
    ridges.lineTo(2280, 200);
    ridges.lineTo(2680, 330);
    ridges.lineTo(2680, 900);
    ridges.lineTo(-80, 900);
    ridges.closePath();
    ridges.fillPath();
    ridges.fillStyle(0x122036, 0.85);
    ridges.fillTriangle(100, 520, 360, 280, 620, 520);
    ridges.fillTriangle(1700, 540, 2040, 250, 2380, 540);

    if (this.textures.exists('bg_cloud')) {
      for (const c of [
        { x: 280, y: 90, s: 0.7, a: 0.35, f: 0.12 },
        { x: 900, y: 60, s: 0.9, a: 0.28, f: 0.1 },
        { x: 1600, y: 80, s: 0.75, a: 0.32, f: 0.14 },
        { x: 2200, y: 50, s: 0.85, a: 0.25, f: 0.11 },
      ]) {
        const img = this.add.image(c.x, c.y, 'bg_cloud');
        img.setScale(c.s);
        img.setAlpha(c.a);
        img.setScrollFactor(c.f);
        img.setDepth(-10);
      }
    }

    this.add
      .text(VIEW_WIDTH / 2, 22, 'BLAT', {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: '22px',
        color: '#e8eefc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0.2)
      .setDepth(100);
  }

  private chatFocused(): boolean {
    return document.activeElement?.id === 'chat-input';
  }

  private handleChatKeys(chatting: boolean): void {
    const input = document.querySelector<HTMLInputElement>('#chat-input');
    if (!input) return;
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyT)) {
      input.focus();
      input.value = '';
    }
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyF1)) this.room.send('taunt', { i: 0 });
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyF2)) this.room.send('taunt', { i: 1 });
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyF3)) this.room.send('taunt', { i: 2 });
    if (!chatting && Phaser.Input.Keyboard.JustDown(this.keyF4)) this.room.send('taunt', { i: 3 });
    if (!input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          const text = input.value.trim();
          if (text) this.room.send('chat', { text });
          input.value = '';
          input.blur();
          ev.preventDefault();
        }
        if (ev.key === 'Escape') {
          input.value = '';
          input.blur();
        }
        ev.stopPropagation();
      });
    }
  }

  private syncChat(): void {
    const log = document.querySelector<HTMLElement>('#chat-log');
    if (!log) return;
    const rows: string[] = [];
    this.room.state.chat?.forEach((c) => {
      const mark =
        c.kind === 'taunt' ? '!' : c.kind === 'spree' || c.kind === 'medal' ? '*' : '>';
      rows.push(`${mark} ${displayLabel(c.name, 'Soldier')}: ${displayLabel(c.text)}`);
    });
    const next = rows.slice(0, 6).join('\n');
    if (next.length === this.lastChatLen && log.childElementCount) return;
    this.lastChatLen = next.length;
    log.replaceChildren();
    for (const line of rows.slice(0, 6)) {
      const div = document.createElement('div');
      div.textContent = line;
      log.append(div);
    }
  }

  private drawObjectives(): void {
    const g = this.objGfx;
    g.clear();
    const st = this.room.state;
    const mode = parseMode(st.mode);
    if (mode === 'ctf') {
      g.fillStyle(0x3b82f6, 0.95);
      g.fillTriangle(st.flagAx, st.flagAy - 16, st.flagAx - 10, st.flagAy + 4, st.flagAx + 10, st.flagAy + 4);
      g.fillStyle(0xef4444, 0.95);
      g.fillTriangle(st.flagBx, st.flagBy - 16, st.flagBx - 10, st.flagBy + 4, st.flagBx + 10, st.flagBy + 4);
    }
    if (mode === 'point') {
      g.lineStyle(2, st.pointOwner ? 0xfbbf24 : 0x94a3b8, 0.7);
      g.strokeCircle(OBJECTIVES.point.x, OBJECTIVES.point.y, MATCH.pointRadius);
    }
    if (mode === 'infil') {
      const r = MATCH.infilRadius;
      g.lineStyle(2, 0xfbbf24, 0.75);
      g.strokeRect(OBJECTIVES.infil.x - r, OBJECTIVES.infil.y - r * 0.5, r * 2, r);
    }
  }

  private watchPulse(): void {
    const at = this.room.state.pulseAt || 0;
    if (at && at !== this.lastPulseAt) {
      this.lastPulseAt = at;
      this.pulseRing(this.room.state.pulseX, this.room.state.pulseY);
    }
  }

  private pulseRing(x: number, y: number): void {
    const ring = this.add.circle(x, y, 12, 0xc4b5fd, 0.35).setDepth(12);
    this.tweens.add({
      targets: ring,
      scale: 7,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    });
    sound.pulse();
  }

  private drawWeather(): void {
    const weather = this.room.state.weather || 0;
    const wind = this.room.state.windVx || 0;
    if (weather === 0) return;
    const cam = this.cameras.main;
    const n = weather === 1 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const px = cam.scrollX + Math.random() * VIEW_WIDTH;
      const py = cam.scrollY + (weather === 1 ? -8 : Math.random() * VIEW_HEIGHT);
      const p = this.add.image(px, py, 'particle');
      p.setTint(weather === 1 ? 0x93c5fd : 0xd6c7a1);
      p.setAlpha(weather === 1 ? 0.55 : 0.28);
      p.setDepth(7);
      p.setScale(weather === 1 ? 0.35 : 0.5);
      this.tweens.add({
        targets: p,
        x: px + wind * 0.45 + (weather === 1 ? 30 : 80),
        y: py + (weather === 1 ? 140 : 18),
        alpha: 0,
        duration: 280 + Math.random() * 180,
        onComplete: () => p.destroy(),
      });
    }
  }
}
