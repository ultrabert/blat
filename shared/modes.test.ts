/**
 * @mechanic match-modes
 * @mechanic blat-pulse
 * @mechanic realistic-mode
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PlayerInput } from './constants.js';
import { MATCH, OBJECTIVES, TEAM } from './match.js';
import { GameState } from './schema.js';
import { Simulation } from './simulation.js';

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
    ...partial,
  };
}

describe('match-modes-sim', () => {
  it('tdm-skips-friendly-blat', () => {
    const sim = new Simulation(new GameState(), { mode: 'tdm' });
    const a = sim.addPlayer('a', 'Alpha');
    const b = sim.addPlayer('b', 'Bravo');
    b.team = a.team;
    a.x = 400;
    a.y = 400;
    b.x = 430;
    b.y = 400;
    sim.setInput('a', tap({ blat: true }));
    sim.step(16);
    assert.equal(b.health, 100);
  });

  it('ctf-captures-enemy-flag-at-home', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'ctf' });
    const a = sim.addPlayer('a', 'Alpha');
    assert.equal(a.team, TEAM.alpha);
    a.x = OBJECTIVES.flagBravo.x;
    a.y = OBJECTIVES.flagBravo.y;
    sim.step(16);
    assert.equal(state.flagBCarrier, 'a');
    a.x = OBJECTIVES.flagAlpha.x;
    a.y = OBJECTIVES.flagAlpha.y;
    sim.step(16);
    assert.equal(state.alphaScore, 1);
    assert.equal(state.flagBHome, true);
  });

  it('pointmatch-awards-sole-occupant', () => {
    const sim = new Simulation(new GameState(), { mode: 'point' });
    const p = sim.addPlayer('p', 'Hill');
    p.x = OBJECTIVES.point.x;
    p.y = OBJECTIVES.point.y;
    for (let i = 0; i < 50; i++) sim.step(16);
    assert.ok(p.score >= 2, `score=${p.score}`);
  });

  it('infil-bravo-scores-after-hold', () => {
    const state = new GameState();
    const sim = new Simulation(state, { mode: 'infil' });
    sim.addPlayer('a', 'Alpha');
    const b = sim.addPlayer('b', 'Bravo');
    assert.equal(b.team, TEAM.bravo);
    b.x = OBJECTIVES.infil.x;
    b.y = OBJECTIVES.infil.y - 18;
    for (let i = 0; i < 120; i++) sim.step(16);
    assert.ok(state.bravoScore >= 1, `bravo=${state.bravoScore}`);
  });
});

describe('blat-pulse-sim', () => {
  it('blat-hurts-nearby-enemy', () => {
    const sim = new Simulation(new GameState(), { mode: 'dm' });
    const a = sim.addPlayer('a', 'A');
    const b = sim.addPlayer('b', 'B');
    a.x = 400;
    a.y = 400;
    a.aimX = 1;
    b.x = 430;
    b.y = 400;
    sim.setInput('a', tap({ blat: true }));
    sim.step(16);
    assert.ok(b.health < 100, `health=${b.health}`);
    assert.ok(b.vx > 0, `vx=${b.vx}`);
  });

  it('realistic-blat-hits-harder', () => {
    const arcade = new Simulation(new GameState(), { mode: 'dm', realistic: false });
    const real = new Simulation(new GameState(), { mode: 'dm', realistic: true });
    for (const sim of [arcade, real]) {
      const a = sim.addPlayer('a', 'A');
      const b = sim.addPlayer('b', 'B');
      a.x = 400;
      a.y = 400;
      b.x = 430;
      b.y = 400;
      sim.setInput('a', tap({ blat: true }));
      sim.step(16);
    }
    const ah = arcade.soldiers.get('b')!.state.health;
    const rh = real.soldiers.get('b')!.state.health;
    assert.ok(rh < ah, `realistic ${rh} vs arcade ${ah}`);
    assert.ok(MATCH.realisticDamage > 1);
  });
});
