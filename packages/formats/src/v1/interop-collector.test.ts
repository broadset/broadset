import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createInteropCollectorV1 } from './interop-collector';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const timestamp = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');
const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`);
const target: projectFormatV1.EntityAddress = {
  projectId: id('project'),
  documentId: id('document'),
  entityKind: 'element',
  entityId: id('element'),
};

describe('createInteropCollectorV1', () => {
  it('builds insertion-ordered sources and records with deterministic ids', () => {
    const collector = createInteropCollectorV1();
    const firstSourceId = collector.addSource({
      format: 'image/svg+xml',
      sourceAssetId: id('source-asset'),
      importerVersion: '1.0.0',
      importedAt: timestamp,
    });
    const secondSourceId = collector.addSource({
      format: 'application/pdf',
      sourceAssetId: id('other-asset'),
      importerVersion: '1.0.0',
      importedAt: timestamp,
    });
    const recordId = collector.addRecord({
      sourceId: firstSourceId,
      target,
      baselineSemanticHash: digest,
      mappingConfidence: 1,
      editability: 'native',
    });
    const registry = collector.build();

    expect(firstSourceId).toBe(id('source-1'));
    expect(secondSourceId).toBe(id('source-2'));
    expect(recordId).toBe(id('record-1'));
    expect(registry.sources.map(({ id: sourceId }) => sourceId)).toEqual([firstSourceId, secondSourceId]);
    expect(registry.records[0]).toEqual({
      id: recordId,
      sourceId: firstSourceId,
      target,
      baselineSemanticHash: digest,
      mappingConfidence: 1,
      editability: 'native',
      warnings: [],
    });
    expect(projectFormatV1.interopRegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('honors explicit ids and conditionally includes optional record fields', () => {
    const collector = createInteropCollectorV1();
    const sourceId = collector.addSource({
      id: id('source-explicit'),
      format: 'image/svg+xml',
      sourceAssetId: id('source-asset'),
      importerVersion: '1.0.0',
      importedAt: timestamp,
    });
    const preservedBlob: projectFormatV1.BlobReference = {
      digest,
      byteLength: 1,
      mediaType: 'application/octet-stream',
      source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
    };

    const recordId = collector.addRecord({
      id: id('record-explicit'),
      sourceId,
      target,
      baselineSemanticHash: digest,
      mappingConfidence: 0.5,
      editability: 'partial',
      warnings: [],
      preservedBlob,
      previewAssetId: id('preview'),
    });
    const record = collector.build().records[0];

    expect(recordId).toBe(id('record-explicit'));
    expect(record).toMatchObject({ preservedBlob, previewAssetId: id('preview') });
    expect(Object.hasOwn(record ?? {}, 'sourceIdentity')).toBe(false);
  });

  it('returns snapshots that are unaffected by later additions', () => {
    const collector = createInteropCollectorV1();

    collector.addSource({
      format: 'image/svg+xml',
      sourceAssetId: id('source-asset'),
      importerVersion: '1.0.0',
      importedAt: timestamp,
    });

    const first = collector.build();

    collector.addSource({
      format: 'application/pdf',
      sourceAssetId: id('other-asset'),
      importerVersion: '1.0.0',
      importedAt: timestamp,
    });

    expect(first.sources).toHaveLength(1);
    expect(collector.build().sources).toHaveLength(2);
  });

  it('normalizes malformed strings and confidence to schema-valid defaults', () => {
    const collector = createInteropCollectorV1();
    const sourceId = collector.addSource({
      format: '',
      sourceAssetId: id('source-asset'),
      importerVersion: '',
      importedAt: timestamp,
    });

    collector.addRecord({
      sourceId,
      target,
      baselineSemanticHash: digest,
      mappingConfidence: Number.NaN,
      editability: 'native',
    });

    const registry = collector.build();

    expect(registry.sources[0]).toMatchObject({ format: 'unknown', importerVersion: 'unknown' });
    expect(registry.records[0]).toMatchObject({ mappingConfidence: 0 });
    expect(projectFormatV1.interopRegistrySchema.safeParse(registry).success).toBe(true);
  });
});
