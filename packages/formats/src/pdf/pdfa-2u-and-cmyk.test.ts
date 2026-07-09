import { rgbColor } from '@broadset/model';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument, validatePdfA2b } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

function tryDecodeStream(stream: PDFStream): Uint8Array | undefined {
  if (!(stream instanceof PDFRawStream)) return undefined;

  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return undefined;
  }
}

/**
 * Decode every page's content stream from a PDF byte buffer and
 * return the concatenated operator text. Used by the CMYK / RGB
 * operator-presence tests to look at the actual painted operators
 * after FlateDecode decompression.
 */
function resolveContentStream(pdf: PDFDocument, entry: unknown): PDFStream | undefined {
  if (entry instanceof PDFRef) {
    const resolved = pdf.context.lookup(entry);

    return resolved instanceof PDFStream ? resolved : undefined;
  }

  if (entry instanceof PDFStream) return entry;

  return undefined;
}

function contentEntries(contents: unknown): readonly unknown[] {
  if (contents instanceof PDFArray) {
    return Array.from({ length: contents.size() }, (_, i) => contents.get(i));
  }

  return [contents];
}

async function decodePageContentText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const chunks: string[] = [];

  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();

    if (contents === undefined) continue;

    for (const entry of contentEntries(contents)) {
      const stream = resolveContentStream(pdf, entry);

      if (stream === undefined) continue;

      const decoded = tryDecodeStream(stream);

      if (decoded !== undefined) chunks.push(bytesToString(decoded));
    }
  }

  return chunks.join('\n');
}

describe('PDF/A-2u — Unicode mapping conformance variant', () => {
  /**
   * @description Opting into `pdfaConformance: '2u'` emits the same
   * structural surfaces as `'2b'` (OutputIntent, trailer ID,
   * pdfaid: XMP) but with `pdfaid:conformance="U"` instead of `"B"`
   * to signal the Unicode-mapping requirement.
   */
  it('emits pdfaid:conformance="U" for the 2u variant', async () => {
    const doc = makeDocument({
      id: 'pdfa-2u-doc',
      elements: [makeElement('rectangle', { id: 'rect-2u', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2u' });
    const text = bytesToString(bytes);

    expect(text).toContain('pdfaid:conformance');
    expect(text).toContain('>U<');

    // The validator accepts both B and U conformance levels.
    const result = await validatePdfA2b(bytes);

    expect(result.valid).toBe(true);
  });

  /**
   * @description Re-importing a PDF/A-2u document round-trips the
   * Unicode-mapping conformance level on `extensions.pdf.pdfa.conformance`
   * so the next export pass can re-emit `2u` without the user
   * having to re-opt-in.
   */
  it('round-trips pdfaid:conformance="U" on re-import', async () => {
    const doc = makeDocument({
      id: 'pdfa-2u-rt',
      elements: [makeElement('rectangle', { id: 'rect-rt', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2u' });
    const result = await importPdfDocument(bytes);
    const extensions = result.document.extensions;
    const pdfExt = extensions?.['pdf'] as Record<string, unknown> | undefined;
    const pdfa = pdfExt?.['pdfa'] as Record<string, unknown> | undefined;

    expect(pdfa?.['part']).toBe('2');
    expect(pdfa?.['conformance']).toBe('U');
  });
});

describe('PDF CMYK colour emission', () => {
  /**
   * @description When `document.outputIntent.colorSpace === 'cmyk'`,
   * solid-colour fills route through `srgbToDeviceCmyk` and the
   * exporter emits PDF `k` (lowercase = non-stroking CMYK) operators
   * instead of `rg` (RGB) operators. Verifies the colour-space
   * routing wires through end-to-end.
   */
  it('emits CMYK k operators in the decompressed content stream when colorSpace is cmyk', async () => {
    const canvas = makeCanvas({ width: 210, height: 118, unit: 'mm' });
    const doc = makeDocument({
      id: 'cmyk-doc',
      canvas,
      outputIntent: {
        iccProfileAssetId: 'icc-cmyk',
        colorSpace: 'cmyk',
      },
      elements: [
        makeElement('rectangle', {
          id: 'cmyk-rect',
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#ff0000') },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, { pdfaConformance: '2b' });
    const text = bytesToString(bytes);

    expect(text).toContain('/OutputIntents');

    // Decompress every page's content stream and confirm the actual
    // PDF operators include `k` (non-stroking CMYK) — NOT just `rg`
    // (RGB). This proves srgbToDeviceCmyk is wired through the render
    // path, not just declared on the output intent.
    const decoded = await decodePageContentText(bytes);

    expect(decoded).toMatch(/\b\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+k\b/);

    const validation = await validatePdfA2b(bytes);

    expect(validation.valid).toBe(true);
  });

  /**
   * @description The default sRGB document path does NOT route
   * colours through CMYK conversion — the decompressed content stream
   * MUST emit `rg` (non-stroking RGB) operators and contain no `k`
   * operators for solid-colour fills.
   */
  it('emits rg operators (not k) when no CMYK output intent is declared', async () => {
    const doc = makeDocument({
      id: 'rgb-default',
      elements: [
        makeElement('rectangle', {
          id: 'rgb-rect',
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#ff0000') },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const decoded = await decodePageContentText(bytes);

    expect(decoded).toMatch(/\b\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+rg\b/);
    expect(decoded).not.toMatch(/\b\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+k\b/);
  });
});
