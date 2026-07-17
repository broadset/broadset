import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore, type ProjectClipboardPortV1 } from './project-store';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createClipboardProject(): projectFormatV1.BroadsetProjectV1 {
  const parent = projectFormatV1.createElementV1({
    id: id('clipboard-parent'),
    name: 'Clipboard parent',
    geometry: projectFormatV1.createElementGeometry({
      width: 100,
      height: 100,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] },
    }),
    kind: 'group',
  });
  const child = projectFormatV1.createElementV1({
    id: id('clipboard-child'),
    name: 'Clipboard child',
    parentId: parent.id,
    geometry: projectFormatV1.createElementGeometry({ width: 20, height: 20 }),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
  const pages = [
    projectFormatV1.createPageV1({
      id: id('clipboard-page-1'),
      rootInstances: [
        {
          id: id('clipboard-instance'),
          elementId: parent.id,
          overrides: [],
          componentPropertyValues: [],
        },
      ],
    }),
    projectFormatV1.createPageV1({ id: id('clipboard-page-2') }),
  ];
  const document = projectFormatV1.createDocumentV1({ id: id('clipboard-document'), elements: [parent, child], pages });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

function createIdFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`generated-${String(next++)}`);
}

describe('project v1 clipboard actions', () => {
  it('copies a selected subtree, pastes it cross-page with remapped identities, and preserves validity', async () => {
    const store = createProjectEditorStore({ project: createClipboardProject(), createId: createIdFactory() });

    store.getState().selectElement(id('clipboard-parent'));
    expect(await store.getState().copySelection()).toBe(true);
    expect(store.getState().hasInternalClipboard).toBe(true);
    expect(store.getState().setActivePage(id('clipboard-page-2'))).toBe(true);
    expect(await store.getState().pasteClipboard()).toBe(true);

    const state = store.getState();
    const pastedIds = state.activeInstanceAddresses.map(({ elementId }) => elementId);
    const document = state.project.documents[0];
    const pastedParent = document?.elements.find(({ id }) => id === pastedIds[0]);

    expect(pastedParent).toMatchObject({ name: 'Clipboard parent copy', parentId: null });
    if (pastedParent === undefined) return;

    const pastedChild = document?.elements.find(({ parentId }) => parentId === pastedParent.id);

    expect(pastedChild).toMatchObject({ name: 'Clipboard child', parentId: pastedParent.id });
    expect(document?.pages[1]?.rootInstances.map(({ elementId }) => elementId)).toContain(pastedParent.id);
    expect(projectFormatV1.parseProjectV1Unknown(state.project).status).toBe('loaded');
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(state.project)).toEqual([]);
  });

  it('regenerates nested owned-entity ids when pasting into the source document', async () => {
    const filled = projectFormatV1.createElementV1({
      id: id('filled'),
      name: 'Filled',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: id('the-fill'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: projectFormatV1.createBlackColorValue() },
          },
        ],
      },
    });
    const page = projectFormatV1.createPageV1({
      id: id('fill-page'),
      rootInstances: [{ id: id('fill-instance'), elementId: filled.id, overrides: [], componentPropertyValues: [] }],
    });
    const document = projectFormatV1.createDocumentV1({ id: id('fill-document'), elements: [filled], pages: [page] });
    const project = projectFormatV1.createProjectV1({ documents: [document] });
    const store = createProjectEditorStore({ project, createId: createIdFactory() });

    store.getState().selectElement(id('filled'));
    expect(await store.getState().copySelection()).toBe(true);
    expect(await store.getState().pasteClipboard()).toBe(true);

    const pasted = store.getState().project.documents[0];
    const fillIds = pasted?.elements.flatMap((element) => element.appearance.fills.map((fill) => fill.id)) ?? [];

    expect(fillIds).toHaveLength(2);
    expect(new Set(fillIds).size).toBe(2);
    expect(fillIds).toContain(id('the-fill'));
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('uses the system port when available, replaces the internal payload, and makes cut undoable', async () => {
    let systemPayload: string | null = null;
    const clipboard: ProjectClipboardPortV1 = {
      read(): Promise<string | null> {
        return Promise.resolve(systemPayload);
      },
      write(payload: string): Promise<boolean> {
        systemPayload = payload;

        return Promise.resolve(true);
      },
    };
    const store = createProjectEditorStore({
      project: createClipboardProject(),
      createId: createIdFactory(),
      clipboard,
    });

    store.getState().selectElement(id('clipboard-child'));
    expect(await store.getState().copySelection()).toBe(true);

    const firstPayload = systemPayload;

    store.getState().selectElement(id('clipboard-parent'));
    expect(await store.getState().cutSelection()).toBe(true);
    expect(systemPayload).not.toBe(firstPayload);
    expect(store.getState().project.documents[0]?.elements).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().project.documents[0]?.elements).toHaveLength(2);
    store.getState().clearClipboard();
    expect(store.getState().hasInternalClipboard).toBe(false);
  });
});
