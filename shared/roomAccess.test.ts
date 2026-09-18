import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertRoomAccess, roomAccessError, WRONG_PASSWORD_MESSAGE } from './roomAccess.js';
import { DEMO_ROOM_CODE } from './roomCode.js';

describe('room-access-policy', () => {
  const secret = 'test-secret';

  it('rejects-create-without-the-shared-password', () => {
    assert.equal(
      roomAccessError('create', { code: 'ABCDEF', password: '' }, secret),
      WRONG_PASSWORD_MESSAGE,
    );
    assert.equal(
      roomAccessError('create', { code: 'ABCDEF' }, secret),
      WRONG_PASSWORD_MESSAGE,
    );
    assert.throws(
      () => assertRoomAccess('create', { code: 'ABCDEF', password: 'nope' }, secret),
      { message: WRONG_PASSWORD_MESSAGE },
    );
  });

  it('allows-create-with-the-correct-password', () => {
    assert.equal(
      roomAccessError('create', { code: 'ABCDEF', password: secret }, secret),
      null,
    );
    assert.doesNotThrow(() =>
      assertRoomAccess('create', { code: 'ABCDEF', password: secret }, secret),
    );
  });

  it('allows-join-with-an-empty-password', () => {
    assert.equal(roomAccessError('join', { code: 'ABCDEF', password: '' }, secret), null);
    assert.equal(roomAccessError('join', { code: 'ABCDEF' }, secret), null);
    assert.equal(
      roomAccessError('join', { code: 'ABCDEF', password: 'wrong' }, secret),
      null,
    );
    assert.doesNotThrow(() => assertRoomAccess('join', { code: 'ABCDEF' }, secret));
  });

  it('keeps-demo-and-unset-password-create-open', () => {
    assert.equal(roomAccessError('create', { code: DEMO_ROOM_CODE }, secret), null);
    assert.equal(roomAccessError('join', { code: DEMO_ROOM_CODE }, secret), null);
    assert.equal(roomAccessError('create', { code: 'ABCDEF', password: '' }, undefined), null);
    assert.equal(roomAccessError('create', { code: 'ABCDEF', password: '' }, ''), null);
  });
});
