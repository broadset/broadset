import { projectFormatV1 } from '@broadset/model';

import { type SerializedPptxProjectV1, serializePptxProjectV1 } from './serialize-package';
import type { PptxV1SerializeWarning } from './serialize-shapes';

interface PptxExportOptionsV1 {
  readonly exportedAt?: number;
}

export interface PptxExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob?: (
    digest: projectFormatV1.Sha256Digest,
  ) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  readonly options?: PptxExportOptionsV1;
}

interface PptxExportReportV1 {
  readonly bytes: Uint8Array;
  readonly warnings: readonly PptxV1SerializeWarning[];
}

function exportWarning(message: string): PptxV1SerializeWarning {
  return { code: 'v1-adapter-loss', message };
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

async function fallback(message: string): Promise<PptxExportReportV1> {
  try {
    const document = projectFormatV1.createDocumentV1({
      id: projectFormatV1.idSchema.parse('pptx-fallback-document'),
      name: 'PPTX export fallback',
      pages: [
        projectFormatV1.createPageV1({
          id: projectFormatV1.idSchema.parse('pptx-fallback-page'),
          name: 'Fallback',
        }),
      ],
    });
    const project = projectFormatV1.createProjectV1({ documents: [document] });
    const result = await serializePptxProjectV1({
      project,
      document,
      pages: document.pages,
      resolveBlob: (): Promise<undefined> => Promise.resolve(undefined),
      exportedAt: 0,
    });

    return { bytes: result.bytes, warnings: [exportWarning(message), ...result.warnings] };
  } catch {
    return { bytes: new Uint8Array(), warnings: [exportWarning(message)] };
  }
}

function selectedDocument(input: PptxExportInputV1): projectFormatV1.BroadsetDocumentV1 | undefined {
  return (
    input.project.documents.find(({ id }) => id === input.documentId) ??
    (input.documentId === undefined ? input.project.documents[0] : undefined)
  );
}

function selectedPages(
  input: PptxExportInputV1,
  document: projectFormatV1.BroadsetDocumentV1,
): readonly projectFormatV1.PageDefinition[] {
  return input.pageId === undefined ? document.pages : document.pages.filter(({ id }) => id === input.pageId);
}

export async function exportPptxWithReportV1(input: PptxExportInputV1): Promise<PptxExportReportV1> {
  try {
    const document = selectedDocument(input);

    if (document === undefined) {
      return await fallback(`PPTX v1 export: document ${input.documentId ?? '(default)'} was not found.`);
    }

    if (document.surface.size.some((value) => !Number.isFinite(value) || value <= 0)) {
      return await fallback('PPTX v1 export failed soft: the selected surface size is invalid.');
    }

    const pages = selectedPages(input, document);

    if (pages.length === 0) {
      return await fallback(`PPTX v1 export: page ${input.pageId ?? '(default)'} was not found.`);
    }

    const result: SerializedPptxProjectV1 = await serializePptxProjectV1({
      project: input.project,
      document,
      pages,
      resolveBlob: (digest): Promise<Uint8Array | undefined> => resolveBlobBytes(input, digest),
      exportedAt: input.options?.exportedAt ?? 0,
    });

    return result;
  } catch (error: unknown) {
    return await fallback(
      `PPTX v1 export failed soft: ${error instanceof Error ? error.message : 'unknown export failure'}`,
    );
  }
}

export async function exportPptxBytesV1(input: PptxExportInputV1): Promise<Uint8Array> {
  return (await exportPptxWithReportV1(input)).bytes;
}
