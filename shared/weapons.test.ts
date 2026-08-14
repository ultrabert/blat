/**
 * @mechanic weapon-arsenal
 * @mechanic magazines-reload
 * @mechanic melee
 * @mechanic vest-medkits
 * @mechanic special-ballistics
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyDamageMult } from './accuracy.js';
import { ballisticDamage } from './ballistics.js';
import { PLAYER } from './constants.js';
import { applyVestDamage, spawnAmmoFor } from './fire.js';
import { NADE, NADE_KINDS } from './grenades.js';
import { isMelee, PICKUP_ARM_MS, WEAPONS } from './weapons.js';

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
});

describe('magazines-reload', () => {
  it('firearms-have-finite-mags', () => {
    for (const w of Object.values(WEAPONS)) {
      if (isMelee(w.id)) continue;
      assert.ok(w.magSize > 0, w.id);
      assert.ok(w.reloadMs > 0, w.id);
      const spawn = spawnAmmoFor(w.id);
      assert.ok(spawn.ammo <= w.magSize);
      assert.ok(spawn.reserve <= w.reserveMax);
    }
  });

  it('dropped-guns-are-not-instantly-regrabbed', () => {
    assert.ok(PICKUP_ARM_MS > 200);
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
