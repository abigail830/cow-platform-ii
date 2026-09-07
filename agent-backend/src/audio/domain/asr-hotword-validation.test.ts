import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeHotwordsForChannel,
  validateHotwordText,
  validateHotwordWeight,
} from './asr-hotword-validation.ts';

describe('validateHotwordText', () => {
  it('accepts short ASCII phrases', () => {
    assert.equal(validateHotwordText('OpenKMS'), 'OpenKMS');
  });

  it('rejects empty text', () => {
    assert.throws(() => validateHotwordText('  '), /required/i);
  });

  it('rejects long non-ASCII text', () => {
    assert.throws(() => validateHotwordText('热'.repeat(16)), /15 characters/i);
  });
});

describe('validateHotwordWeight', () => {
  it('accepts Qwen super hotword weight 50', () => {
    assert.equal(validateHotwordWeight(50, 'qwen-audio-3.0-asr-flash-filetrans'), 50);
  });

  it('rejects super hotword weight for Fun ASR', () => {
    assert.throws(() => validateHotwordWeight(50, 'fun-asr-flash-filetrans'), /1 and 5/i);
  });
});

describe('mergeHotwordsForChannel', () => {
  it('deduplicates by text and keeps highest weight', () => {
    const merged = mergeHotwordsForChannel([
      { text: 'OpenKMS', weight: 2, lang: null },
      { text: 'openkms', weight: 4, lang: null },
      { text: 'DashScope', weight: 3, lang: 'zh' },
    ]);
    assert.deepEqual(merged, [
      { text: 'openkms', weight: 4 },
      { text: 'DashScope', weight: 3, lang: 'zh' },
    ]);
  });
});
