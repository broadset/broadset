import { describe, expect, it } from 'vitest';

import type { ComponentDefinition } from './component';
import {
  createDocumentV1,
  createElementGeometry,
  createElementV1,
  createPageV1,
  createProjectV1,
  createRectangleGeometry,
} from './construction';
import type { BroadsetDocumentV1 } from './document';
import type { Element } from './element';
import { idSchema } from './identity';
import type { PageRootInstance } from './page';
import { resolvePageInstanceElement } from './resolved-address';
import { type ResolvedSceneInstance, resolvePageInstanceTree } from './resolved-scene';
import { createSemanticIndexes } from './semantic-index';

const id = (value: string): ReturnType<typeof idSchema.parse> => idSchema.parse(value);
const geometry = createElementGeometry({ width: 100, height: 100 });

function rootInstance(instanceId: string, elementId: string, visible?: boolean): PageRootInstance {
  const base: PageRootInstance = { id: id(instanceId), elementId: id(elementId), overrides: [], componentPropertyValues: [] };

  return visible === undefined ? base : { ...base, visible };
}

function group(elementId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({ id: id(elementId), name: elementId, geometry, kind: 'group', ...parent });
}

function rect(elementId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({ id: id(elementId), name: elementId, geometry, kind: 'vector', geometryData: createRectangleGeometry(), ...parent });
}

function instance(elementId: string, componentId: string, parentId?: string): Element {
  const parent = parentId === undefined ? {} : { parentId: id(parentId) };

  return createElementV1({ id: id(elementId), name: elementId, geometry, kind: 'component-instance', componentId: id(componentId), ...parent });
}

function component(componentId: string, elements: readonly Element[], rootElementIds: readonly string[]): ComponentDefinition {
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
function assertAddressesRoundTrip(project: ReturnType<typeof createProjectV1>, instances: readonly ResolvedSceneInstance[]): void {
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
    const project = buildProject({ elements: [group('g'), rect('r1', 'g')], rootInstances: [rootInstance('root-g', 'g')] });
    const instances = resolve(project);

    expect(instances.map((placed) => placed.element.id)).toEqual([id('g'), id('r1')]);
    expect(instances[0]).toMatchObject({ rootInstanceId: id('root-g'), componentInstancePath: [], parentElementId: null, depth: 0 });
    expect(instances[1]).toMatchObject({ rootInstanceId: id('root-g'), componentInstancePath: [], parentElementId: id('g'), depth: 1 });
    assertAddressesRoundTrip(project, instances);
  });

  it('expands a component-instance page root with an EMPTY component path (finding 1)', () => {
    const comp = component('comp', [rect('c-rect')], ['c-rect']);
    const project = buildProject({ elements: [instance('ci', 'comp')], rootInstances: [rootInstance('root-ci', 'ci')], components: [comp] });
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
    const project = buildProject({ elements: [instance('ci', 'outer')], rootInstances: [rootInstance('root-ci', 'ci')], components: [inner, outer] });
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
    const project = buildProject({ elements: [instance('ci', 'comp')], rootInstances: [rootInstance('root-ci', 'ci')], components: [comp] });
    const instances = resolve(project).filter((placed) => placed.depth === 1);

    expect(instances.map((placed) => placed.element.id)).toEqual([id('b'), id('a')]);
  });

  it('attributes each subtree to its own root instance across multiple roots', () => {
    const project = buildProject({
      elements: [group('g1'), rect('c1', 'g1'), group('g2'), rect('c2', 'g2')],
      rootInstances: [rootInstance('root-1', 'g1'), rootInstance('root-2', 'g2')],
    });
    const instances = resolve(project);

    expect(instances.filter((placed) => placed.rootInstanceId === id('root-1')).map((placed) => placed.element.id)).toEqual([id('g1'), id('c1')]);
    expect(instances.filter((placed) => placed.rootInstanceId === id('root-2')).map((placed) => placed.element.id)).toEqual([id('g2'), id('c2')]);
    assertAddressesRoundTrip(project, instances);
  });

  it('carries page-root-instance visibility onto the whole subtree', () => {
    const project = buildProject({ elements: [group('g'), rect('r', 'g')], rootInstances: [rootInstance('root-g', 'g', false)] });
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
    const project = buildProject({ elements: [instance('ci', 'nope')], rootInstances: [rootInstance('root-ci', 'ci')] });

    expect(resolve(project).map((placed) => placed.element.id)).toEqual([id('ci')]);
  });

  it('terminates on a cyclic component graph', () => {
    const comp = component('comp', [instance('inner', 'comp')], ['inner']);
    const project = buildProject({ elements: [instance('ci', 'comp')], rootInstances: [rootInstance('root-ci', 'ci')], components: [comp] });

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
