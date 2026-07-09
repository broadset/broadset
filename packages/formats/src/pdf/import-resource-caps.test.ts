import { jsPDF } from 'jspdf';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { importPdfDocument } from './import';

function buildJsPdfWithText(): Uint8Array {
  const doc = new jsPDF();

  doc.text('Hello world', 20, 20);

  return new Uint8Array(doc.output('arraybuffer'));
}

async function buildPdfWithSplitContentStreams(): Promise<{
  readonly bytes: Uint8Array;
  readonly firstStreamBytes: number;
}> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const encoder = new TextEncoder();
  const firstBytes = encoder.encode('BT /F1 12 Tf 10 120 Td (First stream) Tj ET');
  const oversizedBytes = encoder.encode(`BT /F1 12 Tf 10 80 Td (Second stream) Tj ET ${' '.repeat(2048)}`);
  const firstStream = PDFRawStream.of(pdf.context.obj({ Length: firstBytes.byteLength }), firstBytes);
  const oversizedStream = PDFRawStream.of(pdf.context.obj({ Length: oversizedBytes.byteLength }), oversizedBytes);

  page.node.set(
    PDFName.of('Contents'),
    pdf.context.obj([pdf.context.register(firstStream), pdf.context.register(oversizedStream)]),
  );

  return {
    bytes: await pdf.save({ useObjectStreams: false }),
    firstStreamBytes: firstBytes.byteLength,
  };
}

/**
 * @description The PDF importer enforces parser-boundary caps so a
 * hostile or malformed PDF cannot exhaust memory before pdf-lib's
 * xref walker fires. Closes the 2026-04-28 production-readiness
 * audit finding "PDF and PSD importers still lack effective
 * parser-boundary caps".
 */
describe('PDF importer — parser-boundary caps', () => {
  /**
   * @description Inputs above the configured byte cap MUST be
   * rejected before pdf-lib's load path runs.
   */
  it('rejects input exceeding maxBytes before parsing', async () => {
    const oversized = new Uint8Array(2 * 1024);

    oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF- header

    const result = await importPdfDocument(oversized, { maxBytes: 1024 });

    expect(result.warnings.some((w) => /maxBytes|byte|cap/i.test(w))).toBe(true);
    expect(result.document.elements.length).toBe(0);
  });

  /**
   * @description Inputs below the configured byte cap MUST proceed
   * to the normal import path so the cap doesn't false-positive on
   * realistic decks.
   */
  it('does not reject input below maxBytes', async () => {
    const tiny = new Uint8Array(64);

    tiny.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF- header

    const result = await importPdfDocument(tiny, { maxBytes: 1024 });

    // The bytes are not a valid PDF, so we expect malformed warning,
    // NOT a byte-cap warning.
    expect(result.warnings.some((w) => /maxBytes|byte cap/i.test(w))).toBe(false);
  });

  /**
   * @description Closes the audit follow-up: the third-party
   * operator-extraction path MUST stop scanning once the cumulative
   * decoded operator-stream bytes exceed `maxOperatorBytes`. The
   * importer MUST surface a structured warning so the user knows the
   * import is partial. We assert the cap fires for a fixture whose
   * decoded content stream exceeds an aggressively small cap; the
   * default cap is 16 MiB so realistic decks never trip this.
   */
  it('emits a warning when the operator-stream byte cap fires', async () => {
    const pdfBytes = buildJsPdfWithText();
    const result = await importPdfDocument(pdfBytes, { maxOperatorBytes: 1 });

    expect(result.warnings.some((w) => /operator.*cap|maxOperatorBytes/i.test(w))).toBe(true);
  });

  /**
   * @description When one page contains multiple content streams, the
   * operator cap MUST keep already-scanned streams and skip the stream
   * that would exceed the budget. This avoids dropping recoverable
   * text from a page because a later stream is huge.
   */
  it('keeps decoded content streams scanned before the operator cap fires', async () => {
    const fixture = await buildPdfWithSplitContentStreams();
    const result = await importPdfDocument(fixture.bytes, {
      maxOperatorBytes: fixture.firstStreamBytes + 1,
    });
    const contents = result.document.elements.map((el) => el.content);

    expect(result.warnings.some((w) => /operator.*cap|maxOperatorBytes/i.test(w))).toBe(true);
    expect(contents).toContain('First stream');
    expect(contents).not.toContain('Second stream');
  });
});
