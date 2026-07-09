import { describe, expect, it } from 'vitest';

import { assertReImportableBy, runChainRoundTrip } from './index';

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

describe('runChainRoundTrip', () => {
  /**
   * @description The helper wires source → export → import and hands
   * back all three artefacts so tests can assert on the imported doc
   * alongside the source and the raw bytes.
   */
  it('returns source, bytes, and imported doc', () => {
    const source = { elements: [{ id: 'a' }] } as unknown as Parameters<typeof runChainRoundTrip>[0]['source'];
    const result = runChainRoundTrip({
      source,
      exportBytes: () => new Uint8Array([1, 2, 3]),
      importDocument: () => source,
    });

    expect(result.source).toBe(source);
    expect(result.exportedBytes.byteLength).toBe(3);
    expect(result.imported).toBe(source);
  });
});
