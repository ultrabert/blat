/**
 * @mechanic crouch-cover
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COVERS, PLAYER, playerHalfExtents } from './constants.js';
import { traceBullet } from './trace.js';

describe('crouch-cover', () => {
  const cover = COVERS.find((c) => c.x === 1280 && c.y === 492)!;

  it('cover-blocks-crouched: frontal shot hits cover before crouched player', () => {
    assert.ok(cover);
    const coverTop = cover.y - cover.h / 2;
    const coverBottom = cover.y + cover.h / 2;
    const { halfH } = playerHalfExtents(true);
    // Fully within cover vertical band
    const playerY = (coverTop + coverBottom) / 2;
    const player = {
      id: 'victim',
      x: cover.x + 4,
      y: playerY,
      alive: true,
      crouching: true,
    };
    assert.ok(player.y - halfH >= coverTop - 1);
    assert.ok(player.y + halfH <= coverBottom + 1);

    const hit = traceBullet(
      cover.x - 140,
      playerY,
      player.x + 20,
      playerY,
      [player],
      'shooter',
    );
    assert.ok(hit, 'expected a hit');
    assert.equal(hit!.kind, 'cover');
  });

  it('cover-peek-standing: shot above cover top can hit standing player', () => {
    assert.ok(cover);
    const coverTop = cover.y - cover.h / 2;
    const { halfH } = playerHalfExtents(false);
    const aimY = coverTop - 6;
    const player = {
      id: 'victim',
      x: cover.x,
      y: aimY + halfH - 2,
      alive: true,
      crouching: false,
    };
    assert.ok(player.y - halfH < coverTop, 'head clears cover');

    const hit = traceBullet(cover.x - 140, aimY, player.x, aimY, [player], 'shooter');
    assert.ok(hit, 'expected a hit');
    assert.equal(hit!.kind, 'player');
    if (hit!.kind === 'player') assert.equal(hit.playerId, 'victim');
  });

  it('crouch-hitbox-shorter-than-standing', () => {
    const stand = playerHalfExtents(false);
    const crouch = playerHalfExtents(true);
    assert.ok(crouch.halfH < stand.halfH);
    assert.ok(PLAYER.crouchHeight < PLAYER.height);
  });

  it('cover-materials-match-props', () => {
    assert.equal(cover.mat, 'sand');
    const crate = COVERS.find((c) => c.x === 160 && c.y === 292);
    assert.equal(crate?.mat, 'wood');
    const cliff = COVERS.find((c) => c.x === 40 && c.y === 560);
    assert.equal(cliff?.mat, 'stone');
  });
});
