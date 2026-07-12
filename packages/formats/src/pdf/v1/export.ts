import type { projectFormatV1 } from '@broadset/model';
import { iccProfileAsset } from '@broadset/model';
import { PDFDocument } from 'pdf-lib';

import { exportPdfWithPreflight } from '../core';
import { normalizeFontFamily } from '../fonts';
import type { PdfExportOptions, PdfExportResult } from '../types';
import { toLegacyPdfDocumentV1 } from './to-legacy-document';

export interface PdfExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob?: (
    digest: projectFormatV1.Sha256Digest,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  readonly options?: PdfExportOptions;
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

async function fallback(message: string): Promise<PdfExportResult> {
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

function bytesToDataUri(bytes: Uint8Array, mediaType: string): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return `data:${mediaType};base64,${btoa(binary)}`;
}

function legacyIccColorSpace(value: string): 'rgb' | 'cmyk' | 'gray' | 'lab' {
  const normalized = value.toLowerCase();

  if (normalized.includes('cmyk')) return 'cmyk';
  if (normalized.includes('gray')) return 'gray';
  if (normalized.includes('lab')) return 'lab';

  return 'rgb';
}

async function fontBytesByFamily(input: PdfExportInputV1): Promise<ReadonlyMap<string, Uint8Array>> {
  const fonts = new Map<string, Uint8Array>();

  for (const family of input.project.resources.fonts) {
    const assetFace = family.faces.find(({ source }) => source.kind === 'asset');

    if (assetFace?.source.kind !== 'asset') continue;

    const assetId = assetFace.source.assetId;
    const asset = input.project.resources.assets.find(
      (candidate) => candidate.id === assetId && candidate.kind === 'font',
    );

    if (asset?.kind !== 'font') continue;

    const bytes = await resolveBlobBytes(input, asset.blob.digest);

    if (bytes !== undefined) fonts.set(normalizeFontFamily(family.familyName), bytes);
  }

  return fonts;
}

async function legacyIccAssets(input: PdfExportInputV1): Promise<{
  readonly assets: readonly ReturnType<typeof iccProfileAsset>[];
  readonly warnings: readonly string[];
}> {
  const assets: ReturnType<typeof iccProfileAsset>[] = [];
  const warnings: string[] = [];

  for (const asset of input.project.resources.assets) {
    if (asset.kind !== 'icc-profile') continue;

    const bytes = await resolveBlobBytes(input, asset.blob.digest);

    if (bytes === undefined) {
      warnings.push(`PDF v1 export: ICC profile blob ${asset.blob.digest} is unavailable.`);
      continue;
    }

    assets.push(
      iccProfileAsset({
        id: asset.id,
        name: asset.name,
        mimeType: asset.blob.mediaType,
        source: { type: 'embedded', dataUri: bytesToDataUri(bytes, asset.blob.mediaType) },
        colorSpace: legacyIccColorSpace(asset.metadata.colorSpace),
        description: asset.metadata.description,
        identifier: asset.metadata.identifier,
        fileSizeBytes: bytes.byteLength,
      }),
    );
  }

  return { assets, warnings };
}

export async function exportPdfWithPreflightV1(input: PdfExportInputV1): Promise<PdfExportResult> {
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

    const mapped = await toLegacyPdfDocumentV1({
      project: input.project,
      document,
      page,
      blobs: input.blobs ?? new Map(),
      resolveBlob:
        input.resolveBlob === undefined ?
          undefined
        : async (digest): Promise<Uint8Array | undefined> => input.resolveBlob?.(digest),
    });
    const embeddedFonts = await fontBytesByFamily(input);
    const configuredFonts = new Map(embeddedFonts);

    for (const [family, bytes] of input.options?.fontBytesByFamily ?? []) configuredFonts.set(family, bytes);

    const icc = await legacyIccAssets(input);

    const exported = await exportPdfWithPreflight(mapped.document, {
      ...input.options,
      fontBytesByFamily: configuredFonts,
      assets: [...icc.assets, ...(input.options?.assets ?? [])],
    });

    return {
      bytes: exported.bytes,
      warnings: [...mapped.warnings, ...icc.warnings, ...exported.warnings],
    };
  } catch (error: unknown) {
    return await fallback(
      `PDF v1 export failed soft: ${error instanceof Error ? error.message : 'unknown export failure'}`,
    );
  }
}

export async function exportPdfBytesV1(input: PdfExportInputV1): Promise<Uint8Array> {
  return (await exportPdfWithPreflightV1(input)).bytes;
}
