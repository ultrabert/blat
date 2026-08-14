import Phaser from 'phaser';
import {
  COLORS,
  MAP_NAME,
  PLAYER,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from '../../shared/constants';
import type { GameState, KillFeedEntry, PlayerState } from '../../shared/schema';
import {
  DEFAULT_WEAPON,
  isFirearm,
  isMelee,
  isWeaponId,
  weaponIconKey,
  WEAPONS,
} from '../../shared/weapons';

function weaponShort(id: string): string {
  if (isWeaponId(id)) return WEAPONS[id].short;
  if (id === 'frag') return 'FRAG';
  if (id === 'cluster') return 'CLS';
  if (id === 'sting') return 'STG';
  if (id === 'fall') return 'FALL';
  return id ? id.slice(0, 4).toUpperCase() : '—';
}

function barColor(frac: number, healthy: number, mid: number, low: number): number {
  if (frac > 0.55) return healthy;
  if (frac > 0.28) return mid;
  return low;
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

/**
 * Soldat-ish combat HUD: bars, gun icon, nades, kill feed, Tab scoreboard.
 */
export class CombatHud {
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly gunIcon: Phaser.GameObjects.Image;
  private readonly gunText: Phaser.GameObjects.Text;
  private readonly nadeText: Phaser.GameObjects.Text;
  private readonly metaText: Phaser.GameObjects.Text;
  private readonly feedText: Phaser.GameObjects.Text;
  private readonly board: Phaser.GameObjects.Container;
  private readonly boardGfx: Phaser.GameObjects.Graphics;
  private readonly boardText: Phaser.GameObjects.Text;
  private lastIcon = '';

  constructor(scene: Phaser.Scene) {
    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(120);
    this.gunIcon = scene.add
      .image(VIEW_WIDTH / 2 - 90, VIEW_HEIGHT - 42, 'icon_rifle')
      .setScrollFactor(0)
      .setDepth(121)
      .setDisplaySize(40, 40)
      .setAlpha(0.95);
    this.gunText = scene.add
      .text(VIEW_WIDTH / 2 - 64, VIEW_HEIGHT - 58, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '15px',
        color: COLORS.hud,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.nadeText = scene.add
      .text(VIEW_WIDTH / 2 - 64, VIEW_HEIGHT - 34, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.metaText = scene.add
      .text(16, 10, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(121);
    this.feedText = scene.add
      .text(VIEW_WIDTH - 16, 12, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '13px',
        color: COLORS.hud,
        align: 'right',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(121);

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
  }

  update(state: GameState, frame: HudFrame): void {
    this.drawBars(frame);
    this.drawGun(frame);
    this.drawFeed(state);
    this.metaText.setText(
      frame.spectating
        ? `DEMO  ${MAP_NAME}`
        : `${MAP_NAME}${frame.roomCode ? `  ${frame.roomCode}` : ''}${
            frame.me && !frame.me.alive ? '  RESPAWNING' : ''
          }`,
    );
    this.drawScoreboard(state, frame);
  }

  private drawBars(frame: HudFrame): void {
    const g = this.bars;
    g.clear();
    const me = frame.me;
    if (frame.spectating || !me) return;

    const x = 18;
    let y = VIEW_HEIGHT - 78;
    this.meter(g, x, y, 168, 12, me.health / PLAYER.maxHealth, 0x4ade80, 0xfacc15, 0xef4444);
    y += 16;
    this.meter(g, x, y, 168, 8, me.vest / PLAYER.maxVest, 0x7dd3fc, 0x38bdf8, 0x0ea5e9, true);
    y += 14;
    this.meter(g, x, y, 168, 8, frame.fuel / PLAYER.maxFuel, 0xfb923c, 0xf97316, 0xea580c);
    if (frame.cooking) {
      y += 14;
      this.meter(g, x, y, 168, 6, frame.cookFrac, 0xfbbf24, 0xf97316, 0xef4444);
    }
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
    g.fillStyle(0x0b1020, 0.72);
    g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 3);
    g.fillStyle(0x1e293b, 1);
    g.fillRect(x, y, w, h);
    if (f <= 0 && allowEmpty) return;
    g.fillStyle(barColor(f, healthy, mid, low), 0.95);
    g.fillRect(x, y, Math.max(f > 0 ? 2 : 0, w * f), h);
  }

  private drawGun(frame: HudFrame): void {
    const me = frame.me;
    if (frame.spectating || !me) {
      this.gunIcon.setVisible(false);
      this.gunText.setText(frame.spectating ? 'watching' : '');
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
    const mag =
      isMelee(weaponId) || !isFirearm(weaponId)
        ? '∞'
        : `${me.ammo} / ${weapon.magSize}   +${me.reserve}`;
    const rel = me.reloading ? '  REL' : '';
    this.gunText.setText(`${weapon.name}   ${mag}${rel}`);
    const nade = (me.nadeType || 'frag').toUpperCase();
    this.nadeText.setText(
      `F ${me.frags}   C ${me.clusters}   S ${me.stings}   [${nade}]   K ${me.kills}`,
    );
  }

  private drawFeed(state: GameState): void {
    const rows: string[] = [];
    state.killFeed?.forEach((row: KillFeedEntry) => {
      const w = weaponShort(row.weapon);
      const hs = row.headshot ? ' HS' : '';
      if (!row.killer) {
        rows.push(`${row.victim}  [${w}]`);
        return;
      }
      rows.push(`${row.killer}  [${w}${hs}]  ${row.victim}`);
    });
    this.feedText.setText(rows.slice(0, 8).join('\n'));
  }

  private drawScoreboard(state: GameState, frame: HudFrame): void {
    this.board.setVisible(frame.scoreboard);
    if (!frame.scoreboard) return;
    const players: PlayerState[] = [];
    state.players?.forEach((p) => players.push(p));
    players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const lines = [
      `  ${MAP_NAME}                         TAB`,
      '  NAME              K   D   PING',
      ...players.map((p) => {
        const name = (p.isBot ? `BOT ${p.name}` : p.name).slice(0, 16).padEnd(16);
        const k = String(p.kills).padStart(3);
        const d = String(p.deaths).padStart(3);
        const ping = p.isBot ? '  —' : String(p.ping || 0).padStart(4);
        const mark = p.alive ? ' ' : '*';
        return `${mark} ${name} ${k} ${d}  ${ping}`;
      }),
    ];
    const text = lines.join('\n');
    this.boardText.setText(text);
    this.boardText.setPosition(-210, -110);
    const g = this.boardGfx;
    g.clear();
    g.fillStyle(0x0b1020, 0.86);
    g.fillRoundedRect(-230, -130, 460, 36 + players.length * 22 + 48, 8);
    g.lineStyle(1, 0x7a8fb3, 0.45);
    g.strokeRoundedRect(-230, -130, 460, 36 + players.length * 22 + 48, 8);
  }
}
