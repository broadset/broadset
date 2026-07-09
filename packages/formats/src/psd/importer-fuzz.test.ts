import { describe, expect, it } from 'vitest';

import { importPsdDocument } from './import-document';

/**
 * Importer fuzz harness — mirrors `pdf/importer-fuzz.test.ts`.
 * Each test feeds a deliberately malformed byte stream into
 * `importPsdDocument` and asserts that the importer produces a clean
 * failure mode (a warning + an empty Broadset document) instead of
 * crashing the host process.
 *
 * The fuzz cases are hand-curated — they encode the failure modes a
 * security-reviewer would flag for a binary parser: wrong signature,
 * truncated headers, oversized declared dimensions, attacker-controlled
 * binary content, declared layer counts that exceed the byte stream.
 * A more exhaustive fuzz harness would use a coverage-guided fuzzer;
 * the curated set is the local stand-in.
 */

const PSD_SIGNATURE = [0x38, 0x42, 0x50, 0x53] as const;

describe('PSD importer fuzz harness — malformed inputs never crash', () => {
  /**
   * @description Empty input MUST be rejected with a "not a PSD"
   * warning, not crash.
   */
  it('handles a zero-byte input', () => {
    const result = importPsdDocument(new Uint8Array(0));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Random binary data without the 8BPS signature MUST be
   * rejected via the header check before ag-psd touches it.
   */
  it('handles random non-PSD binary input', () => {
    const garbage = new Uint8Array(1024);

    for (let i = 0; i < garbage.length; i++) {
      garbage[i] = (i * 7) & 0xff;
    }

    const result = importPsdDocument(garbage);

    expect(result.warnings.find((w) => w.toLowerCase().includes('not'))).toBeDefined();
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A truncated PSD (signature + a few bytes) MUST surface
   * a "malformed" warning rather than crash.
   */
  it('handles a truncated PSD (signature only)', () => {
    const truncated = new Uint8Array(PSD_SIGNATURE);
    const result = importPsdDocument(truncated);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A single byte starting with `8` (first byte of "8BPS")
   * but nothing else MUST not crash the importer.
   */
  it('handles a one-byte input', () => {
    const result = importPsdDocument(new Uint8Array([0x38]));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PSD-like header followed by random bytes MUST hit
   * ag-psd's malformed path cleanly. ag-psd reads the version,
   * reserved bytes, channel count, and dimensions before allocating
   * any pixel data — fuzz bytes break the parse early.
   */
  it('handles a fake PSD header followed by random bytes', () => {
    const random = new Uint8Array(2048);

    for (let i = 0; i < random.length; i++) {
      random[i] = (i * 13 + 17) & 0xff;
    }

    const combined = new Uint8Array(PSD_SIGNATURE.length + random.length);

    combined.set(PSD_SIGNATURE, 0);
    combined.set(random, PSD_SIGNATURE.length);

    const result = importPsdDocument(combined);

    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PSD with a deliberately-oversized width / height
   * declared in the header MUST not allocate unbounded memory or
   * crash. ag-psd's parser allocates lazily; a bogus dimension just
   * fails the structural read.
   */
  it('handles a PSD declaring 4 GB dimensions', () => {
    // 8BPS + version 1 + 6 reserved bytes + 2-byte channel count
    // (3 = RGB) + 4-byte height (0xFFFFFFFF) + 4-byte width
    // (0xFFFFFFFF) + 2-byte bit depth (8) + 2-byte color mode (3 = RGB).
    const oversized = new Uint8Array([
      0x38, 0x42, 0x50, 0x53, // signature
      0x00, 0x01,             // version 1
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 6 reserved bytes
      0x00, 0x03,             // 3 channels
      0xff, 0xff, 0xff, 0xff, // height = 4 294 967 295
      0xff, 0xff, 0xff, 0xff, // width = 4 294 967 295
      0x00, 0x08,             // 8 bits per channel
      0x00, 0x03,             // RGB color mode
    ]);
    const result = importPsdDocument(oversized);

    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PSD declaring an unsupported version (other than
   * 1 = PSD or 2 = PSB) MUST be rejected with a malformed warning.
   */
  it('handles a PSD declaring an unsupported version', () => {
    const badVersion = new Uint8Array([
      0x38, 0x42, 0x50, 0x53,
      0x00, 0x99, // version 153 — not 1 or 2
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x03,
      0x00, 0x00, 0x00, 0x64, // height 100
      0x00, 0x00, 0x00, 0x64, // width 100
      0x00, 0x08,
      0x00, 0x03,
    ]);
    const result = importPsdDocument(badVersion);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PSD with the file truncated mid-header MUST not
   * read past the end of the byte buffer. The parser must respect
   * the input bounds even when the declared structure expects more
   * bytes than the array provides.
   */
  it('handles a PSD truncated in the middle of the header', () => {
    const partial = new Uint8Array([
      0x38, 0x42, 0x50, 0x53,
      0x00, 0x01,
      0x00, 0x00, 0x00, // truncated reserved (only 3 of 6 bytes)
    ]);
    const result = importPsdDocument(partial);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PSD with a malformed colour-mode-data section
   * length (claims 16 MB of palette data, supplies zero bytes) MUST
   * be handled cleanly.
   */
  it('handles a malicious colour-mode-data length', () => {
    const malicious = new Uint8Array([
      0x38, 0x42, 0x50, 0x53,
      0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x03,
      0x00, 0x00, 0x00, 0x64,
      0x00, 0x00, 0x00, 0x64,
      0x00, 0x08,
      0x00, 0x03,
      0x01, 0x00, 0x00, 0x00, // 16 MB of colour-mode data declared
      // …followed by no actual colour data.
    ]);
    const result = importPsdDocument(malicious);

    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Long sequences of valid PSD-like bytes followed by
   * an abrupt cut-off MUST not throw — ag-psd surfaces the malformed
   * boundary instead.
   */
  it('handles a 16 KB stream of valid-looking PSD bytes', () => {
    const stream = new Uint8Array(16384);

    stream.set(PSD_SIGNATURE, 0);
    stream[4] = 0x00;
    stream[5] = 0x01; // version 1

    for (let i = 6; i < stream.length; i++) {
      stream[i] = (i * 31) & 0xff;
    }

    const result = importPsdDocument(stream);

    expect(result.document.canvas).toBeDefined();
  });
});
