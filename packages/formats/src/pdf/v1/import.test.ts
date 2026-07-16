import { projectFormatV1 } from '@broadset/model';
import { zlibSync } from 'fflate';
import { jsPDF } from 'jspdf';
import { degrees, PDFDocument, PDFName, PDFRawStream, rgb, StandardFonts } from 'pdf-lib';
import PDFKit from 'pdfkit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TestPdfImportWorkerV1 } from '../import/test-worker';
import { importPdfProjectV1 } from './index';

beforeAll((): void => {
  vi.stubGlobal('Worker', TestPdfImportWorkerV1);
});

afterAll((): void => {
  vi.unstubAllGlobals();
});

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');
const JPEG_1X1 = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=',
    'base64',
  ),
);
const PNG_1X1 = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64'),
);

async function buildTextPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawText('Native PDF text', { x: 20, y: 150, size: 18, font, color: rgb(0.1, 0.2, 0.3) });

  return pdf.save();
}

async function buildVectorPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);

  page.drawRectangle({
    x: 25,
    y: 40,
    width: 80,
    height: 50,
    color: rgb(1, 0, 0),
    borderColor: rgb(0, 0, 1),
    borderWidth: 2,
  });

  return pdf.save();
}

async function buildImagePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const image = await pdf.embedJpg(JPEG_1X1);

  page.drawImage(image, { x: 30, y: 60, width: 90, height: 70 });

  return pdf.save();
}

async function buildPngPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const image = await pdf.embedPng(PNG_1X1);

  page.drawImage(image, { x: 30, y: 60, width: 90, height: 70 });

  return pdf.save();
}

async function buildRepeatedImageUsePdf(repetitions: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const image = await pdf.embedJpg(JPEG_1X1);
  const content = new TextEncoder().encode('/Im0 Do\n'.repeat(repetitions));
  const stream = PDFRawStream.of(pdf.context.obj({ Length: content.byteLength }), content);

  page.node.setXObject(PDFName.of('Im0'), image.ref);
  page.node.set(PDFName.of('Contents'), pdf.context.register(stream));

  return pdf.save({ useObjectStreams: false });
}

async function buildAscii85FlateFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const content = new TextEncoder().encode('BT /F1 12 Tf 1 0 0 1 20 150 Tm (Chained producer text) Tj ET');
  const encoded = ascii85Encode(zlibSync(content));
  const stream = PDFRawStream.of(
    pdf.context.obj({
      Length: encoded.byteLength,
      Filter: [PDFName.of('ASCII85Decode'), PDFName.of('FlateDecode')],
    }),
    encoded,
  );

  page.node.set(PDFName.of('Contents'), pdf.context.register(stream));

  return pdf.save({ useObjectStreams: false });
}

function ascii85Encode(bytes: Uint8Array): Uint8Array {
  let encoded = '';

  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const remaining = Math.min(4, bytes.byteLength - offset);
    let value = 0;

    for (let index = 0; index < 4; index += 1) value = value * 256 + (bytes[offset + index] ?? 0);

    const digits = new Array<number>(5);

    for (let index = 4; index >= 0; index -= 1) {
      digits[index] = value % 85;
      value = Math.floor(value / 85);
    }

    encoded += digits.slice(0, remaining + 1).map((digit) => String.fromCharCode(digit + 33)).join('');
  }

  return new TextEncoder().encode(`${encoded}~>`);
}

function contentElements(result: Awaited<ReturnType<typeof importPdfProjectV1>>): readonly projectFormatV1.Element[] {
  return result.project.documents[0]?.elements.filter(({ parentId }) => parentId !== null) ?? [];
}

function expectValid(result: Awaited<ReturnType<typeof importPdfProjectV1>>): void {
  const structural = projectFormatV1.parseProjectV1Unknown(result.project).diagnostics;

  expect(structural.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

function buildMinimalEncryptedPdf(): Uint8Array {
  const header = '%PDF-1.7\n';
  const catalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pages = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';
  const encryption = '3 0 obj\n<< /Filter /Standard /V 1 /R 2 /O <0000> /U <0000> /P -1 /Length 40 >>\nendobj\n';
  const offset1 = header.length;
  const offset2 = offset1 + catalog.length;
  const offset3 = offset2 + pages.length;
  const xrefOffset = offset3 + encryption.length;
  const pad = (value: number): string => String(value).padStart(10, '0');
  const xref = `xref\n0 4\n0000000000 65535 f \n${pad(offset1)} 00000 n \n${pad(offset2)} 00000 n \n${pad(offset3)} 00000 n \n`;
  const trailer = `trailer\n<< /Size 4 /Root 1 0 R /Encrypt 3 0 R /ID [<00> <00>] >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;

  return new TextEncoder().encode(header + catalog + pages + encryption + xref + trailer);
}

interface PdfKitTestOptions {
  readonly compress?: boolean;
}

function buildPdfKitDocument(
  setup: (document: InstanceType<typeof PDFKit>) => void,
  options: PdfKitTestOptions = {},
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFKit({ size: [300, 200], margin: 0, ...options });

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => {
      resolve(Uint8Array.from(Buffer.concat(chunks)));
    });
    document.on('error', reject);
    setup(document);
    document.end();
  });
}

function buildPdfKitFixture(): Promise<Uint8Array> {
  return buildPdfKitDocument((document) => {
    document.rect(20, 20, 60, 40).fill('#00aa44');
    document.text('PDFKit producer', 30, 100);
  });
}

function buildPdfKitMetadataFixture(): Promise<Uint8Array> {
  return buildPdfKitDocument((document) => {
    document.info.Title = 'Producer metadata';
    document.info.Author = 'Broadset fixture';
    document.info.CreationDate = new Date('2024-06-15T12:30:00Z');
    document.text('Metadata body', 30, 100);
  });
}

function buildPdfKitUncompressedFixture(): Promise<Uint8Array> {
  return buildPdfKitDocument(
    (document) => {
      document.text('Uncompressed body', 30, 100);
    },
    { compress: false },
  );
}

function buildPdfKitMultipageFixture(): Promise<Uint8Array> {
  return buildPdfKitDocument((document) => {
    document.text('First page', 30, 100);
    document.addPage({ size: [400, 250], margin: 0 });
    document.text('Second page', 30, 100);
  });
}

function buildPdfKitOutlineFixture(): Promise<Uint8Array> {
  return buildPdfKitDocument((document) => {
    document.outline.addItem('Chapter 1');
    document.circle(80, 60, 25).fill('#aa0044');
    document.text('Outlined body', 30, 120);
  });
}

function buildJsPdfFixture(): Promise<Uint8Array> {
  const document = new jsPDF({ unit: 'pt', format: [300, 200] });

  document.text('jsPDF producer', 20, 40);

  return Promise.resolve(new Uint8Array(document.output('arraybuffer')));
}

function buildJsPdfMetadataFixture(): Promise<Uint8Array> {
  const document = new jsPDF({ unit: 'pt', format: [300, 200] });

  document.setProperties({
    title: 'jsPDF metadata',
    author: 'Broadset fixture',
    subject: 'Producer oracle',
    keywords: 'pdf, fixture',
    creator: 'Broadset',
  });
  document.text('jsPDF metadata body', 20, 40);

  return Promise.resolve(new Uint8Array(document.output('arraybuffer')));
}

function buildJsPdfMultipageFixture(): Promise<Uint8Array> {
  const document = new jsPDF({ unit: 'pt', format: [300, 200] });

  document.text('jsPDF first page', 20, 40);
  document.addPage();
  document.text('jsPDF second page', 20, 40);

  return Promise.resolve(new Uint8Array(document.output('arraybuffer')));
}

async function buildSplitContentFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const first = new TextEncoder().encode('q 1 0 0 rg 20 20 60 40 re f Q');
  const second = new TextEncoder().encode('q 0 0 1 RG 2 w 100 50 m 180 90 l S Q');
  const firstStream = PDFRawStream.of(pdf.context.obj({ Length: first.byteLength }), first);
  const secondStream = PDFRawStream.of(pdf.context.obj({ Length: second.byteLength }), second);

  page.node.set(
    PDFName.of('Contents'),
    pdf.context.obj([pdf.context.register(firstStream), pdf.context.register(secondStream)]),
  );

  return pdf.save({ useObjectStreams: false });
}

async function buildObjectStreamFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  pdf.setProducer('Mac OS X Quartz PDFContext');
  pdf.addPage([300, 200]).drawText('Object stream body', { x: 20, y: 150, size: 14, font });

  return pdf.save({ useObjectStreams: true });
}

async function buildDimensionBombFixture(): Promise<Uint8Array> {
  const oversizedDimension = 1_000_000_000;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const imageStream = PDFRawStream.of(
    pdf.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: oversizedDimension,
      Height: oversizedDimension,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    }),
    new Uint8Array([0]),
  );
  const content = new TextEncoder().encode('q 10 0 0 10 20 20 cm /Bomb Do Q');
  const contentStream = PDFRawStream.of(pdf.context.obj({ Length: content.byteLength }), content);

  page.node.setXObject(PDFName.of('Bomb'), pdf.context.register(imageStream));
  page.node.set(PDFName.of('Contents'), pdf.context.register(contentStream));

  return pdf.save({ useObjectStreams: false });
}

async function buildEmptyTextPrefixFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 200]);
  const content = new TextEncoder().encode(
    'q 1 0 0 rg BT /F1 12 Tf 1 0 0 1 10 150 Tm () Tj 0 0 1 rg 0.866 0.5 -0.5 0.866 30 100 Tm (Visible) Tj ET Q',
  );
  const stream = PDFRawStream.of(pdf.context.obj({ Length: content.byteLength }), content);

  page.node.set(PDFName.of('Contents'), pdf.context.register(stream));

  return pdf.save({ useObjectStreams: false });
}

describe('importPdfProjectV1', () => {
  it('maps PDF text runs to native v1 text with y-down geometry', async () => {
    const result = await importPdfProjectV1({ bytes: await buildTextPdf(), importedAt: IMPORTED_AT });
    const text = contentElements(result).find(({ kind }) => kind === 'text');
    const baseline = result.project.interop.records.find(({ target }) => target.entityId === text?.id);

    expect(text).toMatchObject({ kind: 'text' });
    expect(baseline?.baselineSemanticHash).toBe(await projectFormatV1.computeCanonicalJsonHashV1(text));
    expect(text?.geometry.transform).toMatchObject({ kind: 'affine2d' });
    expect(text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0]?.text : undefined).toBe('Native PDF text');
    expect(text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0]?.properties.color : undefined).toMatchObject({
      space: 'srgb',
      channels: [0.1, 0.2, 0.3],
    });
    expect(text?.geometry.bounds.width).toBeGreaterThan(0);
    expect(text?.geometry.bounds.height).toBeGreaterThan(0);
    expectValid(result);
  });

  it('maps painted PDF paths to native v1 vector paths and appearance', async () => {
    const result = await importPdfProjectV1({ bytes: await buildVectorPdf(), importedAt: IMPORTED_AT });
    const vector = contentElements(result).find(({ kind }) => kind === 'vector');

    expect(vector).toMatchObject({
      kind: 'vector',
      geometryData: { kind: 'path' },
      appearance: {
        fills: [{ paint: { kind: 'solid', color: { space: 'srgb', channels: [1, 0, 0] } } }],
        strokes: [{ width: 2, paint: { kind: 'solid', color: { space: 'srgb', channels: [0, 0, 1] } } }],
      },
    });
    expect(vector?.geometry.bounds.width).toBeGreaterThan(0);
    expect(vector?.geometry.bounds.height).toBeGreaterThan(0);
    expectValid(result);
  });

  it('extracts encoded JPEG XObjects into v1 image assets', async () => {
    const result = await importPdfProjectV1({ bytes: await buildImagePdf(), importedAt: IMPORTED_AT });
    const image = contentElements(result).find(({ kind }) => kind === 'image');
    const asset = result.project.resources.assets.find(
      ({ id }) => image?.kind === 'image' && image.image.assetId === id,
    );

    expect(image).toMatchObject({ kind: 'image', image: { fit: 'fill' } });
    expect(asset).toMatchObject({ kind: 'image', blob: { mediaType: 'image/jpeg' } });
    expect([...result.blobs.values()]).toContainEqual(JPEG_1X1);
    expectValid(result);
  });

  it('encodes decoded Flate image pixels as a v1 PNG asset', async () => {
    const result = await importPdfProjectV1({ bytes: await buildPngPdf(), importedAt: IMPORTED_AT });
    const image = contentElements(result).find(({ kind }) => kind === 'image');
    const asset = result.project.resources.assets.find(
      ({ id }) => image?.kind === 'image' && image.image.assetId === id,
    );

    expect(asset).toMatchObject({ kind: 'image', blob: { mediaType: 'image/png', source: { kind: 'package' } } });
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).not.toContainEqual(
      expect.objectContaining({ code: 'pdf.image-bytes-unavailable' }),
    );
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pdf.image-transparency-omitted', dimension: 'appearance' }),
    );
    expectValid(result);
  });

  it('caps decoded image dimensions and emits a valid placeholder asset', async () => {
    const result = await importPdfProjectV1({ bytes: await buildDimensionBombFixture(), importedAt: IMPORTED_AT });

    expect(contentElements(result)).toContainEqual(expect.objectContaining({ kind: 'image' }));
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pdf.image-bytes-unavailable', dimension: 'appearance' }),
    );
    expectValid(result);
  });

  it('caps repeated image-use mapping before creating importer promises or elements', async () => {
    const repetitions = 1_100;
    const result = await importPdfProjectV1({
      bytes: await buildRepeatedImageUsePdf(repetitions),
      importedAt: IMPORTED_AT,
    });
    const images = contentElements(result).filter(({ kind }) => kind === 'image');

    expect(images.length).toBeLessThan(repetitions);
    expect(images.length).toBeGreaterThan(0);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pdf.mapped-item-limit', severity: 'warning' }),
    );
    expectValid(result);
  });

  it('keeps text graphics state aligned after an empty Tj operator', async () => {
    const result = await importPdfProjectV1({ bytes: await buildEmptyTextPrefixFixture(), importedAt: IMPORTED_AT });
    const text = contentElements(result).find(({ kind }) => kind === 'text');
    const run = text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0] : undefined;
    const matrix = text?.geometry.transform.kind === 'affine2d' ? text.geometry.transform.matrix : [];

    expect(run?.text).toBe('Visible');
    expect(run?.properties.color).toMatchObject({ channels: [0, 0, 1] });
    expect(Math.abs(matrix[1]) + Math.abs(matrix[2])).toBeGreaterThan(0);
    expectValid(result);
  });

  it('preserves rotated text and image transforms as affine2d matrices', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([300, 200]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const image = await pdf.embedJpg(JPEG_1X1);

    page.drawText('Rotated', { x: 40, y: 120, size: 16, font, rotate: degrees(25) });
    page.drawImage(image, { x: 140, y: 50, width: 80, height: 60, rotate: degrees(30) });

    const result = await importPdfProjectV1({ bytes: await pdf.save(), importedAt: IMPORTED_AT });
    const text = contentElements(result).find(({ kind }) => kind === 'text');
    const mappedImage = contentElements(result).find(({ kind }) => kind === 'image');
    const textMatrix = text?.geometry.transform.kind === 'affine2d' ? text.geometry.transform.matrix : [];
    const imageMatrix =
      mappedImage?.geometry.transform.kind === 'affine2d' ? mappedImage.geometry.transform.matrix : [];

    expect(Math.abs(textMatrix[1]) + Math.abs(textMatrix[2])).toBeGreaterThan(0);
    expect(Math.abs(imageMatrix[1]) + Math.abs(imageMatrix[2])).toBeGreaterThan(0);
    expectValid(result);
  });

  it('preserves the source PDF as a foreign asset and records its interop source', async () => {
    const bytes = await buildTextPdf();
    const result = await importPdfProjectV1({
      bytes,
      fileName: 'source.pdf',
      importedAt: IMPORTED_AT,
    });
    const source = result.project.interop.sources[0];
    const sourceAsset = result.project.resources.assets.find(({ id }) => id === source?.sourceAssetId);

    expect(source).toMatchObject({ format: 'pdf', importedAt: IMPORTED_AT });
    expect(sourceAsset).toMatchObject({ kind: 'foreign', name: 'source.pdf', blob: { mediaType: 'application/pdf' } });
    expect([...result.blobs.values()]).toContainEqual(bytes);
    expectValid(result);
  });

  it('imports only the first page and reports omitted pages', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    pdf.addPage([300, 200]).drawText('First page', { x: 20, y: 150, size: 12, font });
    pdf.addPage([400, 300]).drawText('Second page', { x: 20, y: 250, size: 12, font });

    const result = await importPdfProjectV1({ bytes: await pdf.save(), importedAt: IMPORTED_AT });
    const text = contentElements(result)
      .filter(({ kind }) => kind === 'text')
      .flatMap((element) =>
        element.kind === 'text' ?
          element.text.paragraphs.flatMap(({ runs }) => runs.map(({ text: value }) => value))
        : [],
      );

    expect(text).toContain('First page');
    expect(text).not.toContain('Second page');
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pdf.additional-pages-omitted', severity: 'warning' }),
    );
    expectValid(result);
  });

  it.each([
    ['pdf-lib', buildTextPdf],
    ['pdfkit', buildPdfKitFixture],
    ['pdfkit metadata', buildPdfKitMetadataFixture],
    ['pdfkit uncompressed', buildPdfKitUncompressedFixture],
    ['pdfkit multipage', buildPdfKitMultipageFixture],
    ['pdfkit outline and vector', buildPdfKitOutlineFixture],
    ['jspdf', buildJsPdfFixture],
    ['jspdf metadata', buildJsPdfMetadataFixture],
    ['jspdf multipage', buildJsPdfMultipageFixture],
    ['Acrobat-style split contents', buildSplitContentFixture],
    ['Quartz-style object streams', buildObjectStreamFixture],
    ['ASCII85 and Flate chained content', buildAscii85FlateFixture],
  ])('%s producer fixture reaches zero-error v1 validity', async (_producer, buildFixture) => {
    const result = await importPdfProjectV1({ bytes: await buildFixture(), importedAt: IMPORTED_AT });

    expect(contentElements(result).length).toBeGreaterThan(0);
    expectValid(result);
  });

  it.each([
    ['malformed', new TextEncoder().encode('%PDF-1.7\nnot a valid PDF')],
    ['encrypted', buildMinimalEncryptedPdf()],
  ])('fails soft for %s bytes', async (_case, bytes) => {
    const result = await importPdfProjectV1({ bytes, importedAt: IMPORTED_AT });

    expectValid(result);
    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('fails soft before parsing oversized bytes', async () => {
    const bytes = await buildTextPdf();
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const result = await importPdfProjectV1({ bytes, importedAt: IMPORTED_AT, maxBytes: 1 });

      expectValid(result);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'pdf.input-too-large', severity: 'error' }),
      );

      const source = result.project.interop.sources[0];
      const sourceAsset = result.project.resources.assets.find(({ id }) => id === source?.sourceAssetId);

      expect(sourceAsset?.blob.source).toMatchObject({ kind: 'package' });
      expect([...result.blobs.values()]).toEqual([new Uint8Array()]);
      expect(digest).not.toHaveBeenCalled();
    } finally {
      digest.mockRestore();
    }
  });

  it('returns a complete diagnostic fallback when resource hashing fails', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('digest unavailable'));

    try {
      const result = await importPdfProjectV1({ bytes: await buildTextPdf(), importedAt: IMPORTED_AT });

      expectValid(result);
      expect(result.project.documents).toHaveLength(1);
      expect(result.project.interop.sources).toHaveLength(1);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'pdf.import-failed', severity: 'error' }),
      );
    } finally {
      digest.mockRestore();
    }
  });
});
