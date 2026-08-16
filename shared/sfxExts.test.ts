import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isIosClient, rankSfxExts } from './sfxExts.js';

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

  it('detects-iphone-and-ipad-os', () => {
    assert.equal(isIosClient('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
    assert.equal(isIosClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true);
    assert.equal(isIosClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), false);
  });
});
