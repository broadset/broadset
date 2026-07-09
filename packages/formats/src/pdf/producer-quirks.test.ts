import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { importPdfDocument } from './index';

/**
 * Producer-quirk fixture suite. Real-world PDFs from Illustrator,
 * Acrobat, InDesign, Figma, macOS Preview, Microsoft Word, and
 * pdflatex carry idiosyncratic shapes that the in-tree importer must
 * tolerate. Each test programmatically synthesises one such quirk
 * and asserts the importer either produces a valid Broadset document
 * or surfaces a clean warning — never crashes, never silently drops.
 *
 * This suite is the local stand-in for committing real third-party
 * fixtures (which require licensing diligence and storage budget).
 * It captures the structural quirks the audit called out — split
 * /Contents arrays, missing trailer ID, /Producer-driven dispatch,
 * non-Latin /Producer strings, stripped XMP packets — without binding
 * the test suite to vendor binaries.
 */

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

async function buildBasicPdf(): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([200, 200]);

  page.drawText('Hello', { x: 10, y: 100, size: 16, font });

  return pdf;
}

describe('Producer-quirk fixtures — third-party PDF emulation', () => {
  /**
   * @description Acrobat (and many other producers) emit a `/Contents`
   * array with multiple stream refs per page rather than a single
   * stream. The importer MUST handle this without losing operators
   * or crashing.
   */
  it('imports a PDF whose page /Contents is a multi-stream array (Acrobat-style)', async () => {
    const pdf = await buildBasicPdf();
    const [page] = pdf.getPages();

    if (page === undefined) throw new Error('expected a page');

    // Append a second content stream containing a no-op `q ... Q`
    // bracket so the page now has TWO content streams in an array.
    const secondStream = PDFRawStream.of(
      pdf.context.obj({ Length: 4 }),
      new TextEncoder().encode('q\nQ\n'),
    );
    const secondRef = pdf.context.register(secondStream);
    const existingContents = page.node.Contents();

    page.node.set(
      PDFName.of('Contents'),
      pdf.context.obj([existingContents, secondRef]),
    );

    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await importPdfDocument(bytes);

    // Importer accepts the doc and surfaces no fatal warning about the
    // /Contents array shape.
    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Microsoft Word's "Save As PDF" path historically emits
   * documents WITHOUT a trailer `/ID` array. PDF/A requires the array
   * but the importer must still accept the doc as importable input.
   */
  it('imports a PDF without a trailer /ID array (Word-style)', async () => {
    const pdf = await buildBasicPdf();

    // Force-strip the trailer ID by replacing it with undefined post-flush.
    await pdf.flush();

    const trailerInfo = pdf.context.trailerInfo as Record<string, unknown>;

    delete trailerInfo['ID'];

    const bytes = await pdf.save({ useObjectStreams: false });
    const text = bytesToString(bytes);

    // Sanity check: the bytes must NOT carry a trailer ID.
    expect(text).not.toMatch(/trailer[\s\S]*?\/ID\s*\[/);

    const result = await importPdfDocument(bytes);

    expect(result.document.elements).toBeDefined();
    expect(result.warnings.find((w) => w.toLowerCase().includes('failed'))).toBeUndefined();
  });

  /**
   * @description pdflatex emits a `/Producer (LaTeX with hyperref ...)`
   * info dictionary entry. Our importer should never branch on the
   * producer string for security reasons (it's attacker-controllable),
   * but it MUST tolerate non-ASCII / unusual producer strings.
   */
  it('imports a PDF with a non-Latin1 /Producer info entry (pdflatex-style)', async () => {
    const pdf = await buildBasicPdf();

    pdf.setProducer('LaTeX with hyperref — résumé builder');
    pdf.setCreator('XeTeX 0.999998');
    pdf.setTitle('Émile Müller — Résumé');

    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await importPdfDocument(bytes);

    // Importer accepts the doc with no failure warnings.
    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description Figma "Export to PDF" produces documents with the
   * standard PDF structure but no `broadset:` XMP packet. The third-
   * party operator-extraction path handles these; the importer MUST
   * surface the appropriate "no XMP" warning rather than a crash.
   */
  it('imports a PDF with no broadset: XMP packet (Figma-style) via the third-party path', async () => {
    const pdf = await buildBasicPdf();
    const bytes = await pdf.save({ useObjectStreams: false });
    const result = await importPdfDocument(bytes);

    // The third-party path produces a partial-coverage warning and
    // recovers what text it can. No fatal failure.
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.find((w) => w.toLowerCase().includes('xmp'))).toBeDefined();
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Illustrator and InDesign sometimes embed a `/Producer
   * (Adobe Illustrator 28.0 (Macintosh))` info entry plus heavy
   * compression. The importer MUST handle a fully-flate-compressed
   * content stream without falling back to the failure path.
   */
  it('imports a PDF whose page content stream is FlateDecode-compressed (Illustrator-style)', async () => {
    const pdf = await buildBasicPdf();

    pdf.setProducer('Adobe Illustrator 28.0 (Macintosh)');
    pdf.setCreator('Adobe Illustrator');

    // pdf-lib already FlateDecodes content streams by default;
    // verifying the bytes start with the PDF header confirms a real
    // PDF was produced and the importer can parse it.
    const bytes = await pdf.save({ useObjectStreams: false });

    expect(bytes[0]).toBe(0x25);
    expect(bytes[1]).toBe(0x50);

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description macOS Preview / Quartz emits PDFs with a `/Producer
   * (Mac OS X 14.6.1 Quartz PDFContext)` entry. These often have
   * unusual but valid combinations of compressed object streams +
   * named resource dicts. The importer MUST accept them.
   */
  it('imports a PDF with object streams enabled (macOS Preview-style)', async () => {
    const pdf = await buildBasicPdf();

    pdf.setProducer('Mac OS X 14.6.1 Quartz PDFContext');

    // useObjectStreams: true packs metadata into compressed object
    // streams — the format Preview emits by default.
    const bytes = await pdf.save({ useObjectStreams: true });
    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
    expect(result.document.canvas).toBeDefined();
  });
});
