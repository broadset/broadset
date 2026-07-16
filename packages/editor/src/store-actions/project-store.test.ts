import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore } from './project-store';
import { selectActiveDocumentV1, selectActiveElementsV1, selectActivePageV1 } from './project-store-selectors';

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

  return options.kind === 'group' ?
      projectFormatV1.createElementV1({ ...base, kind: 'group' })
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

function createRepeatedRootProject(): projectFormatV1.BroadsetProjectV1 {
  const parent = createElement({ id: 'repeated-parent', kind: 'group' });
  const child = createElement({ id: 'repeated-child', parentId: parent.id });
  const page = projectFormatV1.createPageV1({
    id: id('repeated-page'),
    rootInstances: [
      {
        id: id('repeated-root-a'),
        elementId: parent.id,
        overrides: [],
        componentPropertyValues: [],
      },
      {
        id: id('repeated-root-b'),
        elementId: parent.id,
        overrides: [],
        componentPropertyValues: [],
      },
    ],
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('repeated-document'),
    elements: [parent, child],
    pages: [page],
  });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

describe('createProjectEditorStore', () => {
  it('selects repeated placements through collision-free instance addresses', () => {
    const store = createProjectEditorStore({ project: createRepeatedRootProject() });
    const first: projectFormatV1.InstanceAddress = {
      rootInstanceId: id('repeated-root-a'),
      componentInstancePath: [],
      elementId: id('repeated-child'),
    };
    const second: projectFormatV1.InstanceAddress = { ...first, rootInstanceId: id('repeated-root-b') };

    store.getState().selectInstance(first);
    store.getState().toggleSelectInstance(second);

    expect(store.getState().activeInstanceAddresses).toEqual([first, second]);

    store.getState().toggleSelectInstance(first);
    expect(store.getState().activeInstanceAddresses).toEqual([second]);
  });

  it('changes visibility and z-order on the addressed root instance only', () => {
    const project = createRepeatedRootProject();
    const store = createProjectEditorStore({ project });
    const address: projectFormatV1.InstanceAddress = {
      rootInstanceId: id('repeated-root-b'),
      componentInstancePath: [],
      elementId: id('repeated-child'),
    };

    expect(store.getState().toggleInstanceVisibility(address)).toBe(true);
    expect(store.getState().project.documents[0]?.pages[0]?.rootInstances).toMatchObject([
      { id: id('repeated-root-a') },
      { id: id('repeated-root-b'), visible: false },
    ]);

    expect(store.getState().reorderRootInstance(id('repeated-root-a'), 'front')).toBe(true);
    expect(store.getState().project.documents[0]?.pages[0]?.rootInstances.map(({ id: rootId }) => rootId)).toEqual([
      id('repeated-root-b'),
      id('repeated-root-a'),
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    store.getState().undo();
    expect(store.getState().project.documents[0]?.pages[0]?.rootInstances.map(({ id: rootId }) => rootId)).toEqual([
      id('repeated-root-a'),
      id('repeated-root-b'),
    ]);
  });

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
    expect(store.getState().activeInstanceAddresses).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);

    store.getState().undo();

    expect(store.getState().project).toBe(project);
    expect(store.getState().project.documents[0]?.elements.map((element) => element.id)).toEqual([parentId, childId]);

    store.getState().redo();
    expect(store.getState().project.documents[0]?.elements).toEqual([]);
  });

  it('enforces configured required element ids during direct and parent deletion', () => {
    const project = createProject();
    const parentId = project.documents[0]?.elements[0]?.id ?? id('parent');
    const childId = project.documents[0]?.elements[1]?.id ?? id('child');
    const store = createProjectEditorStore({ project, config: { requiredElements: [childId] } });

    store.getState().removeElement(childId);
    expect(store.getState().project).toBe(project);

    store.getState().removeElement(parentId);

    expect(store.getState().project.documents[0]?.elements.map(({ id: elementId }) => elementId)).toEqual([childId]);
    expect(store.getState().project.documents[0]?.elements[0]?.parentId).toBeNull();
    expect(store.getState().project.documents[0]?.pages[0]?.rootInstances[0]?.elementId).toBe(childId);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('rejects a semantically invalid project without changing state or history', () => {
    const initialProject = createProject();
    const document = initialProject.documents[0];
    const parent = document?.elements[0];

    if (document === undefined || parent === undefined) throw new Error('Expected the project fixture');

    const invalidProject: projectFormatV1.BroadsetProjectV1 = {
      ...initialProject,
      documents: [
        {
          ...document,
          elements: document.elements.map((element) =>
            element.id === parent.id ? { ...element, parentId: parent.id } : element,
          ),
        },
      ],
    };
    const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`);
    const blobs = new Map([[digest, new Uint8Array([1, 2, 3])]]);
    const store = createProjectEditorStore({ project: initialProject, blobs });

    expect(
      projectFormatV1
        .parseProjectV1Unknown(invalidProject)
        .diagnostics.some((diagnostic) => diagnostic.code === 'structural-invalid'),
    ).toBe(false);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(invalidProject)).not.toEqual([]);

    expect(store.getState().updateElement(parent.id, (element) => ({ ...element, name: 'Changed' }))).toBe(true);
    store.getState().beginPlacement('rectangle');

    const beforeState = store.getState();
    const beforeTemporalState = store.temporal.getState();

    expect(store.getState().setProject(invalidProject, new Map())).toBe(false);
    expect(store.getState()).toBe(beforeState);
    expect(store.temporal.getState()).toBe(beforeTemporalState);
  });

  it('loads a project atomically, resets project editing state, and preserves host preferences', () => {
    const initialProject = createProject();
    const replacement = projectFormatV1.createProjectV1({
      id: id('replacement-project'),
      documents: [projectFormatV1.createDocumentV1({ id: id('replacement-document') })],
    });
    const store = createProjectEditorStore({ project: initialProject });
    const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`);
    const blobs = new Map([[digest, new Uint8Array([1, 2, 3])]]);
    const parentId = initialProject.documents[0]?.elements[0]?.id ?? id('parent');
    const mediaSource = { assets: [{ id: 'media', name: 'Media', url: 'https://example.com/media.png' }] };

    expect(store.getState().updateElement(parentId, (element) => ({ ...element, name: 'Changed' }))).toBe(true);
    store.getState().updateCanvasSettings({ zoom: 1.5, panX: 40 });
    store.getState().updateGridSettings({ showGrid: true, gridSize: 24 });
    store.getState().addPaletteColor('#123456');
    store.getState().setAvailableFonts(['Inter']);
    store.getState().setMediaSource(mediaSource);
    store.setState({
      activeInstanceAddresses: [
        { rootInstanceId: id('parent-instance'), componentInstancePath: [], elementId: parentId },
      ],
      placement: { type: 'placement-anchor', elementType: 'rectangle' },
      placementPreview: { x: 10, y: 20 },
      pathEditingElementId: parentId,
      pathDrawingElementId: parentId,
      clipPathEditingElementId: parentId,
      motionPathEditingElementId: parentId,
      inlineTextEditingElementId: parentId,
      editingMode: { type: 'motion-path-editing', elementId: parentId },
      editingGuideId: 'guide',
    });

    const canvasSettings = store.getState().canvasSettings;
    const gridSettings = store.getState().gridSettings;
    const savedPalette = store.getState().savedPalette;
    const availableFonts = store.getState().availableFonts;

    expect(store.getState().setProject(replacement, blobs)).toBe(true);

    expect(store.getState().project).toBe(replacement);
    expect(store.getState().blobs).toBe(blobs);
    expect(store.getState().activeInstanceAddresses).toEqual([]);
    expect(store.getState().activeDocumentId).toBe(replacement.documents[0]?.id);
    expect(store.getState().activePageId).toBe(replacement.documents[0]?.pages[0]?.id);
    expect(store.getState().placement).toBeNull();
    expect(store.getState().placementPreview).toBeNull();
    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().clipPathEditingElementId).toBeNull();
    expect(store.getState().motionPathEditingElementId).toBeNull();
    expect(store.getState().inlineTextEditingElementId).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.getState().editingGuideId).toBeNull();
    expect(store.getState().canvasSettings).toBe(canvasSettings);
    expect(store.getState().gridSettings).toBe(gridSettings);
    expect(store.getState().savedPalette).toBe(savedPalette);
    expect(store.getState().availableFonts).toBe(availableFonts);
    expect(store.getState().mediaSource).toBe(mediaSource);
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(store.temporal.getState().futureStates).toEqual([]);

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
    expect(store.getState().activeInstanceAddresses.map(({ elementId }) => elementId)).toEqual([element.id]);
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

  it('accepts timeline and data-model document edits only when whole-project invariants survive', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });

    expect(
      store.getState().updateActiveDocument((document) => ({
        ...document,
        sequences: [
          {
            id: id('sequence'),
            name: 'Sequence',
            durationTicks: 1000,
            loop: { kind: 'none' },
            tracks: [],
            markers: [],
            cues: [],
            childClips: [],
          },
        ],
        viewModels: [
          {
            id: id('view-model'),
            name: 'Data',
            fields: [
              {
                id: id('headline'),
                name: 'headline',
                schema: { kind: 'string' },
                defaultValue: { type: 'string', value: 'Live' },
              },
            ],
            sampleDataSets: [],
          },
        ],
      })),
    ).toBe(true);
    expect(store.getState().project.documents[0]?.sequences[0]?.id).toBe(id('sequence'));
    expect(store.getState().project.documents[0]?.viewModels[0]?.fields[0]?.id).toBe(id('headline'));

    const validProject = store.getState().project;

    expect(store.getState().updateActiveDocument((document) => ({ ...document, pages: [] }))).toBe(false);
    expect(store.getState().project).toBe(validProject);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(validProject)).toEqual([]);
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
      store
        .getState()
        .project.documents[0]?.pages[0]?.rootInstances.some((instance) => instance.elementId === child.id),
    ).toBe(true);

    const beforeRejectedMove = store.getState().project;

    expect(store.getState().reparentElement(parent.id, child.id)).toBe(false);
    expect(store.getState().project).toBe(beforeRejectedMove);

    expect(store.getState().reparentElement(child.id, parent.id)).toBe(true);
    expect(store.getState().project.documents[0]?.elements[1]?.parentId).toBe(parent.id);
    expect(
      store
        .getState()
        .project.documents[0]?.pages[0]?.rootInstances.some((instance) => instance.elementId === child.id),
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
    expect(store.getState().activeInstanceAddresses).toEqual([]);
    expect(store.getState().setActivePage(id('missing-page'))).toBe(false);
    expect(store.getState().project).toBe(project);
  });

  it('adds, activates, edits, and removes v1 page override layers without invalid state', () => {
    const project = createProject();
    const store = createProjectEditorStore({ project });
    const document = project.documents[0];
    const rootElementId = document?.elements[0]?.id ?? id('parent');
    const secondPage = projectFormatV1.createPageV1({
      id: id('second-page'),
      name: 'Second page',
      rootInstances: [
        {
          id: id('second-parent-instance'),
          elementId: rootElementId,
          overrides: [],
          componentPropertyValues: [],
        },
      ],
    });

    expect(store.getState().addPage(secondPage)).toBe(true);
    expect(store.getState().setActivePage(secondPage.id)).toBe(true);
    expect(store.getState().setPageRootVisibility(id('second-parent-instance'), false)).toBe(true);
    expect(selectActivePageV1(store.getState())?.rootInstances[0]?.visible).toBe(false);

    expect(store.getState().removePage(secondPage.id)).toBe(true);
    expect(store.getState().activePageId).toBe(document?.pages[0]?.id);
    expect(store.getState().removePage(document?.pages[0]?.id ?? id('page'))).toBe(false);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
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

    expect(store.getState().activeInstanceAddresses.map(({ elementId }) => elementId)).toEqual([parentId, childId]);

    store.getState().enterPathEditing(childId);
    expect(store.getState().editingMode).toEqual({ type: 'path-editing', elementId: childId });

    store.getState().selectElement(parentId);
    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  it('starts and cancels v1 placement without mutating project history', () => {
    const store = createProjectEditorStore({ project: createProject() });

    store.getState().beginPlacement('rectangle');

    expect(store.getState().placement).toEqual({ type: 'placement-anchor', elementType: 'rectangle' });
    expect(store.getState().editingMode).toEqual({ type: 'placement-anchor', elementType: 'rectangle' });
    expect(store.temporal.getState().pastStates).toEqual([]);

    store.getState().cancelPlacement();

    expect(store.getState().placement).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.temporal.getState().pastStates).toEqual([]);
  });

  it('owns host canvas and guide state without duplicating project content', () => {
    const store = createProjectEditorStore({ project: createProject() });

    store.getState().updateCanvasSettings({ zoom: 1.5, panX: 40, panY: -20 });
    store.getState().updateGridSettings({ showGrid: true, gridSize: 24 });
    store.getState().addGuide({ type: 'v', pos: 120, locked: false });

    expect(store.getState().canvasSettings).toMatchObject({
      zoom: 1.5,
      panX: 40,
      panY: -20,
      grid: { showGrid: true, gridSize: 24 },
    });
    expect(store.getState().gridSettings).toMatchObject({ showGrid: true, gridSize: 24 });
    expect(store.getState().canvasSettings.guides).toEqual([
      expect.objectContaining({ type: 'v', pos: 120, locked: false }),
    ]);
    expect(store.getState().project).toBe(store.getState().getProject());
  });

  it('provides identity-based host command wrappers over v1 mutations', () => {
    const initial = createProject();
    const document = initial.documents[0];
    const secondPage = projectFormatV1.createPageV1({
      id: id('second-page'),
      rootInstances: document?.pages[0]?.rootInstances ?? [],
    });
    const project: projectFormatV1.BroadsetProjectV1 = {
      ...initial,
      documents: document === undefined ? initial.documents : [{ ...document, pages: [...document.pages, secondPage] }],
    };
    const store = createProjectEditorStore({ project });
    const parentId = document?.elements[0]?.id ?? id('parent');
    const childId = document?.elements[1]?.id ?? id('child');

    expect(store.getState().switchPage(1)).toBe(true);
    expect(store.getState().activePageId).toBe(secondPage.id);
    expect(store.getState().toggleLock(childId)).toBe(true);
    expect(selectActiveDocumentV1(store.getState())?.elements[1]?.locked).toBe(true);
    expect(store.getState().toggleVisibility(childId)).toBe(true);
    expect(selectActivePageV1(store.getState())?.rootInstances[0]?.visible).toBe(false);

    store.getState().removeElement(childId);
    expect(selectActiveDocumentV1(store.getState())?.elements.map(({ id: elementId }) => elementId)).toEqual([
      parentId,
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
