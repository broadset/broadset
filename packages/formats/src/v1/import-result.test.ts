import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { computeSha256DigestV1 } from './blob-reference';
import { assembleImportedProjectV1 } from './import-result';
import { createInteropCollectorV1 } from './interop-collector';
import { createResourceCollectorV1 } from './resource-collector';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);

describe('assembleImportedProjectV1', () => {
  it('assembles a schema-valid and semantically-valid imported project with its blob sidecar', async () => {
    const projectId = id('imported-project');
    const documentId = id('imported-document');
    const elementId = id('image-element');
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const resources = createResourceCollectorV1();
    const imageAssetId = await resources.addImageAsset({
      bytes,
      mediaType: 'image/png',
      name: 'Imported image',
      pixelSize: [640, 480],
    });
    const element = projectFormatV1.createElementV1({
      id: elementId,
      name: 'Image',
      geometry: projectFormatV1.createElementGeometry({ width: 640, height: 480 }),
      kind: 'image',
      image: { assetId: imageAssetId, fit: 'contain' },
    });
    const document = projectFormatV1.createDocumentV1({
      id: documentId,
      name: 'Imported document',
      elements: [element],
    });
    const interop = createInteropCollectorV1();
    const sourceId = interop.addSource({
      format: 'image/png',
      sourceAssetId: imageAssetId,
      importerVersion: '1.0.0',
      importedAt: projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z'),
    });

    interop.addRecord({
      sourceId,
      target: { projectId, documentId, entityKind: 'element', entityId: elementId },
      baselineSemanticHash: await computeSha256DigestV1(bytes),
      mappingConfidence: 1,
      editability: 'native',
    });

    const result = assembleImportedProjectV1({
      id: projectId,
      name: 'Imported project',
      document,
      resources: resources.collect(),
      interop: interop.build(),
    });
    const parsed = projectFormatV1.parseProjectV1Unknown(result.project);
    const digest = result.project.resources.assets[0]?.blob.digest;

    expect(parsed.status).toBe('loaded');
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
    expect(result.project.interop).toEqual(interop.build());
    expect(digest).toBeDefined();
    expect(digest === undefined ? false : result.blobs.has(digest)).toBe(true);
  });

  it('uses project factory defaults when optional identity fields are omitted', () => {
    const document = projectFormatV1.createDocumentV1({ id: id('document') });
    const result = assembleImportedProjectV1({
      document,
      resources: createResourceCollectorV1().collect(),
      interop: createInteropCollectorV1().build(),
    });

    expect(result.project.id).toBe(id('project'));
    expect(result.project.metadata.name).toBe('Project');
  });
});
