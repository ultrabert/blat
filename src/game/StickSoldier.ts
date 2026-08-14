import Phaser from 'phaser';
import { PLATFORMS } from '../../shared/constants';
import { type WeaponId } from '../../shared/weapons';
import { displayLabel } from '../../shared/labels';
import { SKINS, SKIN_IDS, skinPartKeys, type SkinId, DEFAULT_SKIN } from './skins';

export type StickView = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimX: number;
  aimY: number;
  facing: number;
  onGround: boolean;
  jetting: boolean;
  crouching: boolean;
  prone?: boolean;
  rolling: boolean;
  cannonball: boolean;
  backflip: boolean;
  alive: boolean;
  skin: SkinId;
  weapon: WeaponId;
  /** True while firing / recently fired — full aim; else low-ready. */
  aimReady: boolean;
  name?: string;
  showName?: boolean;
  vest?: number;
  deathKind?: string;
  team?: number;
  /** Kept for ragdoll/gun fallback shading. */
  tint: number;
  alpha: number;
};

type Pt = { x: number; y: number };

type Pose = {
  hip: Pt;
  shoulder: Pt;
  head: Pt;
  gunHand: Pt;
  offHand: Pt;
  lKnee: Pt;
  rKnee: Pt;
  lFoot: Pt;
  rFoot: Pt;
  squash: number;
};

type VerletNode = {
  x: number;
  y: number;
  px: number;
  py: number;
};

type VerletStick = {
  a: number;
  b: number;
  len: number;
};

const HEAD_DISPLAY = 17;
const TORSO_W = 16;
const LIMB_THICK = 8.8;
const SILHOUETTE = 0x0b0e14;
/** Cool vest shade — readable armor, not a pale wash over the kit. */
const VEST_TINT = 0x6d8aa8;

/** Held weapon display length (px) + grip/fore distances along barrel from pivot. */
const HOLD_RIFLE = { len: 30, grip: 4, fore: 13 };
const HOLD_SNIPER = { len: 38, grip: 5, fore: 16 };
const HOLD_SHOT = { len: 26, grip: 4, fore: 12 };
const HOLD_PISTOL = { len: 18, grip: 3, fore: 8 };
const HOLD_LAUNCH = { len: 30, grip: 5, fore: 14 };
const HOLD_MELEE = { len: 20, grip: 2, fore: 11 };

type GunKind = 'rifle' | 'sniper' | 'shot' | 'pistol' | 'launch' | 'melee' | 'bow';

function weaponHold(id: WeaponId): typeof HOLD_RIFLE {
  if (id === 'de' || id === 'socom') return HOLD_PISTOL;
  if (id === 'barrett' || id === 'ruger') return HOLD_SNIPER;
  if (id === 'bow') return HOLD_SNIPER;
  if (id === 'spas') return HOLD_SHOT;
  if (id === 'm79' || id === 'law' || id === 'flamer' || id === 'minigun') return HOLD_LAUNCH;
  if (id === 'knife' || id === 'chainsaw' || id === 'punch') return HOLD_MELEE;
  return HOLD_RIFLE;
}

function gunKind(id: WeaponId): GunKind {
  if (id === 'de' || id === 'socom') return 'pistol';
  if (id === 'barrett' || id === 'ruger') return 'sniper';
  if (id === 'bow') return 'bow';
  if (id === 'spas') return 'shot';
  if (id === 'm79' || id === 'law' || id === 'flamer' || id === 'minigun') return 'launch';
  if (id === 'knife' || id === 'chainsaw' || id === 'punch') return 'melee';
  return 'rifle';
}

function strokeSeg(
  g: Phaser.GameObjects.Graphics,
  a: Pt,
  b: Pt,
  w: number,
  color: number,
  alpha = 1,
): void {
  g.lineStyle(w, color, alpha);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.strokePath();
  g.fillStyle(color, alpha);
  g.fillCircle(a.x, a.y, w * 0.5);
  g.fillCircle(b.x, b.y, w * 0.5);
}

function len2(x: number, y: number): number {
  return Math.hypot(x, y) || 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ang(x: number, y: number): number {
  return Math.atan2(y, x);
}

function offset(p: Pt, a: number, dist: number): Pt {
  return { x: p.x + Math.cos(a) * dist, y: p.y + Math.sin(a) * dist };
}

/** Shortest-path blend of angles. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

type PartSet = {
  head: Phaser.GameObjects.Image;
  torso: Phaser.GameObjects.Image;
  gunArm: Phaser.GameObjects.Image;
  offArm: Phaser.GameObjects.Image;
  lThigh: Phaser.GameObjects.Image;
  lShin: Phaser.GameObjects.Image;
  rThigh: Phaser.GameObjects.Image;
  rShin: Phaser.GameObjects.Image;
};

/**
 * Skinned stick soldier: painted parts posed on the stick skeleton,
 * Verlet ragdoll when dead. Cosmetic only — hitboxes stay on the sim capsule.
 */
export class StickSoldier {
  readonly root: Phaser.GameObjects.Container;
  private readonly gunGfx: Phaser.GameObjects.Graphics;
  private readonly fallbackGfx: Phaser.GameObjects.Graphics;
  private parts: PartSet | null = null;
  private skin: SkinId | null = null;
  private readonly scene: Phaser.Scene;
  private static skinFilterSet = false;
  private readonly depth: number;

  private runPhase = 0;
  private landMs = 0;
  private squash = 1;
  private wasOnGround = true;
  private wasAlive = true;
  private nodes: VerletNode[] = [];
  private sticks: VerletStick[] = [];
  private landFx: Pt | null = null;
  private footstepFx = false;
  private deathFx = false;
  private lastGroundX: number | null = null;
  private rollSpin = 0;
  /** Smoothed carry/aim angle for less twitchy gun. */
  private holdAim = 0;
  private holdAimInit = false;
  private readonly nameTag: Phaser.GameObjects.Text;

  private static readonly STRIDE_PX = 30;

  constructor(scene: Phaser.Scene, depth = 10) {
    this.scene = scene;
    this.depth = depth;
    this.root = scene.add.container(0, 0).setDepth(depth);
    this.gunGfx = scene.add.graphics();
    this.fallbackGfx = scene.add.graphics();
    this.root.add([this.fallbackGfx, this.gunGfx]);
    this.nameTag = scene.add
      .text(0, 0, '', {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: '11px',
        color: '#e8eefc',
        stroke: '#0b1020',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 2);
  }

  /** @deprecated use root — kept so callers that referenced gfx still compile if any */
  get gfx(): Phaser.GameObjects.Container {
    return this.root;
  }

  consumeLandFx(): Pt | null {
    const fx = this.landFx;
    this.landFx = null;
    return fx;
  }

  consumeFootstep(): boolean {
    const f = this.footstepFx;
    this.footstepFx = false;
    return f;
  }

  consumeDeathFx(): boolean {
    const d = this.deathFx;
    this.deathFx = false;
    return d;
  }

  update(view: StickView, dtMs: number): void {
    this.footstepFx = false;
    this.ensureSkin(view.skin);
    this.updateNameTag(view);

    if (!view.alive) {
      if (this.wasAlive) {
        this.beginRagdoll(view);
        this.deathFx = true;
      }
      this.wasAlive = false;
      this.stepRagdoll(dtMs);
      this.drawRagdoll(view);
      return;
    }

    if (!this.wasAlive) {
      this.nodes = [];
      this.sticks = [];
      this.lastGroundX = null;
      this.holdAimInit = false;
    }
    this.wasAlive = true;

    if (view.onGround && !this.wasOnGround) {
      this.landMs = 200;
      this.squash = 0.7;
      this.landFx = { x: view.x, y: view.y + 16 };
    }
    this.wasOnGround = view.onGround;

    if (this.landMs > 0) this.landMs = Math.max(0, this.landMs - dtMs);
    this.squash += (1 - this.squash) * Math.min(1, dtMs / 140);

    const pose = this.computePose(view, dtMs);
    this.drawPose(pose, view);
  }

  destroy(): void {
    this.nameTag.destroy();
    this.root.destroy(true);
  }

  private updateNameTag(view: StickView): void {
    const label = view.showName ? displayLabel(view.name) : '';
    this.nameTag.setText(label);
    this.nameTag.setVisible(!!label);
    if (!label) return;
    const lift = view.alive ? (view.prone ? 16 : 28) : 22;
    this.nameTag.setPosition(view.x, view.y - lift);
    this.nameTag.setAlpha(view.alive ? 0.92 : 0.45);
    const team = view.team || 0;
    this.nameTag.setColor(team === 1 ? '#93c5fd' : team === 2 ? '#fca5a5' : '#e8eefc');
  }

  private ensureSkin(id: SkinId): void {
    if (this.skin === id && this.parts) return;
    this.parts?.head.destroy();
    this.parts?.torso.destroy();
    this.parts?.gunArm.destroy();
    this.parts?.offArm.destroy();
    this.parts?.lThigh.destroy();
    this.parts?.lShin.destroy();
    this.parts?.rThigh.destroy();
    this.parts?.rShin.destroy();
    this.parts = null;
    this.skin = id;

    const keys = skinPartKeys(id);
    const ok =
      this.scene.textures.exists(keys.head) &&
      this.scene.textures.exists(keys.torso) &&
      this.scene.textures.exists(keys.arm) &&
      this.scene.textures.exists(keys.leg);
    if (!ok) return;

    if (!StickSoldier.skinFilterSet) {
      StickSoldier.skinFilterSet = true;
      for (const sid of SKIN_IDS) {
        for (const k of Object.values(skinPartKeys(sid))) {
          if (this.scene.textures.exists(k)) {
            this.scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
          }
        }
      }
    }

    const mk = (key: string) =>
      this.scene.add.image(0, 0, key).setOrigin(0.5).setVisible(false);

    this.parts = {
      head: mk(keys.head),
      torso: mk(keys.torso),
      gunArm: mk(keys.arm),
      offArm: mk(keys.arm),
      lThigh: mk(keys.leg),
      lShin: mk(keys.leg),
      rThigh: mk(keys.leg),
      rShin: mk(keys.leg),
    };

    // Silhouette under parts, gun on top
    this.root.add(this.parts.lThigh);
    this.root.add(this.parts.lShin);
    this.root.add(this.parts.rThigh);
    this.root.add(this.parts.rShin);
    this.root.add(this.parts.torso);
    this.root.add(this.parts.offArm);
    this.root.add(this.parts.gunArm);
    this.root.add(this.parts.head);
    this.root.sendToBack(this.fallbackGfx);
    this.root.bringToTop(this.gunGfx);
    this.root.setDepth(this.depth);
  }

  /** Carry angle tracks true aim; idle only dips a few degrees. */
  private resolveHoldAim(view: StickView, dtMs: number): number {
    const aimL = len2(view.aimX, view.aimY);
    const raw = ang(view.aimX / aimL, view.aimY / aimL);
    const face = view.aimX >= 0 ? 1 : -1;
    const low = face >= 0 ? 0.48 : Math.PI - 0.48;
    // Idle: ~12% toward low-ready so the barrel still reads as the cursor.
    const target = view.aimReady ? raw : lerpAngle(raw, low, 0.12);
    if (!this.holdAimInit) {
      this.holdAim = target;
      this.holdAimInit = true;
      return this.holdAim;
    }
    const follow = view.aimReady ? 0.82 : 0.5;
    const t = 1 - Math.exp((-follow * dtMs) / 16);
    this.holdAim = lerpAngle(this.holdAim, target, Math.min(1, t));
    return this.holdAim;
  }

  private placeLimb(
    img: Phaser.GameObjects.Image,
    a: Pt,
    b: Pt,
    thick: number,
    local: boolean,
  ): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.max(4, len2(dx, dy));
    img.setVisible(true);
    img.setAlpha(1);
    if (local) {
      img.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2);
    } else {
      img.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    img.setRotation(ang(dx, dy));
    img.setDisplaySize(len + 3, thick);
  }

  private computePose(view: StickView, _dtMs: number): Pose {
    const hold = weaponHold(view.weapon);
    const aimA = this.resolveHoldAim(view, _dtMs);
    const face = view.aimX >= 0 ? 1 : -1;

    const land = this.landMs / 200;
    const stance = view.prone ? 1.4 : view.crouching || view.rolling ? 1 : 0;
    const crouch = land * 7 + stance * 8;
    const hipY = 5 + crouch;
    const shoulderY = -7 + crouch * 0.55 + stance * 2;

    const hip = { x: 0, y: hipY };
    // Slight torso lean into aim
    const shoulder = { x: face * 1.5 + Math.cos(aimA) * 1.2, y: shoulderY + Math.sin(aimA) * 0.8 };
    const head = { x: face * 1 + Math.cos(aimA) * 0.5, y: shoulderY - (stance ? 7 : 10) };

    let gunHand: Pt = { x: 0, y: 0 };
    let offHand: Pt = { x: 0, y: 0 };
    let tuckHands = false;

    let lKnee: Pt;
    let rKnee: Pt;
    let lFoot: Pt;
    let rFoot: Pt;

    const speed = Math.abs(view.vx);
    const moving =
      view.onGround && speed > 25 && this.landMs <= 0 && !view.crouching && !view.prone;

    if (view.rolling || view.cannonball) {
      this.rollSpin += _dtMs * 0.022 * (view.vx >= 0 ? 1 : -1);
      lFoot = { x: -3, y: 10 };
      rFoot = { x: 3, y: 10 };
      lKnee = { x: -2, y: 7 };
      rKnee = { x: 2, y: 7 };
      hip.y = 8;
      shoulder.y = 2;
      head.y = -2;
      tuckHands = true;
      gunHand = { x: shoulder.x + face * 4, y: shoulder.y + 3 };
      offHand = { x: shoulder.x - face * 3, y: shoulder.y + 4 };
    } else if (view.backflip) {
      this.rollSpin += _dtMs * 0.028 * -(view.facing || face);
      lFoot = { x: -4, y: 8 };
      rFoot = { x: 5, y: 12 };
      lKnee = { x: -3, y: 4 };
      rKnee = { x: 4, y: 8 };
      hip.y = 4;
      shoulder.y = -2;
      head.y = -12;
      tuckHands = true;
      gunHand = { x: face * 6, y: 2 };
      offHand = { x: -face * 4, y: 3 };
    } else if (view.prone && view.onGround) {
      this.rollSpin *= 0.55;
      const crawl = speed > 10;
      if (crawl) {
        if (this.lastGroundX === null) this.lastGroundX = view.x;
        this.runPhase += ((view.x - this.lastGroundX) / 22) * Math.PI;
        this.lastGroundX = view.x;
      } else {
        this.lastGroundX = view.x;
        this.runPhase *= 0.9;
      }
      const wiggle = crawl ? Math.sin(this.runPhase) * 2.5 : 0;
      hip.y = 12;
      hip.x = -face * 3;
      shoulder.y = 9.5;
      shoulder.x = face * 7;
      head.x = face * 15;
      head.y = 7.5;
      lFoot = { x: -face * 16 + wiggle, y: 14 };
      rFoot = { x: -face * 8 - wiggle, y: 14 };
      lKnee = { x: -face * 11 + wiggle * 0.4, y: 13 };
      rKnee = { x: -face * 5 - wiggle * 0.4, y: 13 };
    } else if (view.crouching && view.onGround && !moving) {
      this.rollSpin *= 0.65;
      lFoot = { x: -7, y: 14 };
      rFoot = { x: 7, y: 14 };
      lKnee = { x: -6, y: 11 };
      rKnee = { x: 6, y: 11 };
    } else if (view.jetting && !view.onGround) {
      this.lastGroundX = null;
      const trail = face * 0.35;
      lFoot = { x: -6 + trail * 4, y: 18 };
      rFoot = { x: 5 + trail * 4, y: 17 };
      lKnee = { x: -5 + trail * 2, y: 12 };
      rKnee = { x: 4 + trail * 2, y: 11 };
      this.runPhase *= 0.85;
    } else if (!view.onGround) {
      this.lastGroundX = null;
      lFoot = { x: -5, y: 17 };
      rFoot = { x: 6, y: 16 };
      lKnee = { x: -4, y: 11 };
      rKnee = { x: 5, y: 10 };
      this.runPhase *= 0.9;
    } else if (moving) {
      if (this.lastGroundX === null) this.lastGroundX = view.x;
      const dx = view.x - this.lastGroundX;
      this.lastGroundX = view.x;
      const prevPhase = this.runPhase;
      this.runPhase += (dx / StickSoldier.STRIDE_PX) * Math.PI;
      if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.runPhase / Math.PI)) {
        this.footstepFx = true;
      }

      const swing = Math.sin(this.runPhase);
      const lift1 = Math.max(0, swing) * 5;
      const lift2 = Math.max(0, -swing) * 5;
      lFoot = { x: -5 - swing * 7, y: 18 - lift1 };
      rFoot = { x: 5 + swing * 7, y: 18 - lift2 };
      lKnee = { x: lerp(hip.x - 3, lFoot.x, 0.45), y: 11 - lift1 * 0.4 };
      rKnee = { x: lerp(hip.x + 3, rFoot.x, 0.45), y: 11 - lift2 * 0.4 };
      shoulder.x += face * 2.5;
      hip.x += face * 1;
    } else if (this.landMs > 0) {
      this.lastGroundX = view.x;
      lFoot = { x: -8, y: 18 };
      rFoot = { x: 8, y: 18 };
      lKnee = { x: -7, y: 13 };
      rKnee = { x: 7, y: 13 };
      offHand.y += 3;
    } else {
      this.lastGroundX = view.x;
      this.rollSpin *= 0.65;
      lFoot = { x: -5, y: 18 };
      rFoot = { x: 5, y: 18 };
      lKnee = { x: -4, y: 12 };
      rKnee = { x: 4, y: 12 };
      this.runPhase *= 0.9;
    }

    // Hands follow final shoulder + held weapon (Soldat-style two-hand grip)
    if (!tuckHands) {
      const pivot = { x: shoulder.x + face * 2.2, y: shoulder.y + 2.5 };
      gunHand = offset(pivot, aimA, hold.grip);
      offHand = offset(pivot, aimA, hold.fore);
    }

    return {
      hip,
      shoulder,
      head,
      gunHand,
      offHand,
      lKnee,
      rKnee,
      lFoot,
      rFoot,
      squash: this.squash,
    };
  }

  private drawPose(pose: Pose, view: StickView): void {
    this.root.setPosition(view.x, view.y);
    this.root.setAlpha(view.alpha);
    this.root.setRotation(
      view.rolling || view.cannonball || view.backflip
        ? this.rollSpin
        : this.rollSpin * 0.15,
    );
    const sy = view.rolling ? 0.85 : view.prone ? 0.58 : pose.squash;
    const sx = view.rolling ? 0.85 : view.prone ? 1.38 : 1 + (1 - pose.squash) * 0.55;
    this.root.setScale(sx, sy);

    this.gunGfx.clear();
    this.fallbackGfx.clear();
    this.root.sendToBack(this.fallbackGfx);
    this.root.bringToTop(this.gunGfx);

    const face = view.aimX >= 0 ? 1 : -1;
    const parts = this.parts;
    const tuck = view.rolling || view.cannonball || view.backflip;

    if (!parts) {
      this.drawSilhouette(pose, true);
      this.drawFallbackStick(pose, view);
      this.drawHeldWeapon(pose, view, tuck);
      return;
    }

    for (const img of Object.values(parts)) img.setVisible(false);

    this.drawSilhouette(pose, true);

    this.placeLimb(parts.lThigh, pose.hip, pose.lKnee, LIMB_THICK, true);
    this.placeLimb(parts.lShin, pose.lKnee, pose.lFoot, LIMB_THICK - 0.5, true);
    this.placeLimb(parts.rThigh, pose.hip, pose.rKnee, LIMB_THICK, true);
    this.placeLimb(parts.rShin, pose.rKnee, pose.rFoot, LIMB_THICK - 0.5, true);

    const tdX = pose.shoulder.x - pose.hip.x;
    const tdY = pose.shoulder.y - pose.hip.y;
    const tLen = Math.max(10, len2(tdX, tdY) + 4);
    parts.torso.setVisible(true);
    parts.torso.setPosition((pose.hip.x + pose.shoulder.x) / 2, (pose.hip.y + pose.shoulder.y) / 2);
    parts.torso.setRotation(ang(tdX, tdY) - Math.PI / 2);
    parts.torso.setDisplaySize(TORSO_W + 2, tLen + 2);
    parts.torso.setFlipX(face < 0);
    if ((view.vest ?? 0) > 12) parts.torso.setTint(VEST_TINT);
    else parts.torso.clearTint();

    // Arms to grip / foregrip (weapon prop defines hand targets)
    this.placeLimb(parts.offArm, pose.shoulder, pose.offHand, LIMB_THICK - 1, true);
    this.placeLimb(parts.gunArm, pose.shoulder, pose.gunHand, LIMB_THICK - 0.5, true);

    parts.head.setVisible(true);
    parts.head.setPosition(pose.head.x, pose.head.y);
    parts.head.setRotation(0);
    parts.head.setDisplaySize(HEAD_DISPLAY, HEAD_DISPLAY);
    parts.head.setFlipX(face < 0);

    this.drawHeldWeapon(pose, view, tuck);
  }

  private drawSilhouette(pose: Pose, includeHead: boolean): void {
    const g = this.fallbackGfx;
    const w = LIMB_THICK + 3.8;
    strokeSeg(g, pose.hip, pose.shoulder, w + 0.6, SILHOUETTE, 0.96);
    strokeSeg(g, pose.hip, pose.lKnee, w, SILHOUETTE, 0.96);
    strokeSeg(g, pose.lKnee, pose.lFoot, w - 0.4, SILHOUETTE, 0.96);
    strokeSeg(g, pose.hip, pose.rKnee, w, SILHOUETTE, 0.96);
    strokeSeg(g, pose.rKnee, pose.rFoot, w - 0.4, SILHOUETTE, 0.96);
    strokeSeg(g, pose.shoulder, pose.offHand, w - 0.8, SILHOUETTE, 0.96);
    strokeSeg(g, pose.shoulder, pose.gunHand, w - 0.4, SILHOUETTE, 0.96);
    if (includeHead) {
      g.fillStyle(SILHOUETTE, 0.96);
      g.fillCircle(pose.head.x, pose.head.y, HEAD_DISPLAY * 0.5 + 2.2);
    }
  }

  private drawHeldWeapon(pose: Pose, view: StickView, tuck: boolean): void {
    const hold = weaponHold(view.weapon);
    const aimA = this.holdAim;
    const face = view.aimX >= 0 ? 1 : -1;
    const pivot = tuck
      ? { x: pose.hip.x + face * 2, y: pose.hip.y - 2 }
      : { x: pose.shoulder.x + face * 2.2, y: pose.shoulder.y + 2.5 };
    const rot = tuck ? (face >= 0 ? 0.9 : Math.PI - 0.9) : aimA;
    this.paintGun(pivot, rot, hold, gunKind(view.weapon), tuck ? 0.88 : 1);
  }

  /** Crisp vector gun — dark outline, light barrel, bright muzzle pip. */
  private paintGun(
    pivot: Pt,
    rot: number,
    hold: typeof HOLD_RIFLE,
    kind: GunKind,
    alpha: number,
  ): void {
    const g = this.gunGfx;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    let dx = -s;
    let dy = c;
    if (dy < 0) {
      dx = -dx;
      dy = -dy;
    }
    const at = (along: number, down = 0): Pt => ({
      x: pivot.x + c * along + dx * down,
      y: pivot.y + s * along + dy * down,
    });

    const muzzleAlong = hold.len - hold.grip + 3;
    const stockAlong = -hold.grip - 3;
    const barrelW =
      kind === 'shot' || kind === 'launch' ? 4.6 : kind === 'sniper' || kind === 'bow' ? 2.6 : kind === 'pistol' ? 3.0 : 3.4;
    const outlineW = barrelW + 2.4;
    const stock = at(stockAlong);
    const muzzle = at(muzzleAlong);
    const tip = at(muzzleAlong + 6);

    if (kind === 'melee') {
      const blade = at(hold.len + 2);
      const hilt = at(-2);
      strokeSeg(g, hilt, blade, 4.6, SILHOUETTE, alpha);
      strokeSeg(g, hilt, blade, 2.2, 0xe8edf4, alpha);
      g.fillStyle(0xfff4c4, alpha);
      g.fillCircle(blade.x, blade.y, 2.1);
      return;
    }

    if (kind === 'bow') {
      const nockF = at(muzzleAlong + 1, -7);
      const nockB = at(stockAlong - 1, -7);
      const grip = at(0, 1);
      strokeSeg(g, nockB, grip, 3.8, SILHOUETTE, alpha);
      strokeSeg(g, grip, nockF, 3.8, SILHOUETTE, alpha);
      strokeSeg(g, nockB, grip, 2.0, 0xc4a574, alpha);
      strokeSeg(g, grip, nockF, 2.0, 0xc4a574, alpha);
      strokeSeg(g, nockB, nockF, 1.4, SILHOUETTE, alpha);
      strokeSeg(g, nockB, nockF, 0.9, 0xf3efe6, alpha);
      g.fillStyle(0xfff4c4, alpha);
      g.fillCircle(nockF.x, nockF.y, 2.0);
      return;
    }

    // Outline then metal barrel
    strokeSeg(g, stock, muzzle, outlineW, SILHOUETTE, alpha);
    strokeSeg(g, stock, muzzle, barrelW, 0xe4eaf2, alpha);

    // Receiver / handguard block near the grip
    const recA = at(-1, 0);
    const recB = at(kind === 'pistol' ? 5 : 8, 0);
    strokeSeg(g, recA, recB, barrelW + 1.6, 0x4b5568, alpha);

    // Pistol grip / mag hanging toward the feet
    if (kind === 'pistol') {
      strokeSeg(g, at(0, 0), at(-1.5, 6.5), 3.6, SILHOUETTE, alpha);
      strokeSeg(g, at(0, 0), at(-1.5, 6.5), 2.2, 0x5b6573, alpha);
    } else if (kind !== 'launch') {
      strokeSeg(g, at(3, 0.5), at(3, 4.5), 3.2, SILHOUETTE, alpha);
      strokeSeg(g, at(3, 0.5), at(3, 4.5), 2.0, 0x3f4654, alpha);
    }

    if (kind === 'sniper') {
      const sc = at(10, -3.2);
      g.fillStyle(SILHOUETTE, alpha);
      g.fillCircle(sc.x, sc.y, 3.4);
      g.fillStyle(0x9aa7b8, alpha);
      g.fillCircle(sc.x, sc.y, 2.1);
    }

    if (kind === 'shot') {
      strokeSeg(g, at(muzzleAlong - 8, -1.6), at(muzzleAlong, -1.6), 2.2, 0xc5ccd6, alpha);
    }

    // Top-edge shine so the barrel reads as a cylinder
    strokeSeg(g, at(stockAlong + 4, -barrelW * 0.28), at(muzzleAlong - 2, -barrelW * 0.28), 1.15, 0xffffff, alpha * 0.55);

    // Muzzle pip + tick past the barrel — the "where is it pointed" cue
    strokeSeg(g, muzzle, tip, 2.4, SILHOUETTE, alpha);
    strokeSeg(g, muzzle, tip, 1.35, 0xfff4c4, alpha);
    g.fillStyle(SILHOUETTE, alpha);
    g.fillCircle(muzzle.x, muzzle.y, 3.1);
    g.fillStyle(0xfff4c4, alpha);
    g.fillCircle(muzzle.x, muzzle.y, 2.05);
  }

  private drawFallbackStick(pose: Pose, view: StickView): void {
    const g = this.fallbackGfx;
    const c = view.tint || SKINS[view.skin ?? DEFAULT_SKIN].tint;
    const STROKE = 6.8;
    const limb = (a: Pt, b: Pt, w = STROKE) => {
      strokeSeg(g, a, b, w, c, 1);
    };
    limb(pose.hip, pose.shoulder, STROKE + 0.5);
    limb(pose.hip, pose.lKnee);
    limb(pose.lKnee, pose.lFoot);
    limb(pose.hip, pose.rKnee);
    limb(pose.rKnee, pose.rFoot);
    limb(pose.shoulder, pose.offHand, STROKE - 0.5);
    limb(pose.shoulder, pose.gunHand);
    g.fillStyle(c, 1);
    g.fillCircle(pose.head.x, pose.head.y, 7.6);
  }

  private beginRagdoll(view: StickView): void {
    const pose = this.computePose({ ...view, alive: true, jetting: false }, 16);
    const ox = view.x;
    const oy = view.y;
    const world = (p: Pt): VerletNode => ({
      x: ox + p.x,
      y: oy + p.y,
      px: ox + p.x - view.vx * 0.012,
      py: oy + p.y - view.vy * 0.012,
    });

    const pts = [
      world(pose.head),
      world(pose.shoulder),
      world(pose.hip),
      world(pose.gunHand),
      world(pose.offHand),
      world(pose.lKnee),
      world(pose.rKnee),
      world(pose.lFoot),
      world(pose.rFoot),
    ];

    const kick = Math.max(1, Math.hypot(view.vx, view.vy) / 280);
    for (const n of pts) {
      n.px -= view.vx * 0.018 * kick + (Math.random() - 0.5) * 3.5;
      n.py -= view.vy * 0.018 * kick - 2.2 - Math.random() * 3;
    }
    if (view.deathKind === 'head') {
      pts[0]!.px -= (Math.random() - 0.5) * 18;
      pts[0]!.py += 8 + Math.random() * 10;
    } else if (view.deathKind === 'blast') {
      for (const n of pts) {
        n.px -= (Math.random() - 0.5) * 10;
        n.py += 4 + Math.random() * 8;
      }
    }

    this.nodes = pts;
    const link = (a: number, b: number): VerletStick => ({
      a,
      b,
      len: len2(pts[a]!.x - pts[b]!.x, pts[a]!.y - pts[b]!.y),
    });
    this.sticks = [
      link(0, 1),
      link(1, 2),
      link(1, 3),
      link(1, 4),
      link(2, 5),
      link(5, 7),
      link(2, 6),
      link(6, 8),
    ];
    if (view.deathKind === 'head') {
      this.sticks = this.sticks.filter((s) => !(s.a === 0 && s.b === 1));
    }

    this.root.setPosition(0, 0);
    this.root.setScale(1);
    this.root.setRotation(0);
  }

  private stepRagdoll(dtMs: number): void {
    if (this.nodes.length === 0) return;
    const dt = Math.min(0.032, dtMs / 1000);
    const g = 1600;

    for (const n of this.nodes) {
      const vx = n.x - n.px;
      const vy = n.y - n.py;
      n.px = n.x;
      n.py = n.y;
      n.x += vx * 0.985;
      n.y += vy * 0.985 + g * dt * dt;
    }

    for (let i = 0; i < 4; i++) {
      for (const s of this.sticks) {
        const a = this.nodes[s.a]!;
        const b = this.nodes[s.b]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = len2(dx, dy);
        const diff = (d - s.len) / d;
        const ox = dx * diff * 0.5;
        const oy = dy * diff * 0.5;
        a.x += ox;
        a.y += oy;
        b.x -= ox;
        b.y -= oy;
      }
      this.collidePlatforms();
    }
  }

  private collidePlatforms(): void {
    for (const n of this.nodes) {
      for (const plat of PLATFORMS) {
        const left = plat.x - plat.w / 2;
        const right = plat.x + plat.w / 2;
        const top = plat.y - plat.h / 2;
        if (n.x >= left && n.x <= right && n.y > top - 2 && n.y < top + 14) {
          const vy = n.y - n.py;
          if (vy > 0) {
            n.y = top - 1;
            n.py = n.y + vy * -0.25;
            n.px = n.x - (n.x - n.px) * 0.7;
          }
        }
      }
    }
  }

  private drawRagdoll(view: StickView): void {
    this.gunGfx.clear();
    this.fallbackGfx.clear();
    this.root.sendToBack(this.fallbackGfx);
    this.root.bringToTop(this.gunGfx);
    this.root.setAlpha(view.alpha);

    if (this.nodes.length < 9) return;
    const n = this.nodes;
    const parts = this.parts;
    const hold = weaponHold(view.weapon);
    const includeHead = view.deathKind !== 'head';
    const wpt = (i: number): Pt => ({ x: n[i]!.x, y: n[i]!.y });

    const silW = LIMB_THICK + 3.8;
    strokeSeg(this.fallbackGfx, wpt(1), wpt(2), silW + 0.6, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(2), wpt(5), silW, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(5), wpt(7), silW - 0.4, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(2), wpt(6), silW, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(6), wpt(8), silW - 0.4, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(1), wpt(4), silW - 0.8, SILHOUETTE, 0.96);
    strokeSeg(this.fallbackGfx, wpt(1), wpt(3), silW - 0.4, SILHOUETTE, 0.96);
    if (includeHead) {
      strokeSeg(this.fallbackGfx, wpt(0), wpt(1), silW - 1, SILHOUETTE, 0.96);
      this.fallbackGfx.fillStyle(SILHOUETTE, 0.96);
      this.fallbackGfx.fillCircle(n[0]!.x, n[0]!.y, HEAD_DISPLAY * 0.5 + 2.2);
    }

    const gunRot = ang(n[3]!.x - n[1]!.x, n[3]!.y - n[1]!.y);
    const gunPivot = offset(wpt(3), gunRot + Math.PI, hold.grip);
    this.paintGun(gunPivot, gunRot, hold, gunKind(view.weapon), 0.9);

    if (!parts) {
      const c = view.tint;
      const STROKE = 6.8;
      const limb = (ia: number, ib: number, w = STROKE) => {
        strokeSeg(this.fallbackGfx, wpt(ia), wpt(ib), w, c, 1);
      };
      limb(1, 2, STROKE + 0.5);
      limb(2, 5);
      limb(5, 7);
      limb(2, 6);
      limb(6, 8);
      limb(1, 3);
      limb(1, 4, STROKE - 0.5);
      if (includeHead) {
        limb(0, 1, STROKE - 1);
        this.fallbackGfx.fillStyle(c, 1);
        this.fallbackGfx.fillCircle(n[0]!.x, n[0]!.y, 7.6);
      }
      return;
    }

    this.placeLimb(parts.lThigh, wpt(2), wpt(5), LIMB_THICK, false);
    this.placeLimb(parts.lShin, wpt(5), wpt(7), LIMB_THICK - 0.5, false);
    this.placeLimb(parts.rThigh, wpt(2), wpt(6), LIMB_THICK, false);
    this.placeLimb(parts.rShin, wpt(6), wpt(8), LIMB_THICK - 0.5, false);

    const tdX = n[1]!.x - n[2]!.x;
    const tdY = n[1]!.y - n[2]!.y;
    parts.torso.setVisible(true);
    parts.torso.setPosition((n[1]!.x + n[2]!.x) / 2, (n[1]!.y + n[2]!.y) / 2);
    parts.torso.setRotation(ang(tdX, tdY) - Math.PI / 2);
    parts.torso.setDisplaySize(TORSO_W + 2, Math.max(10, len2(tdX, tdY) + 4));

    this.placeLimb(parts.offArm, wpt(1), wpt(4), LIMB_THICK - 1, false);
    this.placeLimb(parts.gunArm, wpt(1), wpt(3), LIMB_THICK - 0.5, false);

    parts.head.setVisible(includeHead);
    parts.head.setPosition(n[0]!.x, n[0]!.y);
    parts.head.setRotation(ang(n[1]!.x - n[0]!.x, n[1]!.y - n[0]!.y) + Math.PI / 2);
    parts.head.setDisplaySize(HEAD_DISPLAY, HEAD_DISPLAY);
  }
}
