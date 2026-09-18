import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_ROOM_CODE,
  generateRoomCode,
  isDemoRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './roomCode.js';

describe('room-codes', () => {
  it('generates-six-letter-codes-from-the-unambiguous-alphabet', () => {
    for (let i = 0; i < 40; i++) {
      const code = generateRoomCode();
      assert.equal(code.length, ROOM_CODE_LENGTH);
      assert.equal(code, code.toUpperCase());
      assert.ok(isValidRoomCode(code), code);
      for (const ch of code) {
        assert.ok(ROOM_CODE_ALPHABET.includes(ch), ch);
      }
    }
  });

  it('rejects-four-letter-and-other-invalid-codes', () => {
    assert.equal(isValidRoomCode('ABCD'), false);
    assert.equal(isValidRoomCode('ABCDE'), false);
    assert.equal(isValidRoomCode('ABCDEFG'), false);
    assert.equal(isValidRoomCode(''), false);
    assert.equal(isValidRoomCode(DEMO_ROOM_CODE), false);
    assert.equal(isValidRoomCode('ABCDEI'), false);
    assert.equal(isValidRoomCode('ABCDEO'), false);
    assert.equal(isValidRoomCode('ABCDE0'), false);
    assert.equal(isValidRoomCode('ABCDE1'), false);
    assert.equal(isValidRoomCode('ABCDEF'), true);
  });

  it('normalizes-invite-codes-without-changing-length-rules', () => {
    assert.equal(normalizeRoomCode(' ab-cd-ef '), 'ABCDEF');
    assert.equal(isValidRoomCode(normalizeRoomCode('ab-cd-ef')), true);
    assert.equal(isDemoRoomCode('demo'), true);
    assert.equal(isDemoRoomCode('ABCDEF'), false);
  });
});
