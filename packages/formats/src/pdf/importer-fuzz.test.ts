import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { importPdfDocument } from './index';

/**
 * Importer fuzz harness. Each test feeds a deliberately malformed
 * byte stream into `importPdfDocument` and asserts the importer
 * produces a clean failure mode (a warning + an empty Broadset
 * document) instead of crashing the host process.
 *
 * The fuzz cases are hand-curated — they encode the failure modes
 * the security-reviewer flagged: malicious /Length entries, recursive
 * xref chains, truncated input, oversized object counts, attacker-
 * controlled binary content. A more exhaustive fuzz harness would
 * use a coverage-guided fuzzer (e.g. fuzzy or jazzer.js) to find
 * unknown failure paths; the curated set is the local stand-in.
 */

describe('Importer fuzz harness — malformed inputs never crash', () => {
  /**
   * @description Empty input MUST be rejected with a "not a PDF"
   * warning, not crash.
   */
  it('handles a zero-byte input', async () => {
    const result = await importPdfDocument(new Uint8Array(0));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Random binary data starting without `%PDF-` MUST be
   * rejected via the header check before pdf-lib touches it.
   */
  it('handles random non-PDF binary input', async () => {
    const garbage = new Uint8Array(1024);

    for (let i = 0; i < garbage.length; i++) {
      garbage[i] = (i * 7) & 0xff;
    }

    const result = await importPdfDocument(garbage);

    expect(result.warnings.find((w) => w.toLowerCase().includes('not'))).toBeDefined();
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A truncated PDF (header + a few bytes) MUST surface
   * a "malformed" warning rather than crash.
   */
  it('handles a truncated PDF (header only)', async () => {
    const truncated = new TextEncoder().encode('%PDF-1.4\n');
    const result = await importPdfDocument(truncated);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.warnings.some((w) => w.toLowerCase().includes('malformed') || w.toLowerCase().includes('failed')),
    ).toBe(true);
  });

  /**
   * @description A PDF with a deliberately false /Length entry on a
   * stream MUST NOT cause a buffer-overrun. The importer accepts
   * what it can decode and reports cleanly otherwise.
   */
  it('handles a stream with a /Length value far larger than the actual bytes', async () => {
    // Minimal PDF skeleton with a stream that lies about /Length.
    const malicious = new TextEncoder().encode(
      [
        '%PDF-1.4',
        '1 0 obj <<>> endobj',
        '2 0 obj <</Type /Catalog /Pages 3 0 R>> endobj',
        '3 0 obj <</Type /Pages /Count 1 /Kids [4 0 R]>> endobj',
        '4 0 obj <</Type /Page /Parent 3 0 R /MediaBox [0 0 100 100] /Contents 5 0 R>> endobj',
        '5 0 obj <</Length 999999>> stream',
        'BT /F1 12 Tf (hi) Tj ET',
        'endstream endobj',
        'xref',
        '0 6',
        '0000000000 65535 f',
        'trailer <</Size 6 /Root 2 0 R>>',
        'startxref 0',
        '%%EOF',
      ].join('\n'),
    );
    const result = await importPdfDocument(malicious);

    // The importer either succeeds with a recovered document or
    // emits a malformed-PDF warning — what it MUST NOT do is throw.
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A PDF whose xref table claims more objects than
   * actually exist MUST not allocate unbounded memory or crash.
   */
  it('handles an xref claiming a wildly oversized object count', async () => {
    const oversized = new TextEncoder().encode(
      [
        '%PDF-1.4',
        '1 0 obj <</Type /Catalog>> endobj',
        'xref',
        // Claim 1 million objects in the xref subsection but only
        // emit one — pdf-lib should reject as malformed.
        '0 1000000',
        '0000000000 65535 f',
        'trailer <</Size 1000000 /Root 1 0 R>>',
        'startxref 9',
        '%%EOF',
      ].join('\n'),
    );
    const result = await importPdfDocument(oversized);

    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Very long /Producer / /Author strings MUST NOT
   * cause an infinite loop or excessive allocation. The importer
   * should accept the strings (PDF spec doesn't bound length) and
   * surface them in metadata as-is.
   */
  it('handles extremely long /Producer info strings', async () => {
    const longString = 'A'.repeat(100_000);
    const long = new TextEncoder().encode(
      [
        '%PDF-1.4',
        '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
        '2 0 obj <</Type /Pages /Count 0 /Kids []>> endobj',
        `3 0 obj <</Producer (${longString})>> endobj`,
        'xref',
        '0 4',
        '0000000000 65535 f',
        `trailer <</Size 4 /Root 1 0 R /Info 3 0 R>>`,
        'startxref 0',
        '%%EOF',
      ].join('\n'),
    );
    const result = await importPdfDocument(long);

    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description A single byte `<` (the start of a hex-string or dict
   * delimiter) MUST not crash the importer.
   */
  it('handles a one-byte input', async () => {
    const result = await importPdfDocument(new Uint8Array([0x3c]));

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.document.canvas).toBeDefined();
  });

  /**
   * @description Pseudo-random bytes that happen to start with
   * `%PDF-` MUST hit pdf-lib's malformed path cleanly.
   */
  it('handles a fake PDF header followed by random bytes', async () => {
    const header = new TextEncoder().encode('%PDF-1.7\n');
    const random = new Uint8Array(2048);

    for (let i = 0; i < random.length; i++) {
      random[i] = (i * 13 + 17) & 0xff;
    }

    const combined = new Uint8Array(header.length + random.length);

    combined.set(header, 0);
    combined.set(random, header.length);

    const result = await importPdfDocument(combined);

    expect(result.document.canvas).toBeDefined();
  });

  it('warns when a page content stream uses an unsupported filter', async () => {
    const result = await importPdfDocument(await buildUnsupportedFilterPdf());

    expect(result.document.canvas).toBeDefined();
    expect(result.warnings.join('\n')).toMatch(/content stream|filter|decode/i);
  });
});

async function buildUnsupportedFilterPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([200, 200]);
  const encoder = new TextEncoder();

  page.drawText('Decodable text', { x: 10, y: 100, size: 12, font });

  const unsupportedStreamBytes = encoder.encode('BT /F1 12 Tf 10 80 Td (Filtered text) Tj ET');
  const unsupportedStream = PDFRawStream.of(
    pdf.context.obj({
      Length: unsupportedStreamBytes.byteLength,
      Filter: PDFName.of('JBIG2Decode'),
    }),
    unsupportedStreamBytes,
  );
  const unsupportedRef = pdf.context.register(unsupportedStream);
  const existingContents = page.node.Contents();

  if (existingContents === undefined) throw new Error('expected drawText to create a content stream');

  const contentEntries =
    existingContents instanceof PDFArray ?
      Array.from({ length: existingContents.size() }, (_, index) => existingContents.get(index))
    : [existingContents];

  page.node.set(PDFName.of('Contents'), pdf.context.obj([...contentEntries, unsupportedRef]));

  return pdf.save({ useObjectStreams: false });
}
