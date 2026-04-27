import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { importPsdDocument } from './import-document';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Robust PSD importer surface (mirrors `importPdfDocument`):
 *   - never throws on malformed input
 *   - returns `{ document, warnings }` so callers can surface
 *     contract violations the same way the PDF pipeline does
 *   - emits structured warnings for: invalid header, malformed body,
 *     empty result, JavaScript-stripped, embedded files preserved
 */

const PSD_HEADER_INVALID_WARNING = 'PSD import failed';

describe('importPsdDocument — robust entry point', () => {
  /**
   * @description Empty input returns an empty document + invalid-header
   * warning. Importer MUST NOT throw.
   */
  it('handles a zero-byte input without throwing', () => {
    const result = importPsdDocument(new Uint8Array(0));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes(PSD_HEADER_INVALID_WARNING))).toBe(true);
    expect(result.document.elements).toHaveLength(0);
  });

  /**
   * @description Random non-PSD binary input is rejected via the
   * header check before ag-psd touches it.
   */
  it('handles random non-PSD binary input', () => {
    const garbage = new Uint8Array(1024);

    for (let i = 0; i < garbage.length; i++) {
      garbage[i] = (i * 7) & 0xff;
    }

    const result = importPsdDocument(garbage);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.elements).toHaveLength(0);
  });

  /**
   * @description A truncated PSD (header only) MUST surface a
   * "malformed" warning rather than crash.
   */
  it('handles a truncated PSD (header only)', () => {
    // Real PSD signature: "8BPS" + version 1 + 6 reserved bytes.
    const truncated = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0x00, 0x01]);
    const result = importPsdDocument(truncated);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.elements).toHaveLength(0);
  });

  /**
   * @description A valid PSD round-trips cleanly with no warnings on
   * the happy path (apart from optional empty-result fallbacks).
   */
  it('round-trips a valid Broadset-authored PSD', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rect-1',
          name: 'Background',
          position: { x: 0, y: 0 },
          width: 200,
          height: 100,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const result = importPsdDocument(bytes);

    expect(result.document.elements.length).toBeGreaterThan(0);
    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description `document.canvas` is always defined — even on the
   * malformed path — so callers can safely unconditionally read
   * canvas dimensions for downstream UI.
   */
  it('always returns a defined canvas', () => {
    const result = importPsdDocument(new Uint8Array(0));

    expect(result.document.canvas).toBeDefined();
    expect(result.document.canvas.width).toBeGreaterThanOrEqual(0);
  });
});
