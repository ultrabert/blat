/**
 * @mechanic match-modes
 * @mechanic realistic-mode
 * @mechanic blat-pulse
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GRAVITY, PLAYER } from './constants.js';
import {
  blatImpulse,
  inRadius,
  isTeamMode,
  MATCH,
  OBJECTIVES,
  parseMode,
  sameTeam,
  sanitizeChat,
  scoreLimit,
  spawnPoolForTeam,
  TEAM,
} from './match.js';
import { stepMovement, type MoveBody, type MoveInput } from './physics.js';

function body(partial: Partial<MoveBody> = {}): MoveBody {
  return {
    x: 640,
    y: 400,
    vx: 0,
    vy: 0,
    fuel: PLAYER.maxFuel,
    facing: 1,
    aimX: 1,
    aimY: 0,
    jetting: false,
    alive: true,
    onGround: false,
    crouching: false,
    rollMs: 0,
    rollCdMs: 0,
    rollDir: 0,
    holdCrouch: false,
    holdJet: false,
    recoil: 0,
    landGraceMs: 0,
    cannonballMs: 0,
    backflipMs: 0,
    prone: false,
    proneHoldMs: 0,
    ...partial,
  };
}

function input(partial: Partial<MoveInput> = {}): MoveInput {
  return { move: 0, jet: false, crouch: false, aimX: 1, aimY: 0, ...partial };
}

describe('match-modes', () => {
  it('parses-and-labels-soldat-modes', () => {
    assert.equal(parseMode('CTF'), 'ctf');
    assert.equal(parseMode('nope'), 'dm');
    assert.equal(isTeamMode('tdm'), true);
    assert.equal(isTeamMode('dm'), false);
    assert.equal(isTeamMode('point'), false);
    assert.ok(scoreLimit('ctf') < scoreLimit('tdm'));
  });

  it('team-spawns-stay-on-their-side', () => {
    for (const s of spawnPoolForTeam(TEAM.alpha)) assert.ok(s.x < 1280);
    for (const s of spawnPoolForTeam(TEAM.bravo)) assert.ok(s.x >= 1280);
    assert.equal(sameTeam(1, 1, 'tdm'), true);
    assert.equal(sameTeam(1, 2, 'tdm'), false);
    assert.equal(sameTeam(1, 1, 'dm'), false);
  });

  it('objectives-sit-on-ridge', () => {
    assert.ok(inRadius(OBJECTIVES.flagAlpha.x, OBJECTIVES.flagAlpha.y, 180, 280, 1));
    assert.ok(inRadius(OBJECTIVES.point.x, OBJECTIVES.point.y, 1280, 740, 1));
    assert.ok(OBJECTIVES.infil.x < 400);
  });
});

describe('realistic-mode', () => {
  it('realistic-air-jet-does-not-climb', () => {
    const arcade = body({ y: 400, fuel: 100, realistic: false });
    const real = body({ y: 400, fuel: 100, realistic: true });
    for (let i = 0; i < 20; i++) {
      stepMovement(arcade, input({ jet: true }), 1 / 30);
      stepMovement(real, input({ jet: true }), 1 / 30);
    }
    assert.ok(arcade.y < 360, `arcade should climb, y=${arcade.y}`);
    assert.ok(real.y > arcade.y + 20, `realistic should fall, y=${real.y}`);
    assert.equal(real.jetting, false);
  });

  it('realistic-still-jumps-from-ground', () => {
    const b = body({ onGround: true, y: 800, realistic: true, vy: 0 });
    stepMovement(b, input({ jet: true }), 1 / 30);
    assert.ok(b.vy < 0, `jump vy=${b.vy}`);
    assert.equal(b.onGround, false);
  });

  it('realistic-damage-is-hotter', () => {
    assert.ok(MATCH.realisticDamage > 1.4);
  });
});

describe('blat-pulse', () => {
  it('blat-pushes-away-and-lifts', () => {
    const i = blatImpulse(0, 0, 40, 0, MATCH.blatForce);
    assert.ok(i.vx > 80);
    assert.ok(i.vy < 0);
  });
});

describe('wind-weather', () => {
  it('wind-drifts-airborne-bodies', () => {
    const still = body({ onGround: false, vx: 0, windVx: 0 });
    const blown = body({ onGround: false, vx: 0, windVx: 90 });
    still.vy = GRAVITY * 0; // keep comparable
    blown.vy = 0;
    stepMovement(still, input(), 1 / 30);
    stepMovement(blown, input(), 1 / 30);
    assert.ok(blown.vx > still.vx + 1, `wind vx ${blown.vx} vs ${still.vx}`);
  });

  it('chat-is-sanitized', () => {
    assert.equal(sanitizeChat('  hi\nthere  '), 'hithere');
    assert.ok(sanitizeChat('x'.repeat(200)).length <= MATCH.chatMax);
  });
});
