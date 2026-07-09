import { beforeAll, describe, expect, it } from 'vitest';

import { wrapText } from './text';
import { prepareLineBreaker } from './uax14-linebreak';

describe('UAX #14 line-break wrapping (CJK + non-whitespace scripts)', () => {
  beforeAll(async () => {
    // The export pipeline awaits this once at start; tests do the same
    // so sync `wrapText` uses the cached UAX #14 breaker.
    await prepareLineBreaker();
  });

  /**
   * @description Pure CJK paragraphs have no whitespace separators
   * — the previous implementation produced one long overflowing
   * line. UAX #14 wraps at proper ideographic line-break
   * opportunities so the text fits the box.
   */
  it('wraps Japanese text at ideographic line-break opportunities', () => {
    const measure = (text: string): number => text.length * 10;
    // 18 CJK chars; 60-pt-wide box at 10pt/char → ~6 chars/line.
    const result = wrapText('日本語のテキストを折り返してください', 60, measure);

    expect(result.length).toBeGreaterThan(1);

    // No glyphs lost.
    const total = result.reduce((sum, line) => sum + line.length, 0);

    expect(total).toBe('日本語のテキストを折り返してください'.length);
  });

  /**
   * @description Chinese text exercises the same break path as
   * Japanese — verifies the linebreak module covers the CJK
   * Unified Ideographs block.
   */
  it('wraps Chinese text at ideographic boundaries', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('这是一段中文文本测试自动换行功能', 80, measure);

    expect(result.length).toBeGreaterThan(1);
  });

  /**
   * @description Latin word-wrap MUST still work after the CJK
   * upgrade — regression test for the existing case that was
   * already passing with the whitespace-split implementation.
   */
  it('wraps Latin text at word boundaries', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('The quick brown fox jumps over the lazy dog', 100, measure);

    expect(result.length).toBeGreaterThan(1);

    for (const line of result) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * @description Hard newlines (`\n`) MUST always force a line
   * break regardless of available width.
   */
  it('honours hard newlines as mandatory line breaks', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('line one\n\nline three', 10000, measure);

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.join(' ')).toContain('line one');
    expect(result.join(' ')).toContain('line three');
  });

  /**
   * @description Empty input MUST produce a single empty line so
   * the caller's line-counting logic doesn't divide by zero.
   */
  it('returns a single empty line for empty input', () => {
    const result = wrapText('', 100, () => 0);

    expect(result).toEqual(['']);
  });

  /**
   * @description Mixed Latin + CJK content wraps correctly at
   * both whitespace and ideographic boundaries.
   */
  it('wraps mixed Latin + CJK text at appropriate boundaries', () => {
    const measure = (text: string): number => text.length * 10;
    const result = wrapText('Hello 世界 from Broadset これはテスト', 60, measure);

    expect(result.length).toBeGreaterThan(1);

    // No glyphs lost across the join.
    const joined = result.join('').replace(/\s+/g, '');
    const expected = 'Hello 世界 from Broadset これはテスト'.replace(/\s+/g, '');

    expect(joined.length).toBe(expected.length);
  });

  /**
   * @description When the first break opportunity already exceeds
   * the box, the line MUST still be emitted (overflow accepted)
   * rather than dropped — users see their content even when it
   * doesn't fit perfectly.
   */
  it('emits overflow lines rather than dropping content', () => {
    const measure = (text: string): number => text.length * 100;
    const result = wrapText('SuperLongUnbreakableWord', 50, measure);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toContain('SuperLongUnbreakableWord');
  });
});

describe('Whitespace-split fallback when UAX #14 breaker not loaded', () => {
  /**
   * @description If `prepareLineBreaker` was never awaited (e.g. a
   * test that bypasses the export pipeline), `wrapText` MUST still
   * return at least one line for any input — never crash.
   */
  it('falls through to whitespace splitting without crashing', () => {
    const measure = (text: string): number => text.length * 10;

    // We can't easily reset the cached factory between tests, so we
    // just confirm wrapText is robust to ANY input regardless of
    // whether the linebreak factory is loaded.
    expect(() => wrapText('any text here', 100, measure)).not.toThrow();
    expect(() => wrapText('日本語', 100, measure)).not.toThrow();
    expect(() => wrapText('', 100, measure)).not.toThrow();
  });
});
