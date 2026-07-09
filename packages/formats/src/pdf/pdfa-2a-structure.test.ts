import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument, validatePdfA2b } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('PDF/A-2a tagged structure tree', () => {
  /**
   * @description Opting into `pdfaConformance: '2a'` MUST emit:
   *  - `pdfaid:conformance="A"` in the XMP packet
   *  - `/MarkInfo << /Marked true >>` on the catalog
   *  - `/StructTreeRoot` on the catalog with at least one structure element
   *  - `/Lang` on the catalog (ISO 19005-2 §6.2.10)
   */
  it('emits the catalog-level structure tree machinery for the 2a variant', async () => {
    const doc = makeDocument({
      id: 'pdfa-2a-doc',
      elements: [
        makeElement('rectangle', { id: 'rect-1', name: 'Decorative rectangle', style: makeStyle() }),
        makeElement('text', { id: 'text-1', name: 'Heading', content: 'Hello', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2a' });
    const text = bytesToString(bytes);

    expect(text).toContain('pdfaid:conformance');
    expect(text).toContain('>A<');
    expect(text).toMatch(/\/MarkInfo\s*<<[^>]*\/Marked\s+true/);
    expect(text).toContain('/StructTreeRoot');
    expect(text).toContain('/Lang');
  });

  /**
   * @description The structure tree MUST role-map element kinds:
   *  - text → Span
   *  - rectangle / image / etc. → Figure
   *  - group → Form
   * And every structure element MUST carry an /Alt attribute (the
   * element name when set, otherwise a kind-based fallback).
   */
  it('role-maps Broadset element kinds to PDF structure types with /Alt text', async () => {
    const doc = makeDocument({
      id: 'pdfa-2a-roles',
      elements: [
        makeElement('text', { id: 'span-text', name: 'Important heading', content: 'Hi', style: makeStyle() }),
        makeElement('rectangle', { id: 'figure-rect', name: 'Brand logo', style: makeStyle() }),
        makeElement('group', { id: 'form-group', name: 'Card group', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2a' });
    const text = bytesToString(bytes);

    // Each role MUST appear at least once in the StructElem dicts.
    expect(text).toMatch(/\/S\s+\/Span/);
    expect(text).toMatch(/\/S\s+\/Figure/);
    expect(text).toMatch(/\/S\s+\/Form/);

    // Alt text from element names round-trips into the structure tree.
    expect(text).toContain('Important heading');
    expect(text).toContain('Brand logo');
    expect(text).toContain('Card group');
  });

  /**
   * @description Re-importing a 2a-tagged document MUST round-trip the
   * conformance level on `extensions.pdf.pdfa.conformance` so the next
   * export pass can re-emit `2a` without the user re-opting in.
   */
  it('round-trips pdfaid:conformance="A" on re-import', async () => {
    const doc = makeDocument({
      id: 'pdfa-2a-rt',
      elements: [makeElement('rectangle', { id: 'rect-rt', style: makeStyle() })],
    });
    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2a' });
    const result = await importPdfDocument(bytes);
    const extensions = result.document.extensions;
    const pdfExt = extensions?.['pdf'] as Record<string, unknown> | undefined;
    const pdfa = pdfExt?.['pdfa'] as Record<string, unknown> | undefined;

    expect(pdfa?.['part']).toBe('2');
    expect(pdfa?.['conformance']).toBe('A');
  });

  /**
   * @description The validator MUST accept `2a` documents alongside
   * `2b` and `2u`. The structural floor is the same plus the
   * structure-tree machinery, which the validator allows but does not
   * require for `2b`/`2u` documents.
   */
  it('validates a 2a document as PDF/A', async () => {
    const doc = makeDocument({
      id: 'pdfa-2a-valid',
      elements: [makeElement('rectangle', { id: 'rect-valid', style: makeStyle() })],
    });
    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2a' });
    const result = await validatePdfA2b(bytes);

    expect(result.valid).toBe(true);
  });
});
