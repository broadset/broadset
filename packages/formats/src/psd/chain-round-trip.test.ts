import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { assertReImportableBy, runChainRoundTrip } from '../_shared/test-infrastructure';
import { exportPsdBytes } from './export';
import { importPsd } from './import';
import { makeDocument, makeElement } from './test-helpers';
import { validatePsdBytes } from './validate-psd';

/**
 * Phase 5 + I6.2 — chain-round-trip test for PSD. Uses the shared
 * `runChainRoundTrip` helper (I6.2) to cover the headline
 * `source → export → import` loop and `assertReImportableBy` to
 * confirm ag-psd's own reader accepts what the exporter writes.
 */

describe('PSD chain round-trip', () => {
  /**
   * @description Every exported PSD MUST re-import cleanly via
   * ag-psd's own reader — the structural integrity floor from the
   * PSD support plan.
   */
  it('re-imports via ag-psd reader without errors', () => {
    const el = makeElement('rectangle', { id: 'el-chain', name: 'Chain' });
    const doc = makeDocument({ id: 'doc-chain', elements: [el] });
    const bytes = exportPsdBytes(doc);

    const psd = assertReImportableBy(
      bytes,
      (b) =>
        readPsd(b, {
          skipLayerImageData: true,
          skipCompositeImageData: true,
          skipThumbnail: true,
        }),
      { formatLabel: 'psd' },
    );

    expect(psd.width).toBe(doc.canvas.width);
  });

  /**
   * @description `runChainRoundTrip` covers the full loop: source
   * doc → exported bytes → imported Broadset doc. The imported doc
   * MUST carry the same `id` thanks to the P5.4a XMP fast-path.
   */
  it('round-trips the document id via the shared chain harness', () => {
    const el = makeElement('rectangle', { id: 'el-chain', name: 'Chain' });
    const source = makeDocument({ id: 'doc-chain', elements: [el] });

    const result = runChainRoundTrip({
      source,
      exportBytes: exportPsdBytes,
      importDocument: importPsd,
    });

    expect(result.imported.id).toBe('doc-chain');
    expect(result.imported.elements[0]?.id).toBe('el-chain');
  });

  /**
   * @description Every exported PSD MUST also pass the cross-reader
   * structural validator. Mirrors the PDF chain-test's veraPDF gate.
   */
  it('passes the cross-reader structural validator', () => {
    const el = makeElement('rectangle', { id: 'el-validate', name: 'Validate' });
    const doc = makeDocument({ id: 'doc-validate', elements: [el] });
    const bytes = exportPsdBytes(doc);
    const result = validatePsdBytes(bytes);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });
});
