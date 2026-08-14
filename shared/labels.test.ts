import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayLabel } from './labels.js';

describe('display-labels', () => {
  it('hides-unset-schema-strings', () => {
    assert.equal(displayLabel(undefined, 'Soldier'), 'Soldier');
    assert.equal(displayLabel('undefined', 'Soldier'), 'Soldier');
    assert.equal(displayLabel('null', 'Soldier'), 'Soldier');
    assert.equal(displayLabel('', 'Soldier'), 'Soldier');
    assert.equal(displayLabel('Bot 1', 'Soldier'), 'Bot 1');
  });
});
