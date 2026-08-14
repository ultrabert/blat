/**
 * @mechanic weapon-arsenal
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyDamageMult } from './accuracy.js';
import { ballisticDamage } from './ballistics.js';
import { PLAYER } from './constants.js';
import { WEAPONS } from './weapons.js';

describe('weapon-arsenal', () => {
  it('sniper-is-slower-and-tighter-than-rifle', () => {
    assert.ok(WEAPONS.sniper.fireCooldownMs > WEAPONS.rifle.fireCooldownMs);
    assert.ok(WEAPONS.sniper.spreadMult < WEAPONS.rifle.spreadMult);
    assert.ok(WEAPONS.sniper.damage > WEAPONS.rifle.damage);
    assert.ok(WEAPONS.sniper.muzzleSpeed > WEAPONS.rifle.muzzleSpeed);
  });

  it('shotgun-is-multi-pellet-wide-cone', () => {
    assert.ok(WEAPONS.shotgun.pellets > 1);
    assert.ok(
      WEAPONS.shotgun.spreadMult + WEAPONS.shotgun.pelletSpread >
        WEAPONS.rifle.spreadMult,
    );
    assert.ok(WEAPONS.shotgun.fireCooldownMs > WEAPONS.rifle.fireCooldownMs);
  });

  it('rifle-is-highest-rof', () => {
    assert.ok(WEAPONS.rifle.fireCooldownMs < WEAPONS.sniper.fireCooldownMs);
    assert.ok(WEAPONS.rifle.fireCooldownMs < WEAPONS.shotgun.fireCooldownMs);
  });

  it('ttk-rifle-needs-multiple-body-hits', () => {
    const body = ballisticDamage(1, WEAPONS.rifle.damage) * bodyDamageMult('torso');
    assert.ok(body < PLAYER.maxHealth / 3, `rifle body too hot: ${body}`);
  });

  it('sniper-body-is-sub-lethal-at-full-power', () => {
    const body = ballisticDamage(1, WEAPONS.sniper.damage) * bodyDamageMult('torso');
    assert.ok(body < PLAYER.maxHealth, `sniper body should not OHK: ${body}`);
    assert.ok(body > PLAYER.maxHealth * 0.35, `sniper body too soft: ${body}`);
  });
});
