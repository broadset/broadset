import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { type RenderContextV1 } from './element-dom';
import { renderPageV1, renderResolvedSceneV1 } from './scene-dom';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const DOCUMENT_ID = id('document');
const PAGE_ID = id('page');
const MISSING_ID = id('missing');
const GEOMETRY = projectFormatV1.createElementGeometry({ width: 100, height: 100 });
const NO_SWATCHES: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const NO_FONTS: ReadonlyMap<projectFormatV1.Id, projectFormatV1.FontFamilyResource> = new Map();

function context(): RenderContextV1 {
  return {
    swatches: NO_SWATCHES,
    fonts: NO_FONTS,
    resolveAssetUrl: (): undefined => undefined,
    document,
  };
}

function rootInstance(
  instanceId: string,
  elementId: string,
  visible?: boolean,
): projectFormatV1.PageRootInstance {
  const root: projectFormatV1.PageRootInstance = {
    id: id(instanceId),
    elementId: id(elementId),
    overrides: [],
    componentPropertyValues: [],
  };

  return visible === undefined ? root : { ...root, visible };
}

function group(elementId: string, parentId?: string): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: GEOMETRY,
    kind: 'group',
    ...(parentId === undefined ? {} : { parentId: id(parentId) }),
  });
}

function rectangle(elementId: string, parentId?: string): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: GEOMETRY,
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
    ...(parentId === undefined ? {} : { parentId: id(parentId) }),
  });
}

function componentInstance(
  elementId: string,
  componentId: string,
  parentId?: string,
): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    geometry: GEOMETRY,
    kind: 'component-instance',
    componentId: id(componentId),
    ...(parentId === undefined ? {} : { parentId: id(parentId) }),
  });
}

function component(
  componentId: string,
  elements: readonly projectFormatV1.Element[],
  rootElementIds: readonly string[],
): projectFormatV1.ComponentDefinition {
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

function createProject(options: {
  readonly elements?: readonly projectFormatV1.Element[];
  readonly rootInstances?: readonly projectFormatV1.PageRootInstance[];
  readonly components?: readonly projectFormatV1.ComponentDefinition[];
}): projectFormatV1.BroadsetProjectV1 {
  const broadsetDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...projectFormatV1.createDocumentV1({
      id: DOCUMENT_ID,
      ...(options.elements === undefined ? {} : { elements: options.elements }),
      pages: [
        projectFormatV1.createPageV1({
          id: PAGE_ID,
          ...(options.rootInstances === undefined ? {} : { rootInstances: options.rootInstances }),
        }),
      ],
    }),
    components: options.components ?? [],
  };

  return projectFormatV1.createProjectV1({ documents: [broadsetDocument] });
}

function renderProject(project: projectFormatV1.BroadsetProjectV1): HTMLElement {
  const instances = projectFormatV1.resolvePageInstanceTree({
    project,
    documentId: DOCUMENT_ID,
    pageId: PAGE_ID,
  });

  return renderResolvedSceneV1(instances, context());
}

function childElementIds(node: Element): readonly (string | undefined)[] {
  return Array.from(node.children, (child) =>
    child instanceof HTMLElement ? child.dataset['elementId'] : undefined,
  );
}

describe('renderResolvedSceneV1', () => {
  it('nests two ordinary children under their group in source order', () => {
    const project = createProject({
      elements: [group('group'), rectangle('first', 'group'), rectangle('second', 'group')],
      rootInstances: [rootInstance('root', 'group')],
    });

    const scene = renderProject(project);
    const groupNode = scene.firstElementChild;

    expect(scene.dataset['sceneRoot']).toBe('true');
    expect(scene.style.transformStyle).toBe('preserve-3d');
    expect(scene.style.position).toBe('relative');
    expect(scene.children).toHaveLength(1);
    expect(groupNode).not.toBeNull();
    expect(groupNode instanceof HTMLElement ? groupNode.dataset['elementId'] : undefined).toBe('group');
    expect(groupNode === null ? [] : childElementIds(groupNode)).toEqual(['first', 'second']);
  });

  it('reconstructs nested group depths into three DOM levels', () => {
    const project = createProject({
      elements: [group('outer'), group('inner', 'outer'), rectangle('leaf', 'inner')],
      rootInstances: [rootInstance('root', 'outer')],
    });

    const scene = renderProject(project);
    const outer = scene.querySelector<HTMLElement>('[data-element-id="outer"]');
    const inner = outer?.querySelector<HTMLElement>(':scope > [data-element-id="inner"]');
    const leaf = inner?.querySelector<HTMLElement>(':scope > [data-element-id="leaf"]');

    expect(outer?.parentElement).toBe(scene);
    expect(inner?.parentElement).toBe(outer);
    expect(leaf?.parentElement).toBe(inner);
  });

  it('renders two page roots as ordered top-level siblings', () => {
    const project = createProject({
      elements: [rectangle('first'), rectangle('second')],
      rootInstances: [rootInstance('first-root', 'first'), rootInstance('second-root', 'second')],
    });

    expect(childElementIds(renderProject(project))).toEqual(['first', 'second']);
  });

  it('hides a root instance whose page visibility is false', () => {
    const project = createProject({
      elements: [rectangle('hidden')],
      rootInstances: [rootInstance('root', 'hidden', false)],
    });

    const hidden = renderProject(project).querySelector<HTMLElement>('[data-element-id="hidden"]');

    expect(hidden?.style.display).toBe('none');
  });

  it('nests expanded component content under a component-instance page root', () => {
    const reusable = component('reusable', [rectangle('leaf')], ['leaf']);
    const project = createProject({
      elements: [componentInstance('instance', 'reusable')],
      rootInstances: [rootInstance('root', 'instance')],
      components: [reusable],
    });

    const scene = renderProject(project);
    const instanceNode = scene.querySelector<HTMLElement>('[data-element-id="instance"]');
    const leaf = instanceNode?.querySelector<HTMLElement>(':scope > [data-element-id="leaf"]');

    expect(instanceNode?.parentElement).toBe(scene);
    expect(leaf?.parentElement).toBe(instanceNode);
  });

  it('expands each reuse of a component into an independent nested subtree', () => {
    const reusable = component('reusable', [rectangle('leaf')], ['leaf']);
    const project = createProject({
      elements: [
        group('root-group'),
        componentInstance('first-instance', 'reusable', 'root-group'),
        componentInstance('second-instance', 'reusable', 'root-group'),
      ],
      rootInstances: [rootInstance('root', 'root-group')],
      components: [reusable],
    });

    const scene = renderProject(project);
    const firstInstance = scene.querySelector<HTMLElement>('[data-element-id="first-instance"]');
    const secondInstance = scene.querySelector<HTMLElement>('[data-element-id="second-instance"]');
    const firstLeaf = firstInstance?.querySelector<HTMLElement>(':scope > [data-element-id="leaf"]');
    const secondLeaf = secondInstance?.querySelector<HTMLElement>(':scope > [data-element-id="leaf"]');

    expect(firstLeaf?.parentElement).toBe(firstInstance);
    expect(secondLeaf?.parentElement).toBe(secondInstance);
    expect(firstLeaf).not.toBe(secondLeaf);
  });
});

describe('renderPageV1', () => {
  it('returns an empty scene root for a missing document or page', () => {
    const project = createProject({});
    const missingDocument = renderPageV1({
      project,
      documentId: MISSING_ID,
      pageId: PAGE_ID,
      context: context(),
    });
    const missingPage = renderPageV1({
      project,
      documentId: DOCUMENT_ID,
      pageId: MISSING_ID,
      context: context(),
    });

    expect(missingDocument.dataset['sceneRoot']).toBe('true');
    expect(missingDocument.children).toHaveLength(0);
    expect(missingPage.dataset['sceneRoot']).toBe('true');
    expect(missingPage.children).toHaveLength(0);
  });

  it('returns an empty scene root for a page with no root instances', () => {
    const project = createProject({});
    const scene = renderPageV1({
      project,
      documentId: DOCUMENT_ID,
      pageId: PAGE_ID,
      context: context(),
    });

    expect(scene.dataset['sceneRoot']).toBe('true');
    expect(scene.children).toHaveLength(0);
  });
});
