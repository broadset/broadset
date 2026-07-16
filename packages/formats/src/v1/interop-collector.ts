import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

const UNKNOWN_VALUE = 'unknown';

function nonEmptyValue(value: string): string {
  return value.trim().length === 0 ? UNKNOWN_VALUE : value;
}

function normalizedConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export interface InteropCollectorV1 {
  addSource(input: {
    readonly format: string;
    readonly sourceAssetId: ProjectFormatV1.Id;
    readonly importerVersion: string;
    readonly importedAt: ProjectFormatV1.UtcTimestamp;
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id;
  addRecord(input: {
    readonly sourceId: ProjectFormatV1.Id;
    readonly target: ProjectFormatV1.EntityAddress;
    readonly baselineSemanticHash: ProjectFormatV1.Sha256Digest;
    readonly mappingConfidence: number;
    readonly editability: 'native' | 'partial' | 'appearance-only';
    readonly warnings?: readonly ProjectFormatV1.InteropDiagnostic[];
    readonly preservedBlob?: ProjectFormatV1.BlobReference;
    readonly previewAssetId?: ProjectFormatV1.Id;
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id;
  build(): ProjectFormatV1.InteropRegistry;
}

export function createInteropCollectorV1(): InteropCollectorV1 {
  const sources = new Map<ProjectFormatV1.Id, ProjectFormatV1.InteropSource>();
  const records = new Map<ProjectFormatV1.Id, ProjectFormatV1.InteropRecord>();
  let sourceSequence = 0;
  let recordSequence = 0;

  function addSource(input: {
    readonly format: string;
    readonly sourceAssetId: ProjectFormatV1.Id;
    readonly importerVersion: string;
    readonly importedAt: ProjectFormatV1.UtcTimestamp;
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id {
    sourceSequence += 1;

    const sourceId = input.id ?? projectFormatV1.idSchema.parse(`source-${String(sourceSequence)}`);

    if (!sources.has(sourceId)) {
      sources.set(sourceId, {
        id: sourceId,
        format: nonEmptyValue(input.format),
        sourceAssetId: input.sourceAssetId,
        importerVersion: nonEmptyValue(input.importerVersion),
        importedAt: input.importedAt,
      });
    }

    return sourceId;
  }

  function addRecord(input: {
    readonly sourceId: ProjectFormatV1.Id;
    readonly target: ProjectFormatV1.EntityAddress;
    readonly baselineSemanticHash: ProjectFormatV1.Sha256Digest;
    readonly mappingConfidence: number;
    readonly editability: 'native' | 'partial' | 'appearance-only';
    readonly warnings?: readonly ProjectFormatV1.InteropDiagnostic[];
    readonly preservedBlob?: ProjectFormatV1.BlobReference;
    readonly previewAssetId?: ProjectFormatV1.Id;
    readonly id?: ProjectFormatV1.Id;
  }): ProjectFormatV1.Id {
    recordSequence += 1;

    const recordId = input.id ?? projectFormatV1.idSchema.parse(`record-${String(recordSequence)}`);
    const record: ProjectFormatV1.InteropRecord = {
      id: recordId,
      sourceId: input.sourceId,
      target: input.target,
      baselineSemanticHash: input.baselineSemanticHash,
      mappingConfidence: normalizedConfidence(input.mappingConfidence),
      editability: input.editability,
      warnings: [...(input.warnings ?? [])],
      ...(input.preservedBlob === undefined ? {} : { preservedBlob: input.preservedBlob }),
      ...(input.previewAssetId === undefined ? {} : { previewAssetId: input.previewAssetId }),
    };

    if (!records.has(recordId)) records.set(recordId, record);

    return recordId;
  }

  function build(): ProjectFormatV1.InteropRegistry {
    return { sources: [...sources.values()], records: [...records.values()] };
  }

  return { addSource, addRecord, build };
}
