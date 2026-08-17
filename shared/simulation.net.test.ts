/**
 * @mechanic client-prediction
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TICK_MS, type PlayerInput } from './constants.js';
import { GameState } from './schema.js';
import { Simulation } from './simulation.js';

function walk(seq: number, move = 1): PlayerInput {
  return {
    seq,
    move,
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
  };
}

describe('client-prediction-lockstep', () => {
  it('human-consumes-one-input-per-tick', () => {
    const sim = new Simulation(new GameState());
    sim.ensureBots(0);
    const p = sim.addPlayer('p1', 'P', false);
    for (let seq = 1; seq <= 5; seq++) sim.setInput('p1', walk(seq));
    sim.step(TICK_MS);
    assert.equal(p.lastProcessedInput, 1, 'burst must not drain in one frame');
    sim.step(TICK_MS);
    assert.equal(p.lastProcessedInput, 2);
  });

  it('wall-clock-dt-does-not-fast-forward', () => {
    const a = new Simulation(new GameState());
    const b = new Simulation(new GameState());
    a.ensureBots(0);
    b.ensureBots(0);
    const pa = a.addPlayer('p1', 'P', false);
    const pb = b.addPlayer('p1', 'P', false);
    pa.x = pb.x = 400;
    pa.y = pb.y = 280;
    a.setInput('p1', walk(1));
    b.setInput('p1', walk(1));
    a.step(TICK_MS);
    b.step(50);
    assert.equal(pa.lastProcessedInput, 1);
    assert.equal(pb.lastProcessedInput, 1);
    assert.ok(
      Math.abs(pa.x - pb.x) < 0.01 && Math.abs(pa.y - pb.y) < 0.01,
      `dt jitter moved the body: ${pa.x},${pa.y} vs ${pb.x},${pb.y}`,
    );
  });
});
