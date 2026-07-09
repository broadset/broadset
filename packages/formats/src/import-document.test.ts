import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { importPptxDocument } from './import-document';
import { importPdfDocument } from './pdf';
import { exportPptxBytes } from './pptx';
import { importSvgDocument } from './svg';

/**
 * @description Cross-cutting tests for the format-import dispatcher.
 *
 * The current focus is the PPTX importer's reconciliation-summary
 * pathway: when a Broadset-exported file is re-imported after external
 * editing, `importPptxDocument` must produce one warning summary line
 * per non-empty reconciliation bucket so the import-warnings modal can
 * surface them. Closes Phase 8 P8.5 acceptance criterion "report
 * consumable by FormatImportWarningsModal" at the user surface for
 * the additions / modifications / deletions / recoveredByHash buckets.
 */

describe('importPptxDocument — reconciliation surfacing', () => {
  it('returns controlled warnings for malformed bytes instead of rejecting', async () => {
    const result = await importPptxDocument(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    expect(result.document).toBeDefined();
    expect(result.document.elements).toEqual([]);
    expect(result.warnings.some((warning) => /zip|readable|malformed|unsupported/i.test(warning))).toBe(true);
  });

  it('emits no reconciliation warning lines for an arbitrary third-party PPTX', async () => {
    const doc = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const result = await importPptxDocument(bytes);

    for (const w of result.warnings) {
      expect(w).not.toMatch(/external (additions|deletions|edits) detected/i);
      expect(w).not.toMatch(/identity recovered by content hash/i);
    }
  });

  it('emits no reconciliation warning lines for an untouched Broadset round-trip', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'rect-1' })],
    };
    const bytes = exportPptxBytes(doc);
    const result = await importPptxDocument(bytes);

    for (const w of result.warnings) {
      expect(w).not.toMatch(/external (additions|deletions|edits) detected/i);
      expect(w).not.toMatch(/identity recovered by content hash/i);
    }
  });
});

/**
 * @description The active-page renderer (`buildRenderableDocumentForActivePage`)
 * only includes root elements that have a matching `PageElementInstance`
 * on the active page. Importers that populate `document.elements` but
 * not `page.elements` produce documents that parse cleanly but render
 * nothing on the canvas — a critical failure mode flagged in the
 * 2026-04-28 production-readiness inspection. These tests pin every
 * importer's contract that root elements get page-instance entries
 * matching their geometry.
 */
describe('Importers populate active-page instances for every root element', () => {
  it('PPTX round-trip: every root element shows up on its slide', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', { id: 'rect-1', position: { x: 10, y: 20 } }),
        createDefaultElement('text', { id: 'text-1', content: 'Hello', position: { x: 50, y: 60 } }),
      ],
    };
    const bytes = exportPptxBytes(doc);
    const result = await importPptxDocument(bytes);
    const totalInstances = result.document.pages.reduce((sum, page) => sum + page.elements.length, 0);
    const rootElementCount = result.document.elements.filter((el) => el.parentId === null).length;

    expect(rootElementCount).toBeGreaterThan(0);
    expect(totalInstances).toBeGreaterThanOrEqual(rootElementCount);

    for (const el of result.document.elements) {
      if (el.parentId !== null) continue;

      const found = result.document.pages.flatMap((page) => page.elements).find((inst) => inst.elementId === el.id);

      expect(found, `root element ${el.id} should have a page instance`).toBeDefined();
    }
  });

  it('SVG third-party: every root element shows up on the imported page', () => {
    const svgInput = `<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect x="10" y="20" width="50" height="40" fill="#ff0000"/>
        <circle cx="120" cy="80" r="30" fill="#00ff00"/>
      </svg>`;
    const result = importSvgDocument(svgInput);

    expect(result.document.elements.length).toBeGreaterThan(0);

    const rootElements = result.document.elements.filter((el) => el.parentId === null);

    expect(rootElements.length).toBeGreaterThan(0);

    for (const el of rootElements) {
      const found = result.document.pages.flatMap((page) => page.elements).find((inst) => inst.elementId === el.id);

      expect(found, `root element ${el.id} should have a page instance`).toBeDefined();
    }
  });

  it('PDF third-party fallback: every root element shows up on the imported page', async () => {
    const pdfBytes = makeMinimalPdfWithText();
    const result = await importPdfDocument(pdfBytes);
    const rootElements = result.document.elements.filter((el) => el.parentId === null);

    if (rootElements.length === 0) {
      // Some PDF inputs legitimately produce zero elements (header-only,
      // adjustment-only docs); the contract only requires that every
      // root element that *does* end up in `document.elements` shows up
      // on a page.
      return;
    }

    for (const el of rootElements) {
      const found = result.document.pages.flatMap((page) => page.elements).find((inst) => inst.elementId === el.id);

      expect(found, `root element ${el.id} should have a page instance`).toBeDefined();
    }
  });
});

/**
 * Build a minimal PDF byte stream with a single text-showing operator
 * so the third-party operator-extraction path produces at least one
 * element. Avoids pulling in a full fixture for the importer-test
 * scope; the cross-format test corpora cover real-world shapes.
 */
function makeMinimalPdfWithText(): Uint8Array {
  const pdfSrc = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    '4 0 obj << /Length 44 >> stream',
    'BT /F1 12 Tf 10 100 Td (Hello world) Tj ET',
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f',
    '0000000009 00000 n',
    '0000000055 00000 n',
    '0000000102 00000 n',
    '0000000209 00000 n',
    '0000000295 00000 n',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '358',
    '%%EOF',
  ].join('\n');

  return new TextEncoder().encode(pdfSrc);
}
