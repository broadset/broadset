import { projectFormatV1 } from '@broadset/model';

import { reconcilePptx } from '../reconcile';
import type { PptxImportOptions } from '../types';

export interface PptxReconcileResultV1 {
  readonly modifications: readonly projectFormatV1.Id[];
  readonly additions: readonly projectFormatV1.Id[];
  readonly deletions: readonly projectFormatV1.Id[];
  readonly recoveredByHash: readonly projectFormatV1.Id[];
}

function emptyResult(): PptxReconcileResultV1 {
  return { modifications: [], additions: [], deletions: [], recoveredByHash: [] };
}

function ids(sourceIds: readonly string[]): readonly projectFormatV1.Id[] {
  return sourceIds.map((sourceId, index) =>
    projectFormatV1.idSchema.parse(`pptx-reconcile-${String(index + 1)}-${sourceId}`),
  );
}

export async function reconcilePptxProjectV1(input: {
  readonly bytes: Uint8Array;
  readonly maxInputBytes?: number;
  readonly maxPartBytes?: number;
  readonly maxEntries?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxDepth?: number;
}): Promise<PptxReconcileResultV1> {
  const options: PptxImportOptions = {
    ...(input.maxInputBytes === undefined ? {} : { maxInputBytes: input.maxInputBytes }),
    ...(input.maxPartBytes === undefined ? {} : { maxPartBytes: input.maxPartBytes }),
    ...(input.maxEntries === undefined ? {} : { maxEntries: input.maxEntries }),
    ...(input.maxTotalUncompressedBytes === undefined ?
      {}
    : { maxTotalUncompressedBytes: input.maxTotalUncompressedBytes }),
    ...(input.maxDepth === undefined ? {} : { maxDepth: input.maxDepth }),
  };

  try {
    const result = await reconcilePptx(input.bytes, options);

    return {
      modifications: ids(result.modifications.map(({ elementId }) => elementId)),
      additions: ids(result.additions.map(({ id }) => id)),
      deletions: ids(result.deletions.map(({ id }) => id)),
      recoveredByHash: ids(result.recoveredByHash.map(({ currentElement }) => currentElement.id)),
    };
  } catch {
    return emptyResult();
  }
}
