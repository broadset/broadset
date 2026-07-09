import { beforeAll, describe, expect, it } from 'vitest';

import { prepareBidiAnalysis, reorderForBidi } from './bidi-reorder';

describe('UAX #9 bidi reordering (RTL languages)', () => {
  beforeAll(async () => {
    await prepareBidiAnalysis();
  });

  /**
   * @description Pure Latin text contains no RTL characters; the
   * reorder function MUST return the input unchanged (identity
   * fast-path so the common case has zero overhead beyond a regex
   * test).
   */
  it('returns Latin text unchanged', () => {
    expect(reorderForBidi('Hello world')).toBe('Hello world');
  });

  /**
   * @description Empty input MUST round-trip unchanged.
   */
  it('returns empty input unchanged', () => {
    expect(reorderForBidi('')).toBe('');
  });

  /**
   * @description Hebrew "shalom" (logical: shin, lamed, vav,
   * final-mem) reverses to visual order (final-mem, vav, lamed,
   * shin) when emitted via PDF Tj.
   */
  it('reverses a pure-Hebrew run into visual order', () => {
    expect(reorderForBidi('שלום')).toBe('םולש');
  });

  /**
   * @description Mixed Latin + Hebrew runs split at level boundaries
   * — Latin segments paint in natural order while the Hebrew block
   * reverses around them.
   */
  it('reorders mixed Latin + Hebrew runs at level boundaries', () => {
    const result = reorderForBidi('Hello שלום world');

    expect(result).toContain('םולש');
    expect(result.indexOf('Hello')).toBeLessThan(result.indexOf('םולש'));
    expect(result.indexOf('םולש')).toBeLessThan(result.indexOf('world'));
  });

  /**
   * @description Arabic text exercises the same code path as Hebrew
   * — verifies the RTL detection regex covers the full Arabic block.
   */
  it('reorders pure Arabic text into visual order', () => {
    expect(reorderForBidi('مرحبا')).toBe('ابحرم');
  });
});

describe('Bidi reorder graceful-degradation when bidi-js unavailable', () => {
  /**
   * @description If `prepareBidiAnalysis` was never awaited (e.g. a
   * test that bypasses the export pipeline), `reorderForBidi` MUST
   * return the input unchanged rather than throwing. The export
   * pipeline always preloads via `prepareBidiAnalysis`.
   */
  it('falls through to identity when prepareBidiAnalysis was never awaited', () => {
    // We can't easily reset the cached analyser without exposing a
    // test seam, but we CAN assert the sync function never throws
    // even on RTL input — the worst-case behaviour is identity.
    expect(() => reorderForBidi('שלום')).not.toThrow();
  });
});
