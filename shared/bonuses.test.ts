/**
 * @mechanic soldat-bonuses
 * @mechanic kill-sprees
 * @mechanic air-dash
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BONUS, isBonusId, multiKillLabel, MULTI_WINDOW_MS, spreeLabel } from './bonuses.js';
import { PLAYER, type PlayerInput } from './constants.js';
import { OBJECTIVES, TEAM } from './match.js';
import { stepMovement, type MoveBody, type MoveInput } from './physics.js';
import { GameState, type PlayerState } from './schema.js';
import { Simulation } from './simulation.js';
import { WEAPONS } from './weapons.js';

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

function tap(partial: Partial<PlayerInput> = {}): PlayerInput {
  return {
    seq: 1,
    move: 0,
    jet: false,
    crouch: false,
    aimX: 1,
    aimY: 0,
    fire: false,
    grenade: false,
    reload: false,
    drop: false,
    nadeCycle: false,
    blat: false,
    dash: false,
    tossFlag: false,
    ...partial,
  };
}

describe('soldat-bonuses', () => {
  it('bonus-ids-and-spree-labels', () => {
    assert.ok(isBonusId('berserk') && isBonusId('predator') && isBonusId('flamegod'));
    assert.equal(spreeLabel(3), 'KILLING SPREE');
    assert.equal(spreeLabel(5), 'RAMPAGE');
    assert.equal(spreeLabel(4), null);
    assert.equal(multiKillLabel(1), null);
    assert.equal(multiKillLabel(2), 'DOUBLE KILL');
    assert.equal(multiKillLabel(3), 'TRIPLE KILL');
    assert.equal(multiKillLabel(4), 'QUAD KILL');
    assert.equal(multiKillLabel(5), 'PENTA KILL');
    assert.equal(multiKillLabel(8), 'UNREAL');
    assert.ok(MULTI_WINDOW_MS >= 3000);
  });

  it('berserk-walks-faster', () => {
    const plain = body({ onGround: true, x: 360, y: 292, berserk: false });
    const hot = body({ onGround: true, x: 360, y: 292, berserk: true });
    for (let i = 0; i < 12; i++) {
      stepMovement(plain, input({ move: 1 }), 1 / 30);
      stepMovement(hot, input({ move: 1 }), 1 / 30);
    }
    assert.ok(hot.vx > plain.vx + 20, `berserk ${hot.vx} vs ${plain.vx}`);
    assert.ok(BONUS.berserkSpeed > 1.2);
  });

  it('bonus-pickup-sets-timer', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'dm' });
    const p = sim.addPlayer('a', 'A');
    p.x = 640;
    p.y = 450;
    for (let i = 0; i < 8; i++) sim.step(16);
    assert.equal(p.bonus, 'berserk');
    assert.ok(p.bonusUntil > 0);
  });

  it('flamegod-ignores-flamer', () => {
    const sim = new Simulation(new GameState(), { mode: 'dm' });
    const a = sim.addPlayer('a', 'A');
    const b = sim.addPlayer('b', 'B');
    a.x = 400;
    a.y = 400;
    a.aimX = 1;
    a.aimY = 0;
    a.weapon = 'flamer';
    a.firearm = 'flamer';
    a.ammo = 50;
    b.x = 430;
    b.y = 400;
    b.bonus = 'flamegod';
    b.bonusUntil = 9e6;
    for (let i = 0; i < 4; i++) {
      a.x = 400;
      a.y = 400;
      b.x = 430;
      b.y = 400;
      sim.step(16);
    }
    sim.setInput('a', tap({ fire: true, aimX: 1, seq: 1 }));
    a.x = 400;
    a.y = 400;
    b.x = 430;
    b.y = 400;
    sim.step(16);
    assert.equal(a.ammo, 49);
    assert.equal(b.health, 100);
  });
});

describe('air-dash', () => {
  it('air-dash-lunges-and-costs-fuel', () => {
    const b = body({ onGround: false, vx: 0, fuel: 80, aimX: 1 });
    stepMovement(b, input({ dash: true, move: 1 }), 1 / 30);
    assert.ok(b.vx > 300, `dash vx=${b.vx}`);
    assert.ok(b.fuel < 80);
    assert.ok((b.dashCdMs ?? 0) > 0);
  });

  it('realistic-dash-only-on-ground', () => {
    const air = body({ onGround: false, realistic: true, fuel: 80, vx: 0 });
    stepMovement(air, input({ dash: true, move: 1 }), 1 / 30);
    assert.ok(air.vx < 80, `air dash blocked vx=${air.vx}`);
    const ground = body({ onGround: true, y: 800, realistic: true, fuel: 80, vx: 0 });
    stepMovement(ground, input({ dash: true, move: 1 }), 1 / 30);
    assert.ok(ground.vx > 200, `ground dash vx=${ground.vx}`);
  });
});

describe('throw-flag', () => {
  it('carrier-can-toss-along-aim', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'ctf' });
    const a = sim.addPlayer('a', 'Alpha');
    assert.equal(a.team, TEAM.alpha);
    a.x = OBJECTIVES.flagBravo.x;
    a.y = OBJECTIVES.flagBravo.y;
    sim.step(16);
    assert.equal(state.flagBCarrier, 'a');
    a.aimX = -1;
    a.aimY = 0;
    sim.setInput('a', tap({ tossFlag: true, aimX: -1, seq: 1 }));
    sim.step(16);
    assert.equal(state.flagBCarrier, '');
    assert.ok(state.flagBx < OBJECTIVES.flagBravo.x - 80);
  });
});

describe('kill-sprees', () => {
  function chatOf(state: GameState): { text: string; kind: string }[] {
    const rows: { text: string; kind: string }[] = [];
    state.chat?.forEach((c) => rows.push({ text: c.text, kind: c.kind }));
    return rows;
  }

  function knifeDown(sim: Simulation, attacker: string, victim: PlayerState): void {
    const body = sim.soldiers.get(attacker)!;
    const a = body.state;
    a.weapon = 'knife';
    a.melee = 'knife';
    a.aimX = 1;
    a.aimY = 0;
    for (let i = 0; i < 28; i++) sim.step(16);
    for (let tries = 0; tries < 6 && victim.alive; tries++) {
      a.x = 640;
      a.y = 212;
      victim.x = 668;
      victim.y = 212;
      victim.health = 8;
      victim.vest = 0;
      a.weapon = 'knife';
      sim.setInput(attacker, tap({ fire: true, aimX: 1, seq: body.lastQueuedSeq + 1 }));
      sim.step(16);
    }
    sim.setInput(attacker, tap({ fire: false, aimX: 1, seq: body.lastQueuedSeq + 1 }));
    for (let i = 0; i < 24; i++) sim.step(16);
  }

  it('rapid-kills-stack-double-and-triple', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'dm' });
    const a = sim.addPlayer('a', 'Ace');
    const v1 = sim.addPlayer('v1', 'One');
    const v2 = sim.addPlayer('v2', 'Two');
    const v3 = sim.addPlayer('v3', 'Three');
    v2.x = 2200;
    v3.x = 2200;
    knifeDown(sim, 'a', v1);
    assert.equal(v1.alive, false);
    assert.ok(chatOf(state).some((c) => c.text === 'FIRST BLOOD' && c.kind === 'spree'));
    knifeDown(sim, 'a', v2);
    assert.equal(v2.alive, false);
    assert.ok(chatOf(state).some((c) => c.text === 'DOUBLE KILL' && c.kind === 'medal'));
    knifeDown(sim, 'a', v3);
    assert.equal(v3.alive, false);
    assert.ok(chatOf(state).some((c) => c.text === 'TRIPLE KILL' && c.kind === 'medal'));
    assert.ok(chatOf(state).some((c) => c.text === 'KILLING SPREE' && c.kind === 'spree'));
    assert.equal(a.kills, 3);
  });

  it('multi-window-expires', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'dm' });
    sim.addPlayer('a', 'Ace');
    const v1 = sim.addPlayer('v1', 'One');
    const v2 = sim.addPlayer('v2', 'Two');
    v2.x = 2200;
    knifeDown(sim, 'a', v1);
    const ticks = Math.ceil((MULTI_WINDOW_MS + 80) / 16);
    for (let i = 0; i < ticks; i++) sim.step(16);
    knifeDown(sim, 'a', v2);
    assert.equal(v2.alive, false);
    assert.equal(
      chatOf(state).some((c) => c.text === 'DOUBLE KILL'),
      false,
    );
  });
});

describe('leftover-kit', () => {
  it('new-guns-are-distinct', () => {
    assert.ok(WEAPONS.socom.fireCooldownMs < WEAPONS.de.fireCooldownMs);
    assert.ok(WEAPONS.m4.spreadMult < WEAPONS.ak.spreadMult);
    assert.ok(WEAPONS.ruger.damage < WEAPONS.barrett.damage);
    assert.ok((WEAPONS.bow.gravityScale ?? 0) > 1);
    assert.equal(WEAPONS.punch.kind, 'melee');
    assert.ok(WEAPONS.punch.meleeRange! < WEAPONS.knife.meleeRange!);
  });
});
