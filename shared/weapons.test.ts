/**
 * @mechanic weapon-arsenal
 * @mechanic magazines-reload
 * @mechanic weapon-pickups
 * @mechanic melee
 * @mechanic vest-medkits
 * @mechanic special-ballistics
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyDamageMult } from './accuracy.js';
import { ballisticDamage } from './ballistics.js';
import { PLAYER, SPAWNS, type PlayerInput } from './constants.js';
import { applyVestDamage, spawnAmmoFor } from './fire.js';
import { NADE, NADE_KINDS } from './grenades.js';
import { GameState } from './schema.js';
import { Simulation } from './simulation.js';
import {
  isMelee,
  MAP_PICKUPS,
  PICKUP_ARM_MS,
  PICKUP_RADIUS,
  PICKUP_RESPAWN_MS,
  WEAPON_RESPAWN_MS,
  WEAPONS,
  isWeaponId,
} from './weapons.js';

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

describe('weapon-arsenal', () => {
  it('barrett-is-slower-and-tighter-than-ak', () => {
    assert.ok(WEAPONS.barrett.fireCooldownMs > WEAPONS.ak.fireCooldownMs);
    assert.ok(WEAPONS.barrett.spreadMult < WEAPONS.ak.spreadMult);
    assert.ok(WEAPONS.barrett.damage > WEAPONS.ak.damage);
    assert.ok(WEAPONS.barrett.muzzleSpeed > WEAPONS.ak.muzzleSpeed);
  });

  it('spas-is-multi-pellet-wide-cone', () => {
    assert.ok(WEAPONS.spas.pellets > 1);
    assert.ok(
      WEAPONS.spas.spreadMult + WEAPONS.spas.pelletSpread > WEAPONS.ak.spreadMult,
    );
    assert.ok(WEAPONS.spas.fireCooldownMs > WEAPONS.ak.fireCooldownMs);
  });

  it('mp5-and-minigun-outpace-ak-rof', () => {
    assert.ok(WEAPONS.mp5.fireCooldownMs < WEAPONS.ak.fireCooldownMs);
    assert.ok(WEAPONS.minigun.fireCooldownMs < WEAPONS.ak.fireCooldownMs);
  });

  it('ak-needs-multiple-body-hits', () => {
    const body = ballisticDamage(1, WEAPONS.ak.damage) * bodyDamageMult('torso');
    assert.ok(body < PLAYER.maxHealth / 3, `ak body too hot: ${body}`);
  });

  it('barrett-body-is-sub-lethal-head-ohk', () => {
    const body = ballisticDamage(1, WEAPONS.barrett.damage) * bodyDamageMult('torso');
    assert.ok(body < PLAYER.maxHealth, `barrett body should not OHK: ${body}`);
    assert.ok(body > PLAYER.maxHealth * 0.35, `barrett body too soft: ${body}`);
    const head = ballisticDamage(1, WEAPONS.barrett.damage) * bodyDamageMult('head');
    assert.ok(head >= PLAYER.maxHealth || WEAPONS.barrett.headOhk);
  });

  it('de-two-taps-torso-head-deletes', () => {
    const body = ballisticDamage(1, WEAPONS.de.damage) * bodyDamageMult('torso');
    assert.ok(body * 2 >= PLAYER.maxHealth, `DE should 2-tap torso, body=${body}`);
    assert.ok(body < PLAYER.maxHealth, 'DE body should not OHK');
    const head = ballisticDamage(1, WEAPONS.de.damage) * bodyDamageMult('head');
    assert.ok(head >= PLAYER.maxHealth, `DE head should OHK, head=${head}`);
  });

  it('specials-explode-or-burn', () => {
    assert.equal(WEAPONS.law.kind, 'rocket');
    assert.ok(WEAPONS.law.explodeOnHit);
    assert.equal(WEAPONS.m79.kind, 'shell');
    assert.ok(WEAPONS.m79.explodeOnHit);
    assert.equal(WEAPONS.flamer.kind, 'flame');
    assert.ok((WEAPONS.flamer.lifeMs ?? 0) < 400);
  });

  it('melee-is-close-and-dry-safe', () => {
    assert.ok(isMelee('knife') && isMelee('chainsaw'));
    assert.ok((WEAPONS.knife.meleeRange ?? 0) > 20);
    assert.equal(WEAPONS.knife.magSize, 0);
    assert.ok(WEAPONS.knife.damage > WEAPONS.ak.damage);
  });

  it('rejects-unset-weapon-ids', () => {
    assert.equal(isWeaponId(undefined), false);
    assert.equal(isWeaponId(''), false);
    assert.equal(isWeaponId('rifle'), false);
    assert.equal(isWeaponId('ak'), true);
  });
});

describe('magazines-reload', () => {
  it('firearms-have-finite-mags', () => {
    for (const w of Object.values(WEAPONS)) {
      if (isMelee(w.id)) continue;
      assert.ok(w.magSize > 0, w.id);
      assert.ok(w.reloadMs > 0, w.id);
      const spawn = spawnAmmoFor(w.id);
      assert.equal(spawn.ammo, w.magSize);
    }
  });

  it('reload-refills-mag-with-no-reserve', () => {
    const sim = new Simulation(new GameState(), { mode: 'dm' });
    const a = sim.addPlayer('a', 'A');
    a.x = 1280;
    a.y = 830;
    a.weapon = 'de';
    a.firearm = 'de';
    a.ammo = 1;
    a.reserve = 0;
    a.aimX = 1;
    a.aimY = 0;
    for (let i = 0; i < 20; i++) sim.step(16);
    a.x = 1280;
    a.y = 830;
    a.ammo = 1;
    a.reserve = 0;
    a.reloading = false;
    sim.setInput('a', tap({ fire: true, seq: 1 }));
    sim.step(16);
    assert.equal(a.ammo, 0);
    assert.equal(a.reloading, true);
    for (let i = 0; i < 100; i++) sim.step(16);
    assert.equal(a.ammo, WEAPONS.de.magSize);
    assert.equal(a.reloading, false);
    sim.setInput('a', tap({ fire: true, seq: 2 }));
    sim.step(16);
    assert.equal(a.ammo, WEAPONS.de.magSize - 1);
  });

  it('dropped-guns-are-not-instantly-regrabbed', () => {
    assert.ok(PICKUP_ARM_MS > 200);
  });
});

describe('weapon-pickups', () => {
  it('weapon-pads-are-sparse-unique-and-off-spawn', () => {
    const guns = MAP_PICKUPS.filter((p) => p.kind === 'weapon');
    assert.ok(guns.length <= 6, `too many gun pads: ${guns.length}`);
    const items = guns.map((g) => g.item);
    assert.equal(new Set(items).size, items.length, 'one pad per gun');
    assert.ok(!MAP_PICKUPS.some((p) => p.kind === 'ammo'));
    for (const id of ['ak', 'minigun', 'law', 'barrett', 'm79', 'flamer'] as const) {
      assert.ok(items.includes(id), `${id} should stay a map destination`);
    }
    assert.ok(WEAPON_RESPAWN_MS >= 80000);
    assert.ok(WEAPON_RESPAWN_MS > PICKUP_RESPAWN_MS);
    for (const gun of guns) {
      for (const spawn of SPAWNS) {
        const dist = Math.hypot(gun.x - spawn.x, gun.y - spawn.y);
        assert.ok(
          dist > PICKUP_RADIUS * 2,
          `${gun.item} at ${gun.x},${gun.y} is ${dist.toFixed(0)}px from spawn ${spawn.x},${spawn.y}`,
        );
      }
    }
  });
});

describe('vest-medkits', () => {
  it('vest-soaks-body-less-on-head', () => {
    const body = applyVestDamage(100, 80, 40, 'torso');
    assert.ok(body.health > 100 - 40, `vest should soak, hp=${body.health}`);
    assert.ok(body.vest < 80);
    const head = applyVestDamage(100, 80, 40, 'head');
    assert.ok(head.health < body.health, 'head should pierce vest more');
  });
});

describe('nade-variety', () => {
  it('three-throwables', () => {
    assert.deepEqual(NADE_KINDS, ['frag', 'cluster', 'sting']);
    assert.ok(NADE.cluster.children >= 4);
    assert.ok(NADE.sting.pellets >= 8);
    assert.ok(NADE.frag.blastDamage > NADE.sting.blastDamage);
  });
});
