import { projectFormatV1 } from '@broadset/model';

import { importPptxProjectV1 } from './import';

interface PptxReconcileResultV1 {
  readonly modifications: readonly projectFormatV1.Id[];
  readonly additions: readonly projectFormatV1.Id[];
  readonly deletions: readonly projectFormatV1.Id[];
  readonly recoveredByHash: readonly projectFormatV1.Id[];
}

const RECONCILED_AT = projectFormatV1.utcTimestampSchema.parse('1970-01-01T00:00:00Z');

function emptyResult(): PptxReconcileResultV1 {
  return { modifications: [], additions: [], deletions: [], recoveredByHash: [] };
}

export async function reconcilePptxProjectV1(input: {
  readonly bytes: Uint8Array;
  readonly maxInputBytes?: number;
  readonly maxPartBytes?: number;
  readonly maxEntries?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxDepth?: number;
}): Promise<PptxReconcileResultV1> {
  try {
    const result = await importPptxProjectV1({
      ...input,
      importedAt: RECONCILED_AT,
    });
    const hasError = result.project.interop.records.some((record) =>
      record.warnings.some(({ severity }) => severity === 'error'),
    );

    if (hasError) return emptyResult();

    return {
      modifications: [],
      additions: result.project.documents.flatMap(({ elements }) => elements.map(({ id }) => id)),
      deletions: [],
      recoveredByHash: [],
    };
  } catch {
    return emptyResult();
  }
}
