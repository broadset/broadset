import { describe, expect, it } from 'vitest';

import { analyzeBidi, breakLines, type TextMeasure } from './text-layout';

/**
 * Phase 2 `_shared/text-layout/` — tests pin the eager subset of
 * layout primitives every format calls: UAX #14 line breaking via
 * linebreak + UAX #9 bidi analysis via bidi-js. Harfbuzz-backed
 * shaping lands lazily with the first non-Latin caller.
 */

// Cheap character-count measure for deterministic tests — in production
// callers supply fontkit / DOM-measured widths.
const charWidth: TextMeasure = (text) => text.length;

describe('breakLines', () => {
  /**
   * @description Empty input returns an empty line array. Callers
   * iterate safely without a null guard.
   */
  it('returns an empty array for empty input', () => {
    expect(breakLines('', 100, charWidth)).toHaveLength(0);
  });

  /**
   * @description Short text that fits inside the box returns a
   * single line with the original text.
   */
  it('returns a single line when the text fits in the box', () => {
    const result = breakLines('Hello world', 100, charWidth);

    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe('Hello world');
  });

  /**
   * @description Text that exceeds the box width breaks at a UAX #14
   * opportunity (word boundary) into multiple lines.
   */
  it('breaks long text into multiple lines at word boundaries', () => {
    const result = breakLines('The quick brown fox', 10, charWidth);

    expect(result.length).toBeGreaterThan(1);

    for (const line of result) {
      // Every output line width must be reported; character widths used
      // here make the bound trivial to verify.
      expect(line.width).toBeGreaterThan(0);
    }
  });

  /**
   * @description Mandatory (hard) line breaks force a new line even
   * when the preceding text would fit. Preserves author-intended
   * paragraph structure.
   */
  it('respects hard line breaks regardless of box width', () => {
    const result = breakLines('One\nTwo\nThree', 100, charWidth);

    expect(result.length).toBe(3);
    expect(result.map((line) => line.text)).toEqual(['One', 'Two', 'Three']);
  });

  /**
   * @description Every emitted line reports its measured width in the
   * caller's units so the consumer can position lines without re-
   * measuring.
   */
  it('reports the measured width on every line', () => {
    const result = breakLines('One two three four', 8, charWidth);

    for (const line of result) {
      expect(line.width).toBeCloseTo(charWidth(line.text), 3);
    }
  });

  /**
   * @description When the first break candidate already overflows
   * the box, the line is emitted unchanged rather than dropped. This
   * mirrors Broadset's graceful-degradation stance per IO-D-18.
   */
  it('emits overflowing words rather than dropping them', () => {
    const result = breakLines('Supercalifragilisticexpialidocious', 5, charWidth);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.text.length).toBeGreaterThan(5);
  });
});

describe('analyzeBidi', () => {
  /**
   * @description Empty input returns empty paragraphs + zero-length
   * level array. Callers iterate without a null guard.
   */
  it('returns empty analysis for empty input', () => {
    const result = analyzeBidi('');

    expect(result.paragraphs).toHaveLength(0);
    expect(result.levels).toHaveLength(0);
  });

  /**
   * @description Pure LTR text yields level 0 across the board.
   */
  it('assigns level 0 to pure LTR text', () => {
    const result = analyzeBidi('Hello world');

    expect(result.paragraphs).toHaveLength(1);
    expect(result.paragraphs[0]?.level).toBe(0);

    for (const level of result.levels) {
      expect(level).toBe(0);
    }
  });

  /**
   * @description An RTL-containing string yields at least one level
   * > 0 for the RTL runs, proving bidi analysis is wired.
   */
  it('elevates levels for embedded RTL characters', () => {
    // Mix of LTR "Hello " and Hebrew RTL chars — bidi should mark the
    // Hebrew span with an odd (RTL) level.
    const result = analyzeBidi('Hello אבג');
    let hasRtlLevel = false;

    for (const level of result.levels) {
      if (level % 2 === 1) {
        hasRtlLevel = true;
        break;
      }
    }

    expect(hasRtlLevel).toBe(true);
  });

  /**
   * @description When `baseDirection` is explicit RTL, the paragraph
   * level is odd (RTL) so the caller can reorder the line visually.
   */
  it('honors explicit RTL base direction', () => {
    const result = analyzeBidi('אבג', 'rtl');

    expect(result.paragraphs[0]?.level).toBe(1);
  });
});
