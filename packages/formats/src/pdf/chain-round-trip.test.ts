import { describe, expect, it } from 'vitest';

import { assertReImportableBy } from '../_shared/test-infrastructure';
import { loadPdf, readDocumentXmp } from './import/parse';
import { exportPdfBytes, importPdfDocument } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 6 P6.6 — chain-round-trip test for PDF. Exercises the full
 * `source → export → import` loop end-to-end, covering:
 *
 * 1. pdf-lib accepts what the exporter writes (the shared
 *    `assertReImportableBy` helper loads the bytes via pdf-lib and
 *    validates structural integrity).
 * 2. The P6.4a XMP fast-path recovers the document id.
 * 3. Per-element marked-content `/BSET` tags recover every element id
 *    plus type.
 *
 * pdfjs-dist-backed external-tool fixtures (Illustrator, Acrobat,
 * InDesign, Figma, macOS Preview, Word, LaTeX) land with the dedicated
 * fixture corpus in a later iteration; this test covers the headline
 * in-process round-trip that every subsequent fixture test depends on.
 */

describe('PDF chain round-trip', () => {
  /**
   * @description Every exported PDF MUST re-load cleanly via pdf-lib —
   * the structural-integrity floor. Uses the shared
   * `assertReImportableBy` helper so every format follows the same
   * wire-level acceptance shape.
   */
  it('re-loads via pdf-lib without errors', async () => {
    const doc = makeDocument({
      id: 'chain-rt-structural',
      elements: [
        makeElement('rectangle', { id: 'el-rt-rect', name: 'Rect', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    const pdfPromise = assertReImportableBy(
      bytes,
      async (b) => {
        const loaded = await loadPdf(b);

        if (loaded === null) throw new Error('pdf-lib could not load the exported bytes');

        return loaded;
      },
      { formatLabel: 'pdf' },
    );

    const pdf = await pdfPromise;

    expect(pdf.getPages().length).toBeGreaterThan(0);
  });

  /**
   * @description Round-trips the document id via the XMP fast-path.
   * `importPdfDocument(exportPdfBytes(doc)).document.id` MUST equal
   * `doc.id` — the P6.4a contract.
   */
  it('round-trips the document id via the XMP fast-path', async () => {
    const doc = makeDocument({
      id: 'chain-rt-doc-id',
      elements: [
        makeElement('rectangle', { id: 'el-chain-rt', name: 'Chain', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);

    expect(result.document.id).toBe('chain-rt-doc-id');
  });

  /**
   * @description Round-trips every element id via the marked-content
   * tags registered in the page's `/Resources /Properties` by P6.3.
   */
  it('round-trips every element id via marked-content tags', async () => {
    const doc = makeDocument({
      id: 'chain-rt-multi',
      elements: [
        makeElement('rectangle', { id: 'rect-rt-a', style: makeStyle() }),
        makeElement('text', { id: 'text-rt-b', content: 'Hello', style: makeStyle() }),
        makeElement('ellipse', { id: 'ellipse-rt-c', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const roundTrippedIds = result.document.elements.map((el) => el.id);

    expect(roundTrippedIds).toContain('rect-rt-a');
    expect(roundTrippedIds).toContain('text-rt-b');
    expect(roundTrippedIds).toContain('ellipse-rt-c');
  });

  /**
   * @description The `broadset:` XMP packet is visible on the catalog
   * after export — this is the anchor the fast-path reads from.
   */
  it('writes a broadset: XMP packet readable by readDocumentXmp', async () => {
    const doc = makeDocument({
      id: 'chain-rt-xmp',
      elements: [makeElement('rectangle', { id: 'el-xmp-anchor', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc);
    const pdf = await loadPdf(bytes);

    expect(pdf).not.toBeNull();

    if (pdf !== null) {
      const xmp = readDocumentXmp(pdf);

      expect(xmp).not.toBeNull();
      expect(xmp?.documentId).toBe('chain-rt-xmp');
      expect(xmp?.elements.map((e) => e.id)).toContain('el-xmp-anchor');
    }
  });
});
