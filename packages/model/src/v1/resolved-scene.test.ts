import { describe, expect, it } from 'vitest';

import type { ComponentDefinition } from './component';
import {
  createBlackColorValue,
  createDocumentV1,
  createElementGeometry,
  createElementV1,
  createPageV1,
  createProjectV1,
  createRectangleGeometry,
} from './construction';
import type { BroadsetDocumentV1 } from './document';
import type { Element, ElementTransform } from './element';
import { idSchema, type PropertyTarget, sha256DigestSchema } from './identity';
import type { DescendantOverride, PageDefinition, PageRootInstance, TypedOverride } from './page';
import { resolvePageInstanceElement } from './resolved-address';
import { resolveCanonicalSceneV1, type ResolvedSceneInstance, resolvePageInstanceTree } from './resolved-scene';
import type { Asset } from './resources';
import { createSemanticIndexes } from './semantic-index';

const id = (value: string): ReturnType<typeof idSchema.parse> => idSchema.parse(value);
const geometry = createElementGeometry({ width: 100, height: 100 });

function rootInstance(instanceId: string, elementId: string, visible?: boolean): PageRootInstance {
  const base: PageRootInstance = {
    id: id(instanceId),
    elementId: id(elementId),
    overrides: [],
    componentPropertyValues: [],
  };

  return visible === undefined ? base : { ...base, visible };
}

function group(elementId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({ id: id(elementId), name: elementId, geometry, kind: 'group', ...parent });
}

function rect(elementId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({
    id: id(elementId),
    name: elementId,
    geometry,
    kind: 'vector',
    geometryData: createRectangleGeometry(),
    ...parent,
  });
}

function instance(elementId: string, componentId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({
    id: id(elementId),
    name: elementId,
    geometry,
    kind: 'component-instance',
    componentId: id(componentId),
    ...parent,
  });
}

function component(
  componentId: string,
  elements: readonly Element[],
  rootElementIds: readonly string[],
): ComponentDefinition {
  return {
    id: id(componentId),
    name: componentId,
    elements,
    rootElementIds: rootElementIds.map(id),
    sequences: [],
    exposedProperties: [],
    extensions: [],
  };
}

function buildProject(options: {
  readonly elements: readonly Element[];
  readonly rootInstances: readonly PageRootInstance[];
  readonly components?: readonly ComponentDefinition[];
}): ReturnType<typeof createProjectV1> {
  const document: BroadsetDocumentV1 = {
    ...createDocumentV1({
      id: id('doc'),
      elements: options.elements,
      pages: [createPageV1({ id: id('page'), rootInstances: options.rootInstances })],
    }),
    components: options.components ?? [],
  };

  return createProjectV1({ id: id('proj'), documents: [document] });
}

function resolve(project: ReturnType<typeof createProjectV1>): readonly ResolvedSceneInstance[] {
  return resolvePageInstanceTree({ project, documentId: id('doc'), pageId: id('page') });
}

/** The single property that pins finding 1: every placed row (except a component-instance page root,
 * which is addressed as the page-root entity, not an element) must resolve back to the same element. */
function assertAddressesRoundTrip(
  project: ReturnType<typeof createProjectV1>,
  instances: readonly ResolvedSceneInstance[],
): void {
  const indexes = createSemanticIndexes(project);
  const document = indexes.documents.get(id('doc'));
  const page = document?.pages.get(id('page'));

  expect(document).toBeDefined();
  expect(page).toBeDefined();
  if (document === undefined || page === undefined) return;

  for (const placed of instances) {
    const isComponentInstancePageRoot = placed.depth === 0 && placed.element.kind === 'component-instance';

    if (isComponentInstancePageRoot) continue;

    const resolved = resolvePageInstanceElement(document, page, {
      rootInstanceId: placed.rootInstanceId,
      componentInstancePath: placed.componentInstancePath,
      elementId: placed.element.id,
    });

    expect(resolved?.kind, `address for ${placed.element.id}`).toBe('element');
    if (resolved?.kind === 'element') expect(resolved.value.id).toBe(placed.element.id);
  }
}

describe('resolvePageInstanceTree', () => {
  it('resolves ordinary roots with their parentId descendants, addresses round-trip', () => {
    const project = buildProject({
      elements: [group('g'), rect('r1', 'g')],
      rootInstances: [rootInstance('root-g', 'g')],
    });
    const instances = resolve(project);

    expect(instances.map((placed) => placed.element.id)).toEqual([id('g'), id('r1')]);
    expect(instances[0]).toMatchObject({
      rootInstanceId: id('root-g'),
      componentInstancePath: [],
      parentElementId: null,
      depth: 0,
    });
    expect(instances[1]).toMatchObject({
      rootInstanceId: id('root-g'),
      componentInstancePath: [],
      parentElementId: id('g'),
      depth: 1,
    });
    assertAddressesRoundTrip(project, instances);
  });

  it('expands a component-instance page root with an EMPTY component path (finding 1)', () => {
    const comp = component('comp', [rect('c-rect')], ['c-rect']);
    const project = buildProject({
      elements: [instance('ci', 'comp')],
      rootInstances: [rootInstance('root-ci', 'ci')],
      components: [comp],
    });
    const instances = resolve(project);

    expect(instances.map((placed) => placed.element.id)).toEqual([id('ci'), id('c-rect')]);
    // The page root element's id is NOT in the address path; it is carried by rootInstanceId.
    expect(instances[1]).toMatchObject({ componentInstancePath: [], depth: 1 });
    assertAddressesRoundTrip(project, instances);
  });

  it('appends the instance id only when crossing a NESTED component boundary', () => {
    const comp = component('comp', [rect('c-rect')], ['c-rect']);
    const project = buildProject({
      elements: [group('g'), instance('ci', 'comp', 'g')],
      rootInstances: [rootInstance('root-g', 'g')],
      components: [comp],
    });
    const instances = resolve(project);

    const cRect = instances.find((placed) => placed.element.id === id('c-rect'));

    expect(cRect?.componentInstancePath).toEqual([id('ci')]);
    assertAddressesRoundTrip(project, instances);
  });

  it('round-trips a two-level nested component chain', () => {
    const inner = component('inner', [rect('leaf')], ['leaf']);
    const outer = component('outer', [instance('mid', 'inner')], ['mid']);
    const project = buildProject({
      elements: [instance('ci', 'outer')],
      rootInstances: [rootInstance('root-ci', 'ci')],
      components: [inner, outer],
    });
    const instances = resolve(project);

    const leaf = instances.find((placed) => placed.element.id === id('leaf'));

    expect(leaf?.componentInstancePath).toEqual([id('mid')]);
    assertAddressesRoundTrip(project, instances);
  });

  it('does not drop document children parented under a NESTED component-instance element (finding 2)', () => {
    const comp = component('comp', [rect('c-rect')], ['c-rect']);
    const project = buildProject({
      elements: [group('g'), instance('ci', 'comp', 'g'), rect('doc-child', 'ci')],
      rootInstances: [rootInstance('root-g', 'g')],
      components: [comp],
    });
    const instances = resolve(project);
    const ids = instances.map((placed) => placed.element.id);

    // The instance's component content AND its ordinary document child are both placed and addressable.
    expect(ids).toContain(id('c-rect'));
    expect(ids).toContain(id('doc-child'));

    const docChild = instances.find((placed) => placed.element.id === id('doc-child'));

    expect(docChild?.componentInstancePath).toEqual([]);
    assertAddressesRoundTrip(project, instances);
  });

  it('expands component roots in declared rootElementIds order, not array order (finding 4)', () => {
    const comp = component('comp', [rect('a'), rect('b')], ['b', 'a']);
    const project = buildProject({
      elements: [instance('ci', 'comp')],
      rootInstances: [rootInstance('root-ci', 'ci')],
      components: [comp],
    });
    const instances = resolve(project).filter((placed) => placed.depth === 1);

    expect(instances.map((placed) => placed.element.id)).toEqual([id('b'), id('a')]);
  });

  it('attributes each subtree to its own root instance across multiple roots', () => {
    const project = buildProject({
      elements: [group('g1'), rect('c1', 'g1'), group('g2'), rect('c2', 'g2')],
      rootInstances: [rootInstance('root-1', 'g1'), rootInstance('root-2', 'g2')],
    });
    const instances = resolve(project);

    expect(
      instances.filter((placed) => placed.rootInstanceId === id('root-1')).map((placed) => placed.element.id),
    ).toEqual([id('g1'), id('c1')]);
    expect(
      instances.filter((placed) => placed.rootInstanceId === id('root-2')).map((placed) => placed.element.id),
    ).toEqual([id('g2'), id('c2')]);
    assertAddressesRoundTrip(project, instances);
  });

  it('carries page-root-instance visibility onto the whole subtree', () => {
    const project = buildProject({
      elements: [group('g'), rect('r', 'g')],
      rootInstances: [rootInstance('root-g', 'g', false)],
    });
    const instances = resolve(project);

    expect(instances).toHaveLength(2);
    expect(instances.every((placed) => !placed.visible)).toBe(true);
  });

  it('returns an empty tree for a missing document or page', () => {
    const project = createProjectV1();

    expect(resolvePageInstanceTree({ project, documentId: id('missing'), pageId: id('page') })).toEqual([]);
    expect(resolvePageInstanceTree({ project, documentId: id('document'), pageId: id('missing') })).toEqual([]);
  });

  it('fails closed on a dangling component reference (emits the instance, skips expansion)', () => {
    const project = buildProject({
      elements: [instance('ci', 'nope')],
      rootInstances: [rootInstance('root-ci', 'ci')],
    });

    expect(resolve(project).map((placed) => placed.element.id)).toEqual([id('ci')]);
  });

  it('terminates on a cyclic component graph', () => {
    const comp = component('comp', [instance('inner', 'comp')], ['inner']);
    const project = buildProject({
      elements: [instance('ci', 'comp')],
      rootInstances: [rootInstance('root-ci', 'ci')],
      components: [comp],
    });

    expect(resolve(project).map((placed) => placed.element.id)).toEqual([id('ci'), id('inner')]);
  });

  it('fully re-expands a component reused by two sibling instances (diamond, not a cycle)', () => {
    const comp = component('comp', [rect('leaf')], ['leaf']);
    const project = buildProject({
      elements: [group('g'), instance('ci1', 'comp', 'g'), instance('ci2', 'comp', 'g')],
      rootInstances: [rootInstance('root-g', 'g')],
      components: [comp],
    });
    const instances = resolve(project);

    expect(instances.filter((placed) => placed.element.id === id('leaf'))).toHaveLength(2);
    assertAddressesRoundTrip(project, instances);
  });
});

function pageTarget(
  rootInstanceId: string,
  elementId: string,
  pointer: string,
  componentPath: readonly string[] = [],
): PropertyTarget {
  return {
    entity: {
      projectId: id('proj'),
      documentId: id('doc'),
      pageId: id('page'),
      entityKind: 'element',
      entityId: id(elementId),
      instancePath: [id(rootInstanceId), ...componentPath.map(id)],
    },
    pointer,
  };
}

function opacityOverride(
  rootInstanceId: string,
  elementId: string,
  value: number,
  componentPath: readonly string[] = [],
): TypedOverride {
  return {
    target: pageTarget(rootInstanceId, elementId, '/appearance/opacity', componentPath),
    value: { type: 'number', value },
  };
}

function pageRootVisibilityOverride(rootInstanceId: string, value: boolean): TypedOverride {
  return {
    target: {
      entity: {
        projectId: id('proj'),
        documentId: id('doc'),
        pageId: id('page'),
        entityKind: 'page-root',
        entityId: id(rootInstanceId),
      },
      pointer: '/visible',
    },
    value: { type: 'boolean', value },
  };
}

function resolveCanonical(project: ReturnType<typeof createProjectV1>) {
  return resolveCanonicalSceneV1({ project, documentId: id('doc'), pageId: id('page') });
}

describe('resolveCanonicalSceneV1', () => {
  it('keeps repeated roots distinct and applies surface-relative root transforms and overrides', () => {
    const source = createElementV1({
      id: id('shape'),
      name: 'shape',
      geometry: createElementGeometry({
        width: 100,
        height: 100,
        transform: { kind: 'affine2d', matrix: [2, 0, 0, 2, 5, 6] },
      }),
      kind: 'vector',
      geometryData: createRectangleGeometry(),
    });
    const firstTransform: ElementTransform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] };
    const secondTransform: ElementTransform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 100, 200] };
    const roots: readonly PageRootInstance[] = [
      {
        ...rootInstance('root-a', 'shape', true),
        transform: firstTransform,
        overrides: [opacityOverride('root-a', 'shape', 0.25), pageRootVisibilityOverride('root-a', false)],
      },
      {
        ...rootInstance('root-b', 'shape'),
        transform: secondTransform,
        overrides: [opacityOverride('root-b', 'shape', 0.75)],
      },
    ];
    const project = buildProject({ elements: [source], rootInstances: roots });
    const result = resolveCanonical(project);

    expect(result.status, JSON.stringify(result.status === 'invalid' ? result.diagnostics : [])).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.scene.nodes.map((node) => node.address)).toEqual([
      { rootInstanceId: id('root-a'), componentInstancePath: [], elementId: id('shape') },
      { rootInstanceId: id('root-b'), componentInstancePath: [], elementId: id('shape') },
    ]);
    expect(result.scene.nodes.map((node) => node.element.appearance.opacity)).toEqual([0.25, 0.75]);
    expect(result.scene.nodes.map((node) => node.worldGeometry.transform)).toEqual([firstTransform, secondTransform]);
    expect(result.scene.nodes.map((node) => node.visible)).toEqual([false, true]);
  });

  it('uses canonical paint order, composite parents, component values, and isolated descendant overrides', () => {
    const leafA = rect('leaf-a');
    const leafB = rect('leaf-b');
    const propertyTarget: PropertyTarget = {
      entity: { projectId: id('proj'), documentId: id('doc'), entityKind: 'element', entityId: id('leaf-a') },
      pointer: '/appearance/opacity',
    };
    const comp: ComponentDefinition = {
      ...component('comp', [leafA, leafB], ['leaf-b', 'leaf-a']),
      exposedProperties: [
        {
          id: id('opacity'),
          label: 'Opacity',
          group: 'Appearance',
          valueSchema: { kind: 'number' },
          defaultValue: { type: 'number', value: 0.2 },
          constraints: [],
          bindings: [{ id: id('opacity-binding'), target: propertyTarget }],
        },
      ],
    };
    const root = group('root');
    const instanceA = instance('instance-a', 'comp', 'root');
    const instanceB = createElementV1({
      id: id('instance-b'),
      name: 'instance-b',
      geometry,
      kind: 'component-instance',
      componentId: id('comp'),
      parentId: id('root'),
      propertyValues: [{ exposedPropertyId: id('opacity'), value: { type: 'number', value: 0.6 } }],
    });
    const descendant: DescendantOverride = {
      address: { rootInstanceId: id('page-root'), componentInstancePath: [id('instance-a')], elementId: id('leaf-a') },
      overrides: [opacityOverride('page-root', 'leaf-a', 0.8, ['instance-a'])],
    };
    const basePage = createPageV1({ id: id('page'), rootInstances: [rootInstance('page-root', 'root')] });
    const page: PageDefinition = { ...basePage, descendantOverrides: [descendant] };
    const baseDocument = createDocumentV1({ id: id('doc'), elements: [root, instanceA, instanceB], pages: [page] });
    const document: BroadsetDocumentV1 = { ...baseDocument, components: [comp] };
    const project = createProjectV1({ id: id('proj'), documents: [document] });
    const result = resolveCanonical(project);

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.scene.nodes.map((node) => node.address.elementId)).toEqual([
      id('root'),
      id('instance-a'),
      id('leaf-b'),
      id('leaf-a'),
      id('instance-b'),
      id('leaf-b'),
      id('leaf-a'),
    ]);

    const firstLeaf = result.scene.nodes.find(
      (node) => node.address.elementId === id('leaf-a') && node.address.componentInstancePath[0] === id('instance-a'),
    );
    const secondLeaf = result.scene.nodes.find(
      (node) => node.address.elementId === id('leaf-a') && node.address.componentInstancePath[0] === id('instance-b'),
    );

    expect(firstLeaf?.parentAddress).toEqual({
      rootInstanceId: id('page-root'),
      componentInstancePath: [],
      elementId: id('instance-a'),
    });
    expect(secondLeaf?.parentAddress).toEqual({
      rootInstanceId: id('page-root'),
      componentInstancePath: [],
      elementId: id('instance-b'),
    });
    expect(firstLeaf?.element.appearance.opacity).toBe(0.8);
    expect(secondLeaf?.element.appearance.opacity).toBe(0.6);
    expect(firstLeaf?.properties[0]?.contributions.map((entry) => entry.source.kind)).toEqual([
      'definition',
      'component-property',
      'page-override',
    ]);
  });

  it('retains definition provenance for component values bound to nested stable-ID targets', () => {
    const base = rect('painted');
    const painted: Element = {
      ...base,
      appearance: {
        ...base.appearance,
        fills: [
          {
            id: id('fill'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: createBlackColorValue() },
          },
        ],
      },
    };
    const fillTarget: PropertyTarget = {
      entity: { projectId: id('proj'), documentId: id('doc'), entityKind: 'fill', entityId: id('fill') },
      pointer: '/opacity',
    };
    const comp: ComponentDefinition = {
      ...component('paint-component', [painted], ['painted']),
      exposedProperties: [
        {
          id: id('fill-opacity'),
          label: 'Fill opacity',
          group: 'Appearance',
          valueSchema: { kind: 'number' },
          defaultValue: { type: 'number', value: 0.45 },
          constraints: [],
          bindings: [{ id: id('fill-binding'), target: fillTarget }],
        },
      ],
    };
    const rootElement = instance('root-component', 'paint-component');
    const project = buildProject({
      elements: [rootElement],
      rootInstances: [rootInstance('page-root', 'root-component')],
      components: [comp],
    });
    const result = resolveCanonical(project);

    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;

    const node = result.scene.nodes.find((candidate) => candidate.address.elementId === id('painted'));
    const contributions = node?.properties[0]?.contributions;

    expect(node?.element.appearance.fills[0]?.opacity).toBe(0.45);
    expect(contributions?.[0]?.value).toEqual({ type: 'number', value: 1 });
    expect(contributions?.[0]?.source.kind).toBe('definition');
    expect(contributions?.[1]?.value).toEqual({ type: 'number', value: 0.45 });
    expect(contributions?.[1]?.source.kind).toBe('component-property');
  });

  it('owns and freezes resource/data context and reports explicit missing resource fallbacks', () => {
    const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 7, 8];
    const missingAsset: Asset = {
      id: id('missing-image'),
      name: 'Missing image',
      kind: 'image',
      blob: {
        digest: sha256DigestSchema.parse(`sha256:${'0'.repeat(64)}`),
        byteLength: 0,
        mediaType: 'image/png',
        source: { kind: 'missing', lastKnownName: 'missing.png' },
      },
      metadata: { pixelWidth: 10, pixelHeight: 10, orientation: 1, hasAlpha: true, bitDepth: 8, colorModel: 'rgb' },
    };
    const image = createElementV1({
      id: id('image'),
      name: 'Image',
      kind: 'image',
      geometry: createElementGeometry({ width: 10, height: 10, transform: { kind: 'affine2d', matrix } }),
      image: { assetId: missingAsset.id, fit: 'contain' },
    });
    const basePage = createPageV1({ id: id('page'), rootInstances: [rootInstance('root-image', 'image')] });
    const page: PageDefinition = {
      ...basePage,
      selectedVariableModes: { [id('collection')]: id('page-mode') },
      selectedSampleDataSets: { [id('view')]: id('sample') },
    };
    const baseDocument = createDocumentV1({ id: id('doc'), elements: [image], pages: [page] });
    const document: BroadsetDocumentV1 = {
      ...baseDocument,
      surface: {
        ...baseDocument.surface,
        background: { kind: 'picture', assetId: missingAsset.id, fit: 'contain' },
      },
      selectedVariableModes: { [id('collection')]: id('document-mode') },
      viewModels: [
        {
          id: id('view'),
          name: 'View',
          fields: [
            {
              id: id('field'),
              name: 'Field',
              schema: { kind: 'string' },
              defaultValue: { type: 'string', value: 'default' },
            },
          ],
          sampleDataSets: [
            { id: id('sample'), name: 'Sample', values: { [id('field')]: { type: 'string', value: 'sample' } } },
          ],
        },
      ],
    };
    const resources = {
      assets: [missingAsset],
      fonts: [],
      swatches: [],
      variables: [
        {
          id: id('collection'),
          name: 'Collection',
          modes: [
            { id: id('document-mode'), name: 'Document' },
            { id: id('page-mode'), name: 'Page' },
          ],
          defaultModeId: id('document-mode'),
          variables: [],
        },
      ],
      styles: [],
      outputProfiles: [],
    };
    const project = createProjectV1({ id: id('proj'), documents: [document], resources });
    const result = resolveCanonical(project);

    expect(result.status, JSON.stringify(result.status === 'invalid' ? result.diagnostics : [])).toBe('resolved');
    if (result.status !== 'resolved') return;
    matrix[4] = 999;
    resources.assets.splice(0, 1);
    expect(result.scene.nodes[0]?.worldGeometry.transform).toEqual({ kind: 'affine2d', matrix: [1, 0, 0, 1, 7, 8] });
    expect(result.scene.resources.assets).toHaveLength(1);
    expect(result.scene.data.selectedVariableModes).toEqual({ collection: id('page-mode') });
    expect(result.scene.data.selectedSampleDataSets).toEqual({ view: id('sample') });
    expect(result.scene.data.values).toEqual([]);
    expect(result.scene.nodes[0]?.visible).toBe(true);
    expect(result.scene.fallbacks).toHaveLength(2);
    expect(
      result.scene.fallbacks.every(
        (fallback) => fallback.kind === 'missing-resource' && fallback.assetId === id('missing-image'),
      ),
    ).toBe(true);
    expect(
      result.scene.fallbacks.some((fallback) => fallback.kind === 'missing-resource' && fallback.address === undefined),
    ).toBe(true);
    expect(Object.isFrozen(result.scene.resources.assets[0]?.blob.source)).toBe(true);
    expect(() =>
      Object.defineProperty(result.scene.nodes[0]?.element.geometry.bounds ?? {}, 'width', { value: 999 }),
    ).toThrow();
  });

  it('refuses invalid projects and missing selections without returning partial scene data', () => {
    const valid = buildProject({ elements: [rect('shape')], rootInstances: [rootInstance('root', 'shape')] });
    const validDocument = valid.documents[0];

    if (validDocument === undefined) throw new Error('Expected valid fixture document');

    const invalidDocument: BroadsetDocumentV1 = { ...validDocument, pages: [] };
    const invalid = createProjectV1({ id: id('proj'), documents: [invalidDocument] });

    const invalidProjectResult = resolveCanonical(invalid);
    const missingPageResult = resolveCanonicalSceneV1({ project: valid, documentId: id('doc'), pageId: id('missing') });
    const danglingComponentResult = resolveCanonical(
      buildProject({
        elements: [instance('dangling-instance', 'missing-component')],
        rootInstances: [rootInstance('dangling-root', 'dangling-instance')],
      }),
    );
    const cyclicComponent = component('cycle', [instance('self', 'cycle')], ['self']);
    const cyclicComponentResult = resolveCanonical(
      buildProject({
        elements: [instance('cycle-instance', 'cycle')],
        rootInstances: [rootInstance('cycle-root', 'cycle-instance')],
        components: [cyclicComponent],
      }),
    );

    expect(invalidProjectResult.status).toBe('invalid');
    expect('scene' in invalidProjectResult).toBe(false);
    expect(missingPageResult.status).toBe('invalid');
    expect('scene' in missingPageResult).toBe(false);
    expect(danglingComponentResult.status).toBe('invalid');
    expect('scene' in danglingComponentResult).toBe(false);
    expect(cyclicComponentResult.status).toBe('invalid');
    expect('scene' in cyclicComponentResult).toBe(false);
  });
});
