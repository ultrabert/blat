/**
 * @mechanic match-modes
 * @mechanic realistic-mode
 * @mechanic blat-pulse
 * @mechanic wind-weather
 */
import { GAME_WIDTH, SPAWNS } from './constants.js';

export type MatchMode = 'dm' | 'tdm' | 'ctf' | 'point' | 'infil';

export const MATCH_MODES: MatchMode[] = ['dm', 'tdm', 'ctf', 'point', 'infil'];

export const MODE_LABEL: Record<MatchMode, string> = {
  dm: 'Deathmatch',
  tdm: 'Team DM',
  ctf: 'Capture the Flag',
  point: 'Pointmatch',
  infil: 'Infiltration',
};

export const TEAM = { none: 0, alpha: 1, bravo: 2 } as const;
export type TeamId = 0 | 1 | 2;

export const TEAM_NAME = { 0: 'FFA', 1: 'Alpha', 2: 'Bravo' } as const;

export const MATCH = {
  dmLimit: 20,
  tdmLimit: 40,
  ctfLimit: 5,
  pointLimit: 80,
  infilLimit: 5,
  roundMs: 6 * 60 * 1000,
  realisticDamage: 1.65,
  blatRadius: 88,
  blatForce: 420,
  blatSelf: 240,
  blatCooldownMs: 4200,
  windMax: 110,
  windShiftMs: 11000,
  flagReturnMs: 8000,
  pointRadius: 72,
  pointScorePerSec: 4,
  infilRadius: 58,
  infilHoldMs: 1600,
  captureRadius: 40,
  chatMax: 80,
  chatKeep: 10,
  chatCooldownMs: 450,
} as const;

export const OBJECTIVES = {
  flagAlpha: { x: 180, y: 280 },
  flagBravo: { x: 2380, y: 280 },
  point: { x: 1280, y: 740 },
  infil: { x: 200, y: 210 },
} as const;

export const TAUNTS = ["Let's go!", 'Medic!', 'Follow me!', 'Nice shot!'] as const;

export const WEATHER = { clear: 0, rain: 1, dust: 2 } as const;

export function parseMode(raw: string | undefined): MatchMode {
  const v = (raw || 'dm').toLowerCase();
  return MATCH_MODES.includes(v as MatchMode) ? (v as MatchMode) : 'dm';
}

export function isTeamMode(mode: MatchMode): boolean {
  return mode === 'tdm' || mode === 'ctf' || mode === 'infil';
}

export function scoreLimit(mode: MatchMode): number {
  if (mode === 'tdm') return MATCH.tdmLimit;
  if (mode === 'ctf') return MATCH.ctfLimit;
  if (mode === 'point') return MATCH.pointLimit;
  if (mode === 'infil') return MATCH.infilLimit;
  return MATCH.dmLimit;
}

export function spawnPoolForTeam(team: TeamId): { x: number; y: number }[] {
  if (team === TEAM.alpha) return SPAWNS.filter((s) => s.x < GAME_WIDTH * 0.5);
  if (team === TEAM.bravo) return SPAWNS.filter((s) => s.x >= GAME_WIDTH * 0.5);
  return SPAWNS;
}

export function sameTeam(a: number, b: number, mode: MatchMode): boolean {
  return isTeamMode(mode) && a > 0 && a === b;
}

export function inRadius(
  x: number,
  y: number,
  ox: number,
  oy: number,
  r: number,
): boolean {
  return Math.hypot(x - ox, y - oy) <= r;
}

export function blatImpulse(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  force: number,
): { vx: number; vy: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const falloff = 1 - Math.min(1, d / MATCH.blatRadius);
  return { vx: (dx / d) * force * falloff, vy: (dy / d) * force * falloff - 80 * falloff };
}

export function sanitizeChat(raw: string): string {
  return raw.replace(/[\u0000-\u001f]/g, '').trim().slice(0, MATCH.chatMax);
}

export function pickWind(prev = 0): number {
  const next = (Math.random() * 2 - 1) * MATCH.windMax;
  return prev * 0.25 + next * 0.75;
}
