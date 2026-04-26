import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

function decodeBase64ToLatin1(base64: string): string {
  const binary = globalThis.atob(base64);

  return binary;
}

function pdfExtensionOf(doc: { elements: ReadonlyArray<{ id: string; extensions?: unknown }> }, id: string): Record<string, unknown> | undefined {
  const el = doc.elements.find((e) => e.id === id);
  const extensions = el?.extensions as Readonly<Record<string, unknown>> | undefined;

  return extensions?.['pdf'] as Record<string, unknown> | undefined;
}

describe('PDF operator-level preservation blob capture', () => {
  /**
   * @description Re-importing a Broadset-exported PDF MUST capture the
   * actual content-stream operators painted between each element's
   * `/BSET <name> BDC` and `EMC` markers. Round-tripping a rectangle
   * yields a non-empty base64 blob whose decoded payload contains
   * graphics operators (the rectangle path + fill).
   */
  it('captures painted operators between BDC and EMC markers per element', async () => {
    const doc = makeDocument({
      id: 'preservation-capture',
      elements: [
        makeElement('rectangle', {
          id: 'rect-a',
          style: makeStyle(),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const pdfExt = pdfExtensionOf(result.document, 'rect-a');
    const blob = pdfExt?.['preservationBlob'];

    expect(typeof blob).toBe('string');

    const decoded = decodeBase64ToLatin1(blob as string);

    expect(decoded.length).toBeGreaterThan(0);
    // The decoded slice MUST NOT include the BDC/EMC delimiters — those
    // are part of the bracket and not the operator slice.
    expect(decoded).not.toContain('BDC');
    expect(decoded).not.toContain('EMC');
  });

  /**
   * @description When a document carries multiple elements, each
   * element id MUST receive its own captured operator slice — the
   * scanner MUST distinguish marked-content blocks per element via
   * the `/BS_<...>` resource-name → element-id mapping.
   */
  it('captures a distinct slice per element', async () => {
    const doc = makeDocument({
      id: 'preservation-multi',
      elements: [
        makeElement('rectangle', { id: 'rect-x', style: makeStyle() }),
        makeElement('ellipse', { id: 'ellipse-y', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const result = await importPdfDocument(bytes);
    const blobX = pdfExtensionOf(result.document, 'rect-x')?.['preservationBlob'];
    const blobY = pdfExtensionOf(result.document, 'ellipse-y')?.['preservationBlob'];

    expect(typeof blobX).toBe('string');
    expect(typeof blobY).toBe('string');
    expect(blobX).not.toBe(blobY);
  });

  /**
   * @description Capturing the same exported PDF twice MUST yield the
   * same blob — the scanner is deterministic over identical input
   * bytes. (Repeated round-trips through fast-path hydration drop
   * geometry, so the second-pass *export* differs from the first;
   * what we verify here is that capturing the same bytes is stable.)
   */
  it('produces identical blobs when capturing the same exported PDF twice', async () => {
    const doc = makeDocument({
      id: 'preservation-stable',
      elements: [makeElement('rectangle', { id: 'rect-stable', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc);
    const firstImport = await importPdfDocument(bytes);
    const secondImport = await importPdfDocument(bytes);
    const firstBlob = pdfExtensionOf(firstImport.document, 'rect-stable')?.['preservationBlob'];
    const secondBlob = pdfExtensionOf(secondImport.document, 'rect-stable')?.['preservationBlob'];

    expect(typeof firstBlob).toBe('string');
    expect(secondBlob).toBe(firstBlob);
  });
});
