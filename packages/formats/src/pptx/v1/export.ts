import { createEmptyBroadsetDocument, type FontAsset, fontAsset, type projectFormatV1 } from '@broadset/model';

import { exportPptxWithReport, exportPptxWithReportAsync } from '../export';
import type { PptxExportOptions, PptxExportReport, PptxExportWarning } from '../types';
import { toLegacyPptxDocumentV1 } from './to-legacy-document';

export interface PptxExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob?: (
    digest: projectFormatV1.Sha256Digest,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  readonly options?: PptxExportOptions;
}

function exportWarning(message: string): PptxExportWarning {
  return { code: 'v1-adapter-loss', message };
}

function fallback(message: string): PptxExportReport {
  try {
    const result = exportPptxWithReport(createEmptyBroadsetDocument(), {
      preserveBroadsetMetadata: false,
      includeInteropLedger: false,
      exportedAt: 0,
    });

    return { bytes: result.bytes, warnings: [exportWarning(message), ...result.warnings] };
  } catch {
    return { bytes: new Uint8Array(), warnings: [exportWarning(message)] };
  }
}

async function resolveBlobBytes(
  input: PptxExportInputV1,
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

  bytes.forEach((byte: number): void => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mediaType};base64,${btoa(binary)}`;
}

function legacyFontFormat(
  format: projectFormatV1.FontAsset['metadata']['format'],
): 'woff2' | 'ttf' | 'otf' | undefined {
  if (format === 'woff2') return 'woff2';
  if (format === 'truetype') return 'ttf';
  if (format === 'opentype') return 'otf';

  return undefined;
}

function legacyFontWeight(value: number): 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 {
  const rounded = Math.min(900, Math.max(100, Math.round(value / 100) * 100));

  if (rounded === 100) return 100;
  if (rounded === 200) return 200;
  if (rounded === 300) return 300;
  if (rounded === 500) return 500;
  if (rounded === 600) return 600;
  if (rounded === 700) return 700;
  if (rounded === 800) return 800;
  if (rounded === 900) return 900;

  return 400;
}

async function embeddedFonts(input: PptxExportInputV1): Promise<{
  readonly assets: readonly FontAsset[];
  readonly warnings: readonly PptxExportWarning[];
}> {
  const assets: FontAsset[] = [];
  const warnings: PptxExportWarning[] = [];

  for (const asset of input.project.resources.assets) {
    if (asset.kind !== 'font') continue;

    const format = legacyFontFormat(asset.metadata.format);

    if (format === undefined) {
      warnings.push(
        exportWarning(`PPTX v1 export: font ${asset.name} uses unsupported format ${asset.metadata.format}.`),
      );
      continue;
    }

    if (asset.metadata.embeddingPermissions === 'restricted') {
      warnings.push(exportWarning(`PPTX v1 export: restricted font ${asset.name} was not embedded.`));
      continue;
    }

    const bytes = await resolveBlobBytes(input, asset.blob.digest);

    if (bytes === undefined) {
      warnings.push(exportWarning(`PPTX v1 export: font blob ${asset.blob.digest} is unavailable.`));
      continue;
    }

    assets.push(
      fontAsset({
        id: asset.id,
        name: asset.name,
        mimeType: asset.blob.mediaType,
        source: { type: 'embedded', dataUri: bytesToDataUri(bytes, asset.blob.mediaType) },
        format,
        postScriptName: asset.metadata.postScriptName,
        familyName: asset.metadata.family,
        weight: legacyFontWeight(asset.metadata.weight),
        italic: asset.metadata.style !== 'normal',
        subsetRanges: asset.metadata.unicodeCoverage.map(({ start, end }) => ({ start, end })),
        fileSizeBytes: bytes.byteLength,
      }),
    );
  }

  return { assets, warnings };
}

export async function exportPptxWithReportV1(input: PptxExportInputV1): Promise<PptxExportReport> {
  try {
    const document =
      input.project.documents.find(({ id }) => id === input.documentId) ??
      (input.documentId === undefined ? input.project.documents[0] : undefined);

    if (document === undefined) {
      return fallback(`PPTX v1 export: document ${input.documentId ?? '(default)'} was not found.`);
    }

    if (document.surface.size.some((value) => !Number.isFinite(value) || value <= 0)) {
      return fallback('PPTX v1 export failed soft: the selected surface size is invalid.');
    }

    const pages = input.pageId === undefined ? document.pages : document.pages.filter(({ id }) => id === input.pageId);

    if (pages.length === 0) return fallback(`PPTX v1 export: page ${input.pageId ?? '(default)'} was not found.`);

    const mapped = await toLegacyPptxDocumentV1({
      project: input.project,
      document,
      pages,
      blobs: input.blobs ?? new Map(),
      resolveBlob: async (digest): Promise<Uint8Array | undefined> => resolveBlobBytes(input, digest),
    });
    const fonts = await embeddedFonts(input);
    const report = await exportPptxWithReportAsync(mapped.document, {
      ...input.options,
      fontAssets: [...fonts.assets, ...(input.options?.fontAssets ?? [])],
    });

    return {
      bytes: report.bytes,
      warnings: [...mapped.warnings.map(exportWarning), ...fonts.warnings, ...report.warnings],
    };
  } catch (error: unknown) {
    return fallback(`PPTX v1 export failed soft: ${error instanceof Error ? error.message : 'unknown export failure'}`);
  }
}

export async function exportPptxBytesV1(input: PptxExportInputV1): Promise<Uint8Array> {
  return (await exportPptxWithReportV1(input)).bytes;
}
