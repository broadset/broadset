import { describe, expect, it } from 'vitest';

import { assertReImportableBy } from './index';

/**
 * Phase 6 I6.2 — the shared test infrastructure ships its own unit
 * tests so a regression in the harness doesn't silently mask format
 * regressions downstream.
 */

describe('assertReImportableBy', () => {
  /**
   * @description The happy path: reader accepts the bytes, returns a
   * non-null parse result; helper returns the result unchanged.
   */
  it('returns the reader output when the reader succeeds', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = assertReImportableBy(bytes, (b) => b.byteLength, { formatLabel: 'test' });

    expect(result).toBe(3);
  });

  /**
   * @description Zero-length output from the exporter is a hard
   * failure — a reader can't prove anything about zero bytes.
   */
  it('throws for zero-length output', () => {
    expect(() => assertReImportableBy(new Uint8Array(0), (b) => b, { formatLabel: 'test' })).toThrow(/zero-length/);
  });

  /**
   * @description Reader exceptions surface as a wrapped descriptive
   * error naming the format label so CI logs pinpoint the regressed
   * exporter.
   */
  it('wraps reader exceptions with the format label', () => {
    expect(() =>
      assertReImportableBy(
        new Uint8Array([1]),
        () => {
          throw new Error('bad signature');
        },
        { formatLabel: 'psd' },
      ),
    ).toThrow(/psd.*bad signature/);
  });

  /**
   * @description A reader that returns `null` is treated as a parse
   * failure — a reader cannot claim success and then hand back nothing.
   */
  it('throws when the reader returns null', () => {
    const nullReader = (): unknown => null;

    expect(() => assertReImportableBy(new Uint8Array([1]), nullReader, { formatLabel: 'fmt' })).toThrow(/null/);
  });
});
