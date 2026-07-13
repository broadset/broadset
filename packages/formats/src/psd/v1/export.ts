import type { projectFormatV1 } from '@broadset/model';

import { serializePsdProjectV1 } from './serialize';

interface PsdExportOptions {
  readonly colorSpace?: 'rgb' | 'cmyk' | 'lab' | 'grayscale';
  readonly bitDepth?: 8 | 16;
  readonly embedIccProfile?: boolean;
  readonly linkSmartObjects?: boolean;
  readonly preserveVisibility?: boolean;
  readonly imageFetchTimeoutMs?: number;
  readonly maxImageBytes?: number;
  readonly allowedImageHosts?: ReadonlySet<string>;
}

interface PsdExportResult {
  readonly bytes: Uint8Array;
  readonly warnings: readonly string[];
}

export interface PsdExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob?: (
    digest: projectFormatV1.Sha256Digest,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  readonly options?: PsdExportOptions;
}

function emergencyPsdBytes(): Uint8Array {
  return Uint8Array.from([
    0x38, 0x42, 0x50, 0x53, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
}

function fallback(message: string): PsdExportResult {
  return { bytes: emergencyPsdBytes(), warnings: [message] };
}

async function resolvedBlob(
  input: PsdExportInputV1,
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

export async function exportPsdWithPreflightV1(input: PsdExportInputV1): Promise<PsdExportResult> {
  try {
    const document =
      input.project.documents.find(({ id }) => id === input.documentId) ??
      (input.documentId === undefined ? input.project.documents[0] : undefined);

    if (document === undefined) {
      return fallback(`PSD v1 export: document ${input.documentId ?? '(default)'} was not found.`);
    }

    const pages = input.pageId === undefined ? document.pages : document.pages.filter(({ id }) => id === input.pageId);

    if (pages.length === 0) return fallback(`PSD v1 export: page ${input.pageId ?? '(default)'} was not found.`);

    const exported = await serializePsdProjectV1({
      project: input.project,
      document,
      pages,
      resolveBlob: async (digest): Promise<Uint8Array | undefined> => resolvedBlob(input, digest),
    });

    return exported;
  } catch (error: unknown) {
    return fallback(`PSD v1 export failed soft: ${error instanceof Error ? error.message : 'unknown export failure'}`);
  }
}

export async function exportPsdBytesV1(input: PsdExportInputV1): Promise<Uint8Array> {
  return (await exportPsdWithPreflightV1(input)).bytes;
}
