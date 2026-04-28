import { jsPDF } from 'jspdf';
import PDFKit from 'pdfkit';
import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument } from './index';

/**
 * Cross-producer feature coverage. Each test exercises a real-world
 * PDF producer (pdfkit MIT, jsPDF MIT) emitting bytes through their
 * own pipelines, then asserts the broadset importer handles the
 * producer-specific quirks correctly. This complements the
 * `producer-quirks.test.ts` suite (which uses pdf-lib to synthesise
 * structural variants) by exercising real third-party producer
 * pipelines end-to-end.
 *
 * Producer matrix exercised:
 *  - **pdfkit** (MIT) — PDF 1.3, indirect-string /Producer, FlateDecode
 *    content streams, /Names entry on catalog.
 *  - **jsPDF** (MIT) — PDF 1.3, uncompressed content streams, unusual
 *    transformation matrices (0.567... user-unit scaling), inline
 *    /Producer string, no /Names entry.
 */

interface PdfKitInfo {
  readonly Producer?: string;
  readonly Creator?: string;
  readonly Title?: string;
  readonly Author?: string;
  readonly Subject?: string;
  readonly Keywords?: string;
  readonly CreationDate?: Date;
  readonly ModDate?: Date;
}

interface PdfKitOptions {
  readonly info?: PdfKitInfo;
  readonly compress?: boolean;
}

function buildPdfKitDoc(setup: (doc: InstanceType<typeof PDFKit>) => void, options?: PdfKitOptions): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFKit(options);

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => { resolve(new Uint8Array(Buffer.concat(chunks))); });
    doc.on('error', reject);

    setup(doc);
    doc.end();
  });
}

function buildJsPdfDoc(setup: (doc: jsPDF) => void): Uint8Array {
  // Static import paired with a minimal `jsPDF` declaration in
  // `_shared/text-layout/text-layout.types.d.ts` so the dev-only
  // dependency is visible to `knip` without an `ignoreDependencies`
  // suppression.
  const doc = new jsPDF();

  setup(doc);

  return new Uint8Array(doc.output('arraybuffer'));
}

describe('Cross-producer feature coverage — pdfkit', () => {
  /**
   * @description pdfkit's `info.CreationDate` / `info.ModDate` produce
   * PDF date strings in the format `D:YYYYMMDDHHmmSSZ`. The importer
   * MUST tolerate the standard date-string shape — many third-party
   * editors carry these.
   */
  it('imports pdfkit PDFs with standard PDF date metadata', async () => {
    const bytes = await buildPdfKitDoc((doc) => {
      doc.info.CreationDate = new Date('2024-06-15T12:30:00Z');
      doc.info.ModDate = new Date('2024-06-16T08:15:00Z');
      doc.text('Document with date metadata', 50, 50);
    });

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description pdfkit's `info.Subject` and `info.Keywords` fields
   * round-trip into the `/Info` dict. The importer MUST accept these
   * even though Broadset doesn't currently surface them as
   * first-class fields.
   */
  it('imports pdfkit PDFs with Subject and Keywords metadata', async () => {
    const bytes = await buildPdfKitDoc((doc) => {
      doc.info.Subject = 'Brand guidelines 2024';
      doc.info.Keywords = 'brand, identity, guidelines';
      doc.text('Branding doc', 50, 50);
    });

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description pdfkit can disable content-stream compression (the
   * `compress: false` flag). Some legacy producers do this. Importer
   * MUST handle uncompressed content streams identically.
   */
  it('imports pdfkit PDFs with uncompressed content streams (compress: false)', async () => {
    const bytes = await buildPdfKitDoc(
      (doc) => {
        doc.text('Uncompressed body', 50, 50);
      },
      { compress: false },
    );

    const result = await importPdfDocument(bytes);
    const text = new TextDecoder('latin1').decode(bytes);

    // Sanity: the bytes should NOT carry FlateDecode for content streams.
    expect(text).not.toMatch(/\/Filter\s+\/FlateDecode/);
    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description pdfkit lets producers draw on the page coordinate
   * system using bottom-left or top-left origin. The importer MUST
   * recover sensible canvas dimensions regardless.
   */
  it('imports pdfkit PDFs whose first page has long, narrow dimensions', async () => {
    const bytes = await buildPdfKitDoc((doc) => {
      // Custom narrow page (banner aspect).
      doc.addPage({ size: [800, 200] });
      doc.text('Banner content', 20, 20);
    });

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
    expect(result.document.canvas.width).toBeGreaterThan(0);
  });
});

describe('Cross-producer feature coverage — jsPDF', () => {
  /**
   * @description jsPDF emits PDF 1.3 with uncompressed text streams,
   * unusual transformation matrices (0.567 user-unit scaling, decimal
   * coordinates with many trailing digits), and /Producer "(jsPDF
   * X.Y.Z)". The importer MUST recover the document without crashes.
   */
  it('imports a jsPDF-generated PDF (different producer + content-stream encoding)', async () => {
    const bytes = buildJsPdfDoc((doc) => {
      doc.text('Hello from jsPDF', 20, 20);
    });
    const text = new TextDecoder('latin1').decode(bytes);

    // Sanity: jsPDF marks its own producer string.
    expect(text).toContain('jsPDF');

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description Multi-page jsPDF documents exercise the same code
   * paths as multi-page documents from any other producer. Verify
   * the importer handles them.
   */
  it('imports multi-page jsPDF documents', async () => {
    const bytes = buildJsPdfDoc((doc) => {
      doc.text('Page 1', 20, 20);
      doc.addPage();
      doc.text('Page 2', 20, 20);
    });

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });

  /**
   * @description jsPDF lets producers set arbitrary `/Info` properties
   * via setProperties. Verify Title / Author / Creator / Producer /
   * Subject / Keywords all survive without making the importer fail.
   */
  it('imports jsPDF PDFs with all standard /Info properties set', async () => {
    const bytes = buildJsPdfDoc((doc) => {
      doc.setProperties({
        title: 'jsPDF Test Document',
        subject: 'Cross-producer fixture',
        author: 'Broadset test suite',
        keywords: 'jspdf, test, fixture',
        creator: 'broadset CT harness',
      });
      doc.text('Document body', 20, 20);
    });

    const result = await importPdfDocument(bytes);

    expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
  });
});

describe('Cross-producer chain round-trip — jsPDF → broadset → broadset', () => {
  /**
   * @description End-to-end chain across DIFFERENT producers: a jsPDF
   * source PDF (PDF 1.3, no FlateDecode, unusual matrices) is
   * imported into Broadset, then re-exported via the pdf-lib
   * exporter (PDF 1.7, FlateDecode, broadset: XMP). The re-export
   * MUST be a valid PDF that re-imports cleanly — verifies the
   * importer's output document is stable enough to re-feed through
   * the export pipeline regardless of source producer.
   */
  it('imports a jsPDF document and re-exports it via Broadset', async () => {
    const sourceBytes = buildJsPdfDoc((doc) => {
      doc.setProperties({
        title: 'Cross-producer chain test',
        creator: 'jsPDF',
      });
      doc.text('Round-trip across producers', 20, 20);
    });
    const firstImport = await importPdfDocument(sourceBytes);
    const reExportedBytes = await exportPdfBytes(firstImport.document);
    const secondImport = await importPdfDocument(reExportedBytes);

    expect(reExportedBytes.length).toBeGreaterThan(100);
    expect(secondImport.warnings.find((w) => w.includes('failed'))).toBeUndefined();

    // Re-export now carries the broadset: XMP packet; second import
    // takes the fast path via XMP rather than the third-party
    // operator-extraction path.
    const reExportedText = new TextDecoder('latin1').decode(reExportedBytes);

    expect(reExportedText).toContain('broadset:');
  });
});
