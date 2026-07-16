import type { projectFormatV1 } from '@broadset/model';
import { PDFDocument } from 'pdf-lib';

import { serializePdfProjectV1 } from './serialize';

interface PdfExportOptionsV1 {
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly fontFetchTimeoutMs?: number | undefined;
  readonly fontMaxBytes?: number | undefined;
  readonly fontBytesByFamily?: ReadonlyMap<string, Uint8Array> | undefined;
  readonly subsetFonts?: boolean | undefined;
  readonly emitOcgs?: boolean | undefined;
  readonly colorSpace?: 'rgb' | 'cmyk' | 'spot' | undefined;
  readonly pdfaConformance?: '2b' | '2u' | '2a' | undefined;
  readonly assets?: readonly projectFormatV1.Asset[] | undefined;
}

interface PdfExportResultV1 {
  readonly bytes: Uint8Array;
  readonly warnings: readonly string[];
}

export interface PdfExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob?: (
    digest: projectFormatV1.Sha256Digest,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  readonly options?: PdfExportOptionsV1;
}

function emergencyPdfBytes(): Uint8Array {
  const header = '%PDF-1.4\n';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] >>\nendobj\n',
  ];
  const offsets: number[] = [];
  let body = header;

  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }

  const xrefOffset = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  const xref = `xref\n0 4\n0000000000 65535 f \n${entries}`;
  const trailer = `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;

  return new TextEncoder().encode(body + xref + trailer);
}

async function fallback(message: string): Promise<PdfExportResultV1> {
  try {
    const pdf = await PDFDocument.create();

    pdf.addPage([1, 1]);

    return { bytes: await pdf.save({ useObjectStreams: false }), warnings: [message] };
  } catch {
    return { bytes: emergencyPdfBytes(), warnings: [message] };
  }
}

async function resolveBlobBytes(
  input: PdfExportInputV1,
  digest: projectFormatV1.Sha256Digest,
): Promise<Uint8Array | undefined> {
  const local = input.blobs?.get(digest);

  if (local !== undefined) return local;
  if (input.resolveBlob === undefined) return undefined;

  try {
    return await input.resolveBlob(digest);
  } catch {
    return undefined;
  }
}

export async function exportPdfWithPreflightV1(input: PdfExportInputV1): Promise<PdfExportResultV1> {
  try {
    const document =
      input.project.documents.find(({ id }) => id === input.documentId) ??
      (input.documentId === undefined ? input.project.documents[0] : undefined);

    if (document === undefined) {
      return await fallback(`PDF v1 export: document ${input.documentId ?? '(default)'} was not found.`);
    }

    const page =
      document.pages.find(({ id }) => id === input.pageId) ??
      (input.pageId === undefined ? document.pages[0] : undefined);

    if (page === undefined) return await fallback(`PDF v1 export: page ${input.pageId ?? '(default)'} was not found.`);

    return await serializePdfProjectV1({
      project: input.project,
      document,
      page,
      resolveBlob: async (digest): Promise<Uint8Array | undefined> => resolveBlobBytes(input, digest),
      options: input.options ?? {},
    });
  } catch (error: unknown) {
    return await fallback(
      `PDF v1 export failed soft: ${error instanceof Error ? error.message : 'unknown export failure'}`,
    );
  }
}

export async function exportPdfBytesV1(input: PdfExportInputV1): Promise<Uint8Array> {
  return (await exportPdfWithPreflightV1(input)).bytes;
}
