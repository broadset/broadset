import { describe, expect, it } from 'vitest';

import { analyseTextUnicodeProfile, containsCjkCharacters, containsRtlCharacters } from './text-unicode';

describe('PSD text Unicode profile', () => {
  /** @description Pure ASCII / Latin text has no RTL / CJK content. */
  it('returns false for pure Latin text', () => {
    const profile = analyseTextUnicodeProfile('Hello world');

    expect(profile.hasRtl).toBe(false);
    expect(profile.hasCjk).toBe(false);
  });

  /** @description Hebrew text triggers the RTL flag. */
  it('detects Hebrew RTL characters', () => {
    expect(containsRtlCharacters('שלום עולם')).toBe(true);
  });

  /** @description Arabic text triggers the RTL flag. */
  it('detects Arabic RTL characters', () => {
    expect(containsRtlCharacters('مرحبا بالعالم')).toBe(true);
  });

  /** @description Chinese ideographs trigger the CJK flag. */
  it('detects CJK ideographs', () => {
    expect(containsCjkCharacters('你好世界')).toBe(true);
  });

  /** @description Japanese hiragana + katakana trigger the CJK flag. */
  it('detects Japanese kana', () => {
    expect(containsCjkCharacters('こんにちはカタカナ')).toBe(true);
  });

  /** @description Korean Hangul syllables trigger the CJK flag. */
  it('detects Korean Hangul', () => {
    expect(containsCjkCharacters('안녕하세요')).toBe(true);
  });

  /** @description Mixed Latin + RTL + CJK content lights up both flags. */
  it('detects mixed scripts', () => {
    const profile = analyseTextUnicodeProfile('Hello שלום 你好');

    expect(profile.hasRtl).toBe(true);
    expect(profile.hasCjk).toBe(true);
  });

  /** @description Latin diacritics MUST NOT trigger RTL or CJK flags. */
  it('does not flag Latin diacritics', () => {
    const profile = analyseTextUnicodeProfile('Café résumé naïve');

    expect(profile.hasRtl).toBe(false);
    expect(profile.hasCjk).toBe(false);
  });
});
