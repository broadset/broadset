import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore } from './project-store';
import {
  selectActiveDocumentV1,
  selectActiveElementsV1,
  selectActivePageV1,
} from './project-store-selectors';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createElement(options: {
  readonly id: string;
  readonly kind?: 'group' | 'vector';
  readonly parentId?: projectFormatV1.Id | null;
}): projectFormatV1.Element {
  const base = {
    id: id(options.id),
    name: options.id,
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
  };

  return options.kind === 'group'
    ? projectFormatV1.createElementV1({ ...base, kind: 'group' })
    : projectFormatV1.createElementV1({
        ...base,
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      });
}

function createProject(): projectFormatV1.BroadsetProjectV1 {
  const parent = createElement({ id: 'parent', kind: 'group' });
  const child = createElement({ id: 'child', parentId: parent.id });
  const page = projectFormatV1.createPageV1({
    id: id('page'),
    rootInstances: [
      {
        id: id('parent-instance'),
        elementId: parent.id,
        overrides: [],
        componentPropertyValues: [],
      },
    ],
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('document'),
    elements: [parent, child],
    pages: [page],
  });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

describe('createProjectEditorStore', () => {
  it('uses a BroadsetProjectV1 as its only persisted document source of truth', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });

    expect(store.getState().project).toBe(project);
    expect(store.getState().activeDocumentId).toBe(project.documents[0]?.id);
    expect(store.getState().activePageId).toBe(project.documents[0]?.pages[0]?.id);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('deletes through the invariant kernel and restores the project through undo', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const parentId = project.documents[0]?.elements[0]?.id ?? id('parent');
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');

    store.getState().setActiveElements([parentId, childId]);
    store.getState().removeElements([parentId]);

    expect(store.getState().project.documents[0]?.elements).toEqual([]);
    expect(store.getState().activeElementIds).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    store.getState().undo();

    expect(store.getState().project).toBe(project);
    expect(store.getState().project.documents[0]?.elements.map((element) => element.id)).toEqual([
      parentId,
      childId,
    ]);

    store.getState().redo();
    expect(store.getState().project.documents[0]?.elements).toEqual([]);
  });

  it('loads a project atomically and resets selection plus undo history', () => {
    const initialProject = createProject();
    const replacement = projectFormatV1.createProjectV1({
      id: id('replacement-project'),
      documents: [projectFormatV1.createDocumentV1({ id: id('replacement-document') })],
    });
    const store = createProjectEditorStore({ project: initialProject });

    store.getState().setActiveElements([initialProject.documents[0]?.elements[0]?.id ?? id('parent')]);
    store.getState().setProject(replacement);

    expect(store.getState().project).toBe(replacement);
    expect(store.getState().activeElementIds).toEqual([]);
    expect(store.getState().activeDocumentId).toBe(replacement.documents[0]?.id);

    store.getState().undo();
    expect(store.getState().project).toBe(replacement);
  });

  it('adds a root element to the active document and page as one undoable edit', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const element = createElement({ id: 'new-element' });

    store.getState().addElement(element);

    const document = store.getState().project.documents[0];

    expect(document?.elements.at(-1)).toBe(element);
    expect(document?.pages[0]?.rootInstances.at(-1)?.elementId).toBe(element.id);
    expect(store.getState().activeElementIds).toEqual([element.id]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    store.getState().undo();
    expect(store.getState().project).toBe(project);
  });

  it('accepts only whole-element updates that preserve project invariants', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');

    const updated = store.getState().updateElement(childId, (element) => ({
      ...element,
      name: 'Renamed child',
      geometry: {
        ...element.geometry,
        bounds: { ...element.geometry.bounds, width: 240 },
      },
    }));

    expect(updated).toBe(true);
    expect(store.getState().project.documents[0]?.elements[1]?.name).toBe('Renamed child');
    expect(store.getState().project.documents[0]?.elements[1]?.geometry.bounds.width).toBe(240);

    const beforeInvalidUpdate = store.getState().project;
    const rejected = store.getState().updateElement(childId, (element) => ({
      ...element,
      parentId: id('missing-parent'),
    }));

    expect(rejected).toBe(false);
    expect(store.getState().project).toBe(beforeInvalidUpdate);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('reparents elements while maintaining root placements and rejecting invalid parents', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const parent = project.documents[0]?.elements[0];
    const child = project.documents[0]?.elements[1];

    if (parent === undefined || child === undefined) throw new Error('Expected the fixture elements');

    expect(store.getState().reparentElement(child.id, null)).toBe(true);
    expect(store.getState().project.documents[0]?.elements[1]?.parentId).toBeNull();
    expect(
      store.getState().project.documents[0]?.pages[0]?.rootInstances.some((instance) => instance.elementId === child.id),
    ).toBe(true);

    const beforeRejectedMove = store.getState().project;

    expect(store.getState().reparentElement(parent.id, child.id)).toBe(false);
    expect(store.getState().project).toBe(beforeRejectedMove);

    expect(store.getState().reparentElement(child.id, parent.id)).toBe(true);
    expect(store.getState().project.documents[0]?.elements[1]?.parentId).toBe(parent.id);
    expect(
      store.getState().project.documents[0]?.pages[0]?.rootInstances.some((instance) => instance.elementId === child.id),
    ).toBe(false);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('reorders only among siblings and records the order in project history', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const parentId = project.documents[0]?.elements[0]?.id ?? id('parent');
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');
    const sibling = createElement({ id: 'sibling', parentId });

    store.getState().addElement(sibling);
    expect(store.getState().reorderElement(childId, 'front')).toBe(true);

    expect(store.getState().project.documents[0]?.elements.map((element) => element.id)).toEqual([
      parentId,
      sibling.id,
      childId,
    ]);

    store.getState().undo();
    expect(store.getState().project.documents[0]?.elements.map((element) => element.id)).toEqual([
      parentId,
      childId,
      sibling.id,
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('switches active documents and pages without duplicating document state', () => {
    const firstDocument = createProject().documents[0];

    if (firstDocument === undefined) throw new Error('Expected the first document');

    const secondDocument = projectFormatV1.createDocumentV1({
      id: id('second-document'),
      pages: [projectFormatV1.createPageV1({ id: id('second-page') })],
    });
    const project = projectFormatV1.createProjectV1({ documents: [firstDocument, secondDocument] });
    const store = createProjectEditorStore({ project });

    store.getState().setActiveElements([firstDocument.elements[0]?.id ?? id('parent')]);

    expect(store.getState().setActiveDocument(secondDocument.id)).toBe(true);
    expect(store.getState().activeDocumentId).toBe(secondDocument.id);
    expect(store.getState().activePageId).toBe(secondDocument.pages[0]?.id);
    expect(store.getState().activeElementIds).toEqual([]);
    expect(store.getState().setActivePage(id('missing-page'))).toBe(false);
    expect(store.getState().project).toBe(project);
  });

  it('keeps ephemeral geometry outside history and commits grouped moves as one project edit', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const parentId = project.documents[0]?.elements[0]?.id ?? id('parent');
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');

    store.getState().updateElementEphemeral(childId, { width: 180 });
    store.getState().commitElementUpdate(childId, { width: 240, position: { x: 12, y: 18 } });

    expect(store.getState().project.documents[0]?.elements[1]?.geometry.bounds.width).toBe(240);
    expect(store.getState().project.documents[0]?.elements[1]?.geometry.transform).toEqual({
      kind: 'affine2d',
      matrix: [1, 0, 0, 1, 12, 18],
    });

    store.getState().undo();
    expect(store.getState().project.documents[0]?.elements[1]?.geometry.bounds.width).toBe(180);

    store.getState().commitGroupMove([
      { elementId: parentId, position: { x: 20, y: 30 } },
      { elementId: childId, position: { x: 40, y: 50 } },
    ]);
    expect(store.getState().project.documents[0]?.elements.map((element) => element.geometry.transform)).toEqual([
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 20, 30] },
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 40, 50] },
    ]);

    store.getState().undo();
    expect(store.getState().project.documents[0]?.elements.map((element) => element.geometry.transform)).toEqual([
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
    ]);
  });

  it('derives active documents, pages, and elements without duplicating them in state', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const elementId = project.documents[0]?.elements[1]?.id ?? id('child');

    store.getState().setActiveElements([elementId]);

    expect(selectActiveDocumentV1(store.getState())).toBe(project.documents[0]);
    expect(selectActivePageV1(store.getState())).toBe(project.documents[0]?.pages[0]);
    expect(selectActiveElementsV1(store.getState())).toEqual([project.documents[0]?.elements[1]]);
  });

  it('keeps selection and editing-mode side effects on v1 element identities', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const parentId = project.documents[0]?.elements[0]?.id ?? id('parent');
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');

    store.getState().selectElement(parentId);
    store.getState().toggleSelectElement(childId);

    expect(store.getState().activeElementIds).toEqual([parentId, childId]);

    store.getState().enterPathEditing(childId);
    expect(store.getState().editingMode).toEqual({ type: 'path-editing', elementId: childId });

    store.getState().selectElement(parentId);
    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });
});
