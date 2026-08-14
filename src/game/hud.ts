import Phaser from 'phaser';
import {
  COLORS,
  MAP_NAME,
  PLAYER,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from '../../shared/constants';
import { isTeamMode, MATCH, MODE_LABEL, parseMode, TEAM_NAME } from '../../shared/match';
import { BONUS_LABEL, isBonusId, medalTier } from '../../shared/bonuses';
import type { GameState, KillFeedEntry, PlayerState } from '../../shared/schema';
import {
  DEFAULT_WEAPON,
  isFirearm,
  isMelee,
  isWeaponId,
  weaponIconKey,
  WEAPONS,
} from '../../shared/weapons';
import { displayLabel } from '../../shared/labels';
import { sound } from './audio/SoundBus';

/** Schema strings can arrive unset; never paint the word "undefined". */
function txt(v: unknown, fallback = ''): string {
  return displayLabel(v, fallback);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function weaponShort(id: unknown): string {
  if (isWeaponId(id)) return WEAPONS[id].short;
  if (id === 'frag') return 'FRAG';
  if (id === 'cluster') return 'CLS';
  if (id === 'sting') return 'STG';
  if (id === 'fall') return 'FALL';
  if (id === 'blat') return 'PULSE';
  const s = txt(id);
  return s ? s.slice(0, 4).toUpperCase() : '—';
}

function barColor(frac: number, healthy: number, mid: number, low: number): number {
  if (frac > 0.55) return healthy;
  if (frac > 0.28) return mid;
  return low;
}

function medalColor(tier: number): { fill: string; stroke: string; gfx: number } {
  if (tier >= 8) return { fill: '#fff7ed', stroke: '#7c3aed', gfx: 0xf0abfc };
  if (tier >= 5) return { fill: '#fce7f3', stroke: '#db2777', gfx: 0xf472b6 };
  if (tier >= 4) return { fill: '#fecaca', stroke: '#b91c1c', gfx: 0xf87171 };
  if (tier >= 3) return { fill: '#ffedd5', stroke: '#c2410c', gfx: 0xfb923c };
  if (tier >= 2) return { fill: '#fef3c7', stroke: '#b45309', gfx: 0xfbbf24 };
  return { fill: '#fee2e2', stroke: '#991b1b', gfx: 0xfca5a5 };
}

export type HudFrame = {
  me?: PlayerState;
  fuel: number;
  cooking: boolean;
  cookFrac: number;
  spectating: boolean;
  scoreboard: boolean;
  roomCode: string;
  nowMs: number;
};

type FeedSlot = {
  text: Phaser.GameObjects.Text;
};

/**
 * @mechanic combat-hud
 * @mechanic kill-feed
 * @mechanic kill-sprees
 */
export class CombatHud {
  private readonly scene: Phaser.Scene;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly barLabels: Phaser.GameObjects.Text;
  private readonly gunPlate: Phaser.GameObjects.Graphics;
  private readonly gunIcon: Phaser.GameObjects.Image;
  private readonly gunName: Phaser.GameObjects.Text;
  private readonly gunAmmo: Phaser.GameObjects.Text;
  private readonly nadeText: Phaser.GameObjects.Text;
  private readonly clockText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly chipText: Phaser.GameObjects.Text;
  private readonly feedGfx: Phaser.GameObjects.Graphics;
  private readonly feedSlots: FeedSlot[] = [];
  private readonly board: Phaser.GameObjects.Container;
  private readonly boardGfx: Phaser.GameObjects.Graphics;
  private readonly boardText: Phaser.GameObjects.Text;
  private readonly medalGfx: Phaser.GameObjects.Graphics;
  private readonly medalTitle: Phaser.GameObjects.Text;
  private readonly medalSub: Phaser.GameObjects.Text;
  private readonly medalBy: Phaser.GameObjects.Text;
  private lastIcon = '';
  private seenChat = new Set<string>();
  private seenFeed = new Set<string>();
  private bootstrapped = false;
  private medalUntil = 0;
  private medalTier = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(120);
    this.barLabels = scene.add
      .text(24, VIEW_HEIGHT - 92, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '10px',
        color: COLORS.muted,
        lineSpacing: 6,
      })
      .setScrollFactor(0)
      .setDepth(122);
    this.gunPlate = scene.add.graphics().setScrollFactor(0).setDepth(120);
    this.gunIcon = scene.add
      .image(VIEW_WIDTH / 2 - 78, VIEW_HEIGHT - 46, 'icon_rifle')
      .setScrollFactor(0)
      .setDepth(121)
      .setDisplaySize(36, 36)
      .setAlpha(0.95);
    this.gunName = scene.add
      .text(VIEW_WIDTH / 2 - 52, VIEW_HEIGHT - 64, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '11px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.gunAmmo = scene.add
      .text(VIEW_WIDTH / 2 - 52, VIEW_HEIGHT - 50, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '22px',
        color: COLORS.hud,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.nadeText = scene.add
      .text(VIEW_WIDTH / 2 - 52, VIEW_HEIGHT - 24, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '11px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.clockText = scene.add
      .text(VIEW_WIDTH / 2, 14, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '16px',
        color: COLORS.hud,
        stroke: '#0b1020',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(121);
    this.scoreText = scene.add
      .text(VIEW_WIDTH / 2, 36, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '13px',
        color: COLORS.muted,
        stroke: '#0b1020',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(121);
    this.chipText = scene.add
      .text(16, 12, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '11px',
        color: COLORS.muted,
        stroke: '#0b1020',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.feedGfx = scene.add.graphics().setScrollFactor(0).setDepth(120);
    for (let i = 0; i < 7; i++) {
      this.feedSlots.push({
        text: scene.add
          .text(VIEW_WIDTH - 22, 14 + i * 20, '', {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '13px',
            color: COLORS.hud,
            align: 'right',
            stroke: '#0b1020',
            strokeThickness: 3,
          })
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(121),
      });
    }

    this.boardGfx = scene.add.graphics();
    this.boardText = scene.add.text(0, 0, '', {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '15px',
      color: COLORS.hud,
    });
    this.board = scene.add
      .container(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 20, [this.boardGfx, this.boardText])
      .setScrollFactor(0)
      .setDepth(130)
      .setVisible(false);

    this.medalGfx = scene.add.graphics().setScrollFactor(0).setDepth(140);
    this.medalTitle = scene.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT * 0.28, '', {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: '42px',
        color: '#fef3c7',
        stroke: '#7c2d12',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(141)
      .setAlpha(0);
    this.medalSub = scene.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT * 0.28 + 38, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '16px',
        color: '#fecaca',
        stroke: '#0b1020',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(141)
      .setAlpha(0);
    this.medalBy = scene.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT * 0.28 + 58, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        color: COLORS.muted,
        stroke: '#0b1020',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(141)
      .setAlpha(0);
  }

  update(state: GameState, frame: HudFrame): void {
    this.drawBars(frame);
    this.drawGun(frame);
    this.drawMatch(state, frame);
    this.drawFeed(state);
    this.tickMedals(state, frame);
    this.drawScoreboard(state, frame);
  }

  private drawMatch(state: GameState, frame: HudFrame): void {
    const mode = parseMode(state.mode);
    const remain = state.roundEndsAt
      ? Math.max(0, Math.ceil((state.roundEndsAt - (state.now || 0)) / 1000))
      : 0;
    const mm = Math.floor(remain / 60);
    const ss = String(remain % 60).padStart(2, '0');
    const urgent = remain > 0 && remain <= 30;
    this.clockText.setColor(urgent ? '#fca5a5' : COLORS.hud);
    this.clockText.setText(`${mm}:${ss}`);

    const scores = isTeamMode(mode)
      ? `${TEAM_NAME[1]}  ${state.alphaScore}    ${TEAM_NAME[2]}  ${state.bravoScore}`
      : frame.me
        ? `${MODE_LABEL[mode]}   ${frame.me.score}`
        : MODE_LABEL[mode];
    this.scoreText.setText(scores);

    const chips = [
      frame.spectating ? 'DEMO' : MAP_NAME,
      state.realistic ? 'REAL' : '',
      frame.me && isBonusId(frame.me.bonus) ? BONUS_LABEL[frame.me.bonus] : '',
      Math.round(state.windVx || 0)
        ? `WIND ${state.windVx > 0 ? '+' : ''}${Math.round(state.windVx)}`
        : '',
      txt(state.winner) ? `WIN ${txt(state.winner)}` : '',
      frame.me && !frame.me.alive ? 'RESPAWNING' : '',
      !frame.spectating && txt(frame.roomCode) ? txt(frame.roomCode) : '',
    ].filter(Boolean);
    this.chipText.setText(chips.join('  ·  '));
    this.chipText.setColor(
      frame.me && !frame.me.alive ? '#fca5a5' : frame.me && isBonusId(frame.me.bonus) ? '#fde68a' : COLORS.muted,
    );
  }

  private drawBars(frame: HudFrame): void {
    const g = this.bars;
    g.clear();
    const me = frame.me;
    if (frame.spectating || !me) {
      this.barLabels.setText('');
      return;
    }

    const x = 18;
    const y0 = VIEW_HEIGHT - 118;
    const w = 176;
    g.fillStyle(0x0b1020, 0.78);
    g.fillRoundedRect(x - 8, y0 - 10, w + 52, frame.cooking ? 108 : 96, 8);
    g.lineStyle(1, 0x7a8fb3, 0.28);
    g.strokeRoundedRect(x - 8, y0 - 10, w + 52, frame.cooking ? 108 : 96, 8);

    const rows: { label: string; frac: number; h: number; a: number; b: number; c: number; val?: string }[] = [
      {
        label: 'HP',
        frac: me.health / PLAYER.maxHealth,
        h: 11,
        a: 0x4ade80,
        b: 0xfacc15,
        c: 0xef4444,
        val: String(Math.round(me.health)),
      },
      {
        label: 'ARM',
        frac: me.vest / PLAYER.maxVest,
        h: 7,
        a: 0x7dd3fc,
        b: 0x38bdf8,
        c: 0x0ea5e9,
        val: me.vest > 0 ? String(Math.round(me.vest)) : '',
      },
      {
        label: 'JET',
        frac: frame.fuel / PLAYER.maxFuel,
        h: 7,
        a: 0xfb923c,
        b: 0xf97316,
        c: 0xea580c,
      },
      {
        label: 'E',
        frac: 1 - Math.min(1, (me.blatCd || 0) / MATCH.blatCooldownMs),
        h: 5,
        a: 0xc4b5fd,
        b: 0xa78bfa,
        c: 0x7c3aed,
      },
      {
        label: 'SH',
        frac: 1 - Math.min(1, (me.dashCd || 0) / PLAYER.dashCooldownMs),
        h: 4,
        a: 0x67e8f9,
        b: 0x22d3ee,
        c: 0x0891b2,
      },
    ];
    if (frame.cooking) {
      rows.push({
        label: 'CK',
        frac: frame.cookFrac,
        h: 5,
        a: 0xfbbf24,
        b: 0xf97316,
        c: 0xef4444,
      });
    }

    const labelBits: string[] = [];
    let y = y0;
    for (const row of rows) {
      this.meter(g, x + 28, y, w - 8, row.h, row.frac, row.a, row.b, row.c, row.label === 'ARM');
      labelBits.push(row.val ? `${row.label} ${row.val}` : row.label);
      y += row.h + 7;
    }
    this.barLabels.setPosition(x - 2, y0 - 1);
    this.barLabels.setText(labelBits.join('\n'));
  }

  private meter(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    frac: number,
    healthy: number,
    mid: number,
    low: number,
    allowEmpty = false,
  ): void {
    const f = Math.max(0, Math.min(1, frac));
    g.fillStyle(0x1e293b, 1);
    g.fillRoundedRect(x, y, w, h, 2);
    if (f <= 0 && allowEmpty) return;
    g.fillStyle(barColor(f, healthy, mid, low), 0.95);
    const fw = Math.max(f > 0 ? 3 : 0, w * f);
    g.fillRoundedRect(x, y, fw, h, 2);
    if (fw > 8) {
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(x + 1, y + 1, fw - 2, Math.max(1, h * 0.35));
    }
  }

  private drawGun(frame: HudFrame): void {
    const g = this.gunPlate;
    g.clear();
    const me = frame.me;
    if (frame.spectating || !me) {
      this.gunIcon.setVisible(false);
      this.gunName.setText(frame.spectating ? 'watching' : '');
      this.gunAmmo.setText('');
      this.nadeText.setText('');
      return;
    }
    const weaponId = isWeaponId(me.weapon) ? me.weapon : DEFAULT_WEAPON;
    const weapon = WEAPONS[weaponId];
    const icon = weaponIconKey(weaponId);
    if (icon !== this.lastIcon && this.gunIcon.texture.key) {
      if (this.gunIcon.scene.textures.exists(icon)) this.gunIcon.setTexture(icon);
      this.lastIcon = icon;
    }
    this.gunIcon.setVisible(true);

    const cx = VIEW_WIDTH / 2;
    const plateW = 268;
    const plateH = 70;
    const px = cx - plateW / 2;
    const py = VIEW_HEIGHT - 82;
    g.fillStyle(0x0b1020, 0.8);
    g.fillRoundedRect(px, py, plateW, plateH, 8);
    g.lineStyle(1, 0x7a8fb3, 0.32);
    g.strokeRoundedRect(px, py, plateW, plateH, 8);
    g.fillStyle(0x1e293b, 0.9);
    g.fillRoundedRect(px + 10, py + 14, 42, 42, 6);

    const mag =
      isMelee(weaponId) || !isFirearm(weaponId)
        ? '∞'
        : `${num(me.ammo)} / ${weapon.magSize}`;
    this.gunName.setText(me.reloading ? `${weapon.name}  ·  RELOAD` : weapon.name);
    this.gunName.setColor(me.reloading ? '#fbbf24' : COLORS.muted);
    this.gunAmmo.setText(mag);
    this.gunAmmo.setColor(me.reloading ? '#fde68a' : num(me.ammo) === 0 && isFirearm(weaponId) ? '#f87171' : COLORS.hud);

    const nade = txt(me.nadeType, 'frag').toUpperCase();
    const pulse = (me.blatCd || 0) > 0 ? '' : '  E•';
    this.nadeText.setText(
      `F ${num(me.frags)}   C ${num(me.clusters)}   S ${num(me.stings)}   ${nade}${pulse}`,
    );
  }

  private drawFeed(state: GameState): void {
    const g = this.feedGfx;
    g.clear();
    const rows: KillFeedEntry[] = [];
    state.killFeed?.forEach((row: KillFeedEntry) => rows.push(row));
    const vis = rows.slice(0, this.feedSlots.length);
    if (vis.length) {
      const h = 10 + vis.length * 20;
      g.fillStyle(0x0b1020, 0.55);
      g.fillRoundedRect(VIEW_WIDTH - 268, 8, 256, h, 6);
    }
    for (let i = 0; i < this.feedSlots.length; i++) {
      const slot = this.feedSlots[i]!;
      const row = vis[i];
      if (!row) {
        slot.text.setText('');
        continue;
      }
      const w = weaponShort(row.weapon);
      const killer = txt(row.killer);
      const victim = txt(row.victim, 'Soldier');
      const hs = row.headshot ? '  HS' : '';
      const line = killer ? `${killer}  [${w}]${hs}  ${victim}` : `${victim}  [${w}]`;
      slot.text.setText(line);
      slot.text.setColor(row.headshot ? '#fde68a' : i === 0 ? COLORS.hud : COLORS.muted);
      slot.text.setAlpha(1 - i * 0.08);
    }
  }

  private tickMedals(state: GameState, frame: HudFrame): void {
    const meName = txt(frame.me?.name);
    const incoming: { title: string; sub: string; tier: number; mine: boolean; by: string }[] = [];

    state.chat?.forEach((c) => {
      const kind = txt(c.kind, 'chat');
      if (kind !== 'medal' && kind !== 'spree') return;
      const sig = `c:${num(c.at)}:${txt(c.name)}:${txt(c.text)}:${kind}`;
      if (this.seenChat.has(sig)) return;
      this.seenChat.add(sig);
      if (!this.bootstrapped) return;
      const title = txt(c.text);
      const by = txt(c.name);
      incoming.push({
        title,
        sub: '',
        tier: medalTier(title),
        mine: !!meName && by === meName,
        by,
      });
    });

    state.killFeed?.forEach((row: KillFeedEntry) => {
      const sig = `f:${num(row.at)}:${txt(row.killer)}:${txt(row.victim)}:${txt(row.weapon)}:${row.headshot ? 1 : 0}`;
      if (this.seenFeed.has(sig)) return;
      this.seenFeed.add(sig);
      if (!this.bootstrapped) return;
      if (!row.headshot) return;
      const by = txt(row.killer);
      const mine = !!meName && by === meName;
      if (!mine) return;
      incoming.push({
        title: 'HEADSHOT',
        sub: '',
        tier: 1,
        mine,
        by,
      });
    });

    if (!this.bootstrapped) {
      this.bootstrapped = true;
    } else if (incoming.length) {
      incoming.sort((a, b) => b.tier - a.tier || (a.mine === b.mine ? 0 : a.mine ? -1 : 1));
      const best = incoming[0]!;
      const hs = incoming.find((m) => m.title === 'HEADSHOT');
      const sub =
        best.title !== 'HEADSHOT' && hs
          ? 'HEADSHOT'
          : incoming.length > 1 && incoming[1]!.title !== best.title
            ? incoming[1]!.title
            : '';
      this.showMedal(best.title, sub, best.tier, best.mine, best.by, frame);
    }

    if (this.seenChat.size > 40) {
      const keep = [...this.seenChat].slice(-24);
      this.seenChat = new Set(keep);
    }
    if (this.seenFeed.size > 40) {
      const keep = [...this.seenFeed].slice(-24);
      this.seenFeed = new Set(keep);
    }

    this.paintMedal(frame.nowMs);
  }

  private showMedal(
    title: string,
    sub: string,
    tier: number,
    mine: boolean,
    by: string,
    frame: HudFrame,
  ): void {
    const bigger = tier >= this.medalTier || frame.nowMs >= this.medalUntil;
    if (!bigger && this.medalUntil > frame.nowMs) return;
    this.medalTier = tier;
    const hold = 900 + Math.min(8, tier) * 220;
    this.medalUntil = frame.nowMs + hold;
    const pal = medalColor(tier);
    const size = tier >= 5 ? 56 : tier >= 4 ? 50 : tier >= 3 ? 44 : tier >= 2 ? 36 : 28;
    this.medalTitle.setText(title);
    this.medalTitle.setFontSize(mine ? size : Math.max(22, size - 10));
    this.medalTitle.setColor(pal.fill);
    this.medalTitle.setStroke(pal.stroke, tier >= 3 ? 8 : 6);
    this.medalSub.setText(sub);
    this.medalBy.setText(mine || !by ? '' : by);
    this.scene.tweens.killTweensOf([this.medalTitle, this.medalSub, this.medalBy]);
    const punch = 1.18 + Math.min(tier, 6) * 0.06;
    this.medalTitle.setScale(punch);
    this.medalTitle.setAlpha(1);
    this.medalSub.setAlpha(sub ? 1 : 0);
    this.medalBy.setAlpha(mine || !by ? 0 : 0.9);
    this.scene.tweens.add({
      targets: this.medalTitle,
      scale: 1,
      duration: 140 + tier * 20,
      ease: 'Cubic.Out',
    });
    sound.medal(tier, mine);
  }

  private paintMedal(nowMs: number): void {
    const g = this.medalGfx;
    g.clear();
    if (!this.medalUntil || nowMs > this.medalUntil + 280) {
      this.medalTitle.setAlpha(0);
      this.medalSub.setAlpha(0);
      this.medalBy.setAlpha(0);
      this.medalTier = 0;
      return;
    }
    const fade =
      nowMs < this.medalUntil ? 1 : Math.max(0, 1 - (nowMs - this.medalUntil) / 280);
    this.medalTitle.setAlpha(fade);
    if (this.medalSub.text) this.medalSub.setAlpha(fade);
    if (this.medalBy.text) this.medalBy.setAlpha(fade * 0.85);
    const pal = medalColor(this.medalTier);
    const w = Math.min(420, 120 + this.medalTitle.text.length * 18);
    const y = VIEW_HEIGHT * 0.28;
    g.fillStyle(pal.gfx, 0.1 * fade);
    g.fillRoundedRect(VIEW_WIDTH / 2 - w / 2, y - 28, w, this.medalSub.text ? 78 : 56, 10);
    g.lineStyle(2, pal.gfx, 0.45 * fade);
    g.strokeRoundedRect(VIEW_WIDTH / 2 - w / 2, y - 28, w, this.medalSub.text ? 78 : 56, 10);
  }

  private drawScoreboard(state: GameState, frame: HudFrame): void {
    this.board.setVisible(frame.scoreboard);
    if (!frame.scoreboard) return;
    const players: PlayerState[] = [];
    state.players?.forEach((p) => players.push(p));
    const mode = parseMode(state.mode);
    players.sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
    const header = isTeamMode(mode)
      ? `  ${MODE_LABEL[mode]}   A ${state.alphaScore}  B ${state.bravoScore}`
      : `  ${MODE_LABEL[mode]}`;
    const lines = [
      `${header}                    TAB`,
      '  NAME              T    S   K   D  PING',
      ...players.map((p) => {
        const raw = txt(p.name, p.isBot ? 'Bot' : 'Soldier');
        const name = (p.isBot ? `BOT ${raw}` : raw).slice(0, 16).padEnd(16);
        const team = isTeamMode(mode)
          ? TEAM_NAME[(p.team === 1 || p.team === 2 ? p.team : 0) as 0 | 1 | 2].slice(0, 1).padStart(2)
          : ' -';
        const s = String(p.score).padStart(3);
        const k = String(p.kills).padStart(3);
        const d = String(p.deaths).padStart(3);
        const ping = p.isBot ? '  —' : String(p.ping || 0).padStart(4);
        const mark = p.alive ? ' ' : '*';
        return `${mark} ${name} ${team} ${s} ${k} ${d} ${ping}`;
      }),
    ];
    const text = lines.join('\n');
    this.boardText.setText(text);
    this.boardText.setPosition(-210, -110);
    const g = this.boardGfx;
    g.clear();
    g.fillStyle(0x0b1020, 0.9);
    g.fillRoundedRect(-230, -130, 460, 36 + players.length * 22 + 48, 8);
    g.lineStyle(1, 0x7a8fb3, 0.5);
    g.strokeRoundedRect(-230, -130, 460, 36 + players.length * 22 + 48, 8);
    g.lineStyle(1, 0xfbbf24, 0.25);
    g.lineBetween(-214, -88, 214, -88);
  }
}
