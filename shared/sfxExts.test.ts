import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rankSfxExts } from './sfxExts.js';

describe('sfx-exts', () => {
  it('safari-ios-prefers-aac-then-ogg', () => {
    const canPlay = (mime: string) => (mime.includes('mp4') ? 'maybe' : '');
    assert.deepEqual(rankSfxExts(canPlay), ['m4a', 'ogg']);
  });

  it('firefox-prefers-ogg-then-aac', () => {
    const canPlay = (mime: string) => (mime.includes('ogg') ? 'probably' : '');
    assert.deepEqual(rankSfxExts(canPlay), ['ogg', 'm4a']);
  });

  it('chrome-keeps-aac-first-when-both-play', () => {
    const canPlay = () => 'maybe';
    assert.deepEqual(rankSfxExts(canPlay), ['m4a', 'ogg']);
  });
});
