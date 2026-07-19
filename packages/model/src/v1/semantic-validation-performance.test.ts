import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { assetSchema, elementSchema, idSchema, sha256DigestSchema, validateBroadsetProjectV1Semantics } from './index';
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

  it('builds ordinary and component page-root address scopes once for 2k descendant overrides', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const descendantIds = Array.from({ length: 2_000 }, (_, index) => `descendant-${String(index)}`);
    const ordinaryRoot = createReviewGroup('ordinary-root');
    const descendants = descendantIds.map((id) => elementSchema.parse({ ...createReviewGroup(id), parentId: ordinaryRoot.id }));
    const componentElementIds = Array.from({ length: 250 }, (_, index) => `local-${String(index)}`);
    const componentElements = componentElementIds.map((id) => createReviewGroup(id));
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: componentElements, rootElementIds: componentElementIds,
      sequences: [], exposedProperties: [], extensions: [],
    });
    const componentRoot = createReviewComponentInstance('component-root', component.id);
    const pageId = idSchema.parse(page.id);
    const ordinaryOverrides = descendants.map((element) => {
      const target = createReviewTarget(project, element.id, '/appearance/opacity', ['ordinary-instance']);

      return {
        address: { rootInstanceId: 'ordinary-instance', componentInstancePath: [], elementId: element.id },
        overrides: [{ target: { ...target, entity: { ...target.entity, pageId } }, value: { type: 'number', value: 0.5 } }],
      };
    });
    const componentOverrides = componentElements.map((element) => {
      const target = createReviewTarget(project, element.id, '/appearance/opacity', ['component-instance']);

      return {
        address: { rootInstanceId: 'component-instance', componentInstancePath: [], elementId: element.id },
        overrides: [{ target: { ...target, entity: { ...target.entity, pageId } }, value: { type: 'number', value: 0.5 } }],
      };
    });
    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        elements: [ordinaryRoot, ...descendants, componentRoot],
        components: [component],
        pages: [{
          ...page,
          rootInstances: [
            { id: 'ordinary-instance', elementId: ordinaryRoot.id, overrides: [], componentPropertyValues: [] },
            { id: 'component-instance', elementId: componentRoot.id, overrides: [], componentPropertyValues: [] },
          ],
          descendantOverrides: [...ordinaryOverrides, ...componentOverrides],
        }],
      }],
    });
    const actualDocument = actual.documents[0];

    if (actualDocument === undefined) throw new Error('Expected stress document');

    let parentIdReads = 0;

    actualDocument.elements.forEach((element) => {
      const parentId = element.parentId;

      Object.defineProperty(element, 'parentId', {
        configurable: true,
        get: () => {
          parentIdReads += 1;

          return parentId;
        },
      });
    });

    const actualComponentRoot = actualDocument.elements.at(-1);

    if (actualComponentRoot?.kind !== 'component-instance') throw new Error('Expected component root');

    let componentKindReads = 0;

    Object.defineProperty(actualComponentRoot, 'kind', {
      configurable: true,
      get: () => {
        componentKindReads += 1;

        return 'component-instance';
      },
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual([]);
    expect(parentIdReads).toBeLessThan(descendantIds.length * 10);
    expect(componentKindReads).toBeLessThan(900);
  }, 20_000);

  it('builds 2k independent ordinary page-root scopes in one hierarchy traversal', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const rootCount = 2_000;
    const ordinaryRoots = Array.from({ length: rootCount }, (_, index) => createReviewGroup(`root-${String(index)}`));
    const firstRoot = ordinaryRoots[0];

    if (firstRoot === undefined) throw new Error('Expected ordinary root');

    const child = createReviewGroup('child', firstRoot.id);
    const local = createReviewGroup('component-local');
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [local], rootElementIds: [local.id],
      sequences: [], exposedProperties: [], extensions: [],
    });
    const componentRoot = createReviewComponentInstance('component-root', component.id);
    const ordinaryInstances = ordinaryRoots.map((root, index) => ({
      id: `root-instance-${String(index)}`, elementId: root.id, overrides: [], componentPropertyValues: [],
    }));
    const ordinaryTarget = createReviewTarget(project, child.id, '/appearance/opacity', ['root-instance-0']);
    const componentTarget = createReviewTarget(project, local.id, '/appearance/opacity', ['component-instance']);
    const pageId = idSchema.parse(page.id);
    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        elements: [firstRoot, child, ...ordinaryRoots.slice(1), componentRoot],
        components: [component],
        pages: [{
          ...page,
          rootInstances: [
            ...ordinaryInstances,
            { id: 'component-instance', elementId: componentRoot.id, overrides: [], componentPropertyValues: [] },
          ],
          descendantOverrides: [
            {
              address: { rootInstanceId: 'root-instance-0', componentInstancePath: [], elementId: child.id },
              overrides: [{ target: { ...ordinaryTarget, entity: { ...ordinaryTarget.entity, pageId } }, value: { type: 'number', value: 0.5 } }],
            },
            {
              address: { rootInstanceId: 'component-instance', componentInstancePath: [], elementId: local.id },
              overrides: [{ target: { ...componentTarget, entity: { ...componentTarget.entity, pageId } }, value: { type: 'number', value: 0.5 } }],
            },
          ],
        }],
      }],
    });
    const actualDocument = actual.documents[0];

    if (actualDocument === undefined) throw new Error('Expected multi-root document');

    let parentIdReads = 0;

    actualDocument.elements.forEach((element) => {
      const parentId = element.parentId;

      Object.defineProperty(element, 'parentId', {
        configurable: true,
        get: () => {
          parentIdReads += 1;

          return parentId;
        },
      });
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual([]);
    expect(parentIdReads).toBeLessThan(rootCount * 10);
  }, 20_000);
});
