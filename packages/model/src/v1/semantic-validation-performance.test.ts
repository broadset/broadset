import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { assetSchema, sha256DigestSchema, validateBroadsetProjectV1Semantics } from './index';
import { createReviewComponent, createReviewComponentInstance, createReviewGroup, createReviewTarget, parseReviewProject } from './semantic-review-fixtures';

const STRESS_ITEM_COUNT = 5_000;

function countMethodReads(items: readonly unknown[], method: 'find' | 'some'): () => number {
  let count = 0;
  const implementation = Array.prototype[method];

  Object.defineProperty(items, method, {
    configurable: true,
    get: () => {
      count += 1;

      return implementation;
    },
  });

  return () => count;
}

function createDataAsset() {
  return assetSchema.parse({
    id: 'source-asset', kind: 'data', name: 'Source',
    blob: {
      digest: sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`),
      byteLength: 1, mediaType: 'application/octet-stream',
      source: { kind: 'package', path: `blobs/sha256/${'a'.repeat(64)}` },
    },
    metadata: { encoding: 'binary', recordShape: { kind: 'opaque' } },
  });
}

describe('semantic validation indexing', () => {
  it('validates 5k interop, selection, sample, and exposed-value references without collection scans', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const local = createReviewGroup('local');
    const target = createReviewTarget(project, local.id, '/appearance/opacity');
    const ids = Array.from({ length: STRESS_ITEM_COUNT }, (_, index) => `item-${String(index)}`);
    const exposedProperties = ids.map((id) => ({
      id, label: id, group: 'Stress', valueSchema: { kind: 'number' }, defaultValue: { type: 'number', value: 1 },
      constraints: [], bindings: [{ id: `binding-${id}`, target }],
    }));
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [local], rootElementIds: [local.id], sequences: [],
      exposedProperties, extensions: [],
    });
    const instance = createReviewComponentInstance('instance', component.id, ids.map((id) => ({
      exposedPropertyId: id, value: { type: 'number', value: 1 },
    })));
    const variables = ids.map((id) => ({
      id: `variables-${id}`, name: id, modes: [{ id: 'mode', name: 'Mode' }], defaultModeId: 'mode', variables: [],
    }));
    const viewModels = ids.map((id) => ({
      id: `view-${id}`, name: id, fields: [], sampleDataSets: [{ id: 'sample', name: 'Sample', values: {} }],
    }));
    const sources = ids.map((id) => ({
      id: `source-${id}`, format: 'application/octet-stream', sourceAssetId: 'source-asset', importerVersion: '1', importedAt: '2026-01-01T00:00:00Z',
    }));
    const records = ids.map((id) => ({
      id: `record-${id}`, sourceId: `source-${id}`,
      target: { projectId: project.id, entityKind: 'project', entityId: project.id },
      baselineSemanticHash: sha256DigestSchema.parse(`sha256:${'b'.repeat(64)}`),
      mappingConfidence: 1, editability: 'native', warnings: [],
    }));
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, assets: [createDataAsset()], variables },
      interop: { sources, records },
      documents: [{
        ...document,
        elements: [instance], components: [component], viewModels,
        selectedVariableModes: Object.fromEntries(ids.map((id) => [`variables-${id}`, 'mode'])),
        pages: [{
          ...page,
          selectedSampleDataSets: Object.fromEntries(ids.map((id) => [`view-${id}`, 'sample'])),
        }],
      }],
    });
    const actualDocument = actual.documents[0];
    const actualComponent = actualDocument?.components[0];

    if (actualDocument === undefined || actualComponent === undefined) throw new Error('Expected stress fixtures');

    const readCounts = [
      countMethodReads(actual.interop.sources, 'some'),
      countMethodReads(actual.resources.variables, 'find'),
      countMethodReads(actualDocument.viewModels, 'find'),
      countMethodReads(actualComponent.exposedProperties, 'find'),
    ];

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual([]);
    expect(readCounts.map((read) => read())).toEqual([0, 0, 0, 0]);
  }, 20_000);
});
