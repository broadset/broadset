import { createDefaultAnimationConfig, createDefaultFeatureConfig, type Timeline } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createEditorStore } from './store-actions';
import { findElement, getElements, makeDocument, makeElement, storeWithElements } from './store-actions-test-helpers';

describe('EditorStore - document lifecycle', () => {
  /** @description Loading a new template must replace the whole document, derive print defaults, and clear any previous selection/history. */
  it('loads a template and resets undo history for the new mode', () => {
    const store = createEditorStore();
    const existingId = store.getState().addElement('text');

    store.getState().selectElement(existingId);

    const printDocument = makeDocument([makeElement({ type: 'text' })], 'print');

    store.getState().loadTemplate(printDocument);

    expect(store.getState().document).toBe(printDocument);
    expect(store.getState().documentMode).toBe('print');
    expect(store.getState().featureConfig).toEqual(createDefaultFeatureConfig('print'));
    expect(store.getState().activeElementIds).toEqual([]);

    store.getState().undo();
    expect(store.getState().document).toBe(printDocument);
  });

  /** @description Replacing the document directly must swap the snapshot so external integrations can push a new state in one call. */
  it('replaces state via setDocument and exposes it via getDocument', () => {
    const store = createEditorStore();
    const document = makeDocument([makeElement(), makeElement({ type: 'ellipse' })]);

    store.getState().setDocument(document);

    expect(store.getState().document).toBe(document);
    expect(store.getState().getDocument()).toBe(document);
  });

  /** @description Partial feature overrides must change only the requested keys and preserve the rest of the capability flags. */
  it('merges partial feature config updates without clobbering unspecified flags', () => {
    const store = createEditorStore();
    const previous = store.getState().featureConfig;

    store.getState().updateFeatureConfig({ animations: false });

    expect(store.getState().featureConfig.animations).toBe(false);
    expect(store.getState().featureConfig.exportPdf).toBe(previous.exportPdf);
  });
});

describe('EditorStore - animation config actions', () => {
  /** @description Animation authoring writes belong to the editor store so demo adapters do not mutate document.animations directly. */
  it('updates one element animation config without duplicating entries or touching other animations', () => {
    const timeline: Timeline = {
      id: 'timeline-1',
      name: 'Intro',
      durationMs: 1000,
      loop: 'none',
      keyframes: [],
    };
    const otherTimeline: Timeline = {
      id: 'timeline-2',
      name: 'Other',
      durationMs: 500,
      loop: 'none',
      keyframes: [],
    };
    const store = createEditorStore();
    const firstElementId = 'element-1';
    const secondElementId = 'element-2';
    const firstConfig = store.getState().updateElementAnimationConfig(firstElementId, (config) => ({
      ...config,
      timelines: [timeline],
    }));

    store.getState().updateElementAnimationConfig(secondElementId, (config) => ({
      ...config,
      timelines: [otherTimeline],
    }));

    const updatedFirstConfig = store.getState().updateElementAnimationConfig(firstElementId, (config) => ({
      ...config,
      timelines: [...config.timelines, { ...timeline, id: 'timeline-1b', name: 'Intro Copy' }],
    }));

    expect(firstConfig.timelines).toEqual([timeline]);
    expect(updatedFirstConfig.timelines.map((entry) => entry.id)).toEqual(['timeline-1', 'timeline-1b']);
    expect(store.getState().document.animations).toHaveLength(2);
    expect(store.getState().document.animations.find((entry) => entry.elementId === secondElementId)?.config.timelines).toEqual([
      otherTimeline,
    ]);
    expect(store.getState().getElementAnimationConfig(firstElementId)).toBe(updatedFirstConfig);
    expect(store.getState().getElementAnimationConfig('missing')).toBeNull();
  });

  /** @description Removing animation config must leave an empty document animation array without weakening the default config factory. */
  it('removes element animation config entries', () => {
    const store = createEditorStore();
    const elementId = 'element-1';

    store.getState().updateElementAnimationConfig(elementId, (config) => ({
      ...config,
      timelines: createDefaultAnimationConfig().timelines,
    }));
    store.getState().removeElementAnimationConfig(elementId);

    expect(store.getState().document.animations).toEqual([]);
  });
});

describe('EditorStore - selection and editing exits', () => {
  /** @description Single selection, clearing selection, and toggle multi-selection are the foundation for all later canvas interactions. */
  it('supports single selection, clearing, and toggle multi-selection', () => {
    const first = makeElement();
    const second = makeElement({ type: 'ellipse' });
    const store = storeWithElements(first, second);

    store.getState().selectElement(first.id);
    expect(store.getState().activeElementIds).toEqual([first.id]);

    store.getState().toggleSelectElement(second.id);
    expect(store.getState().activeElementIds).toEqual([first.id, second.id]);

    store.getState().toggleSelectElement(first.id);
    expect(store.getState().activeElementIds).toEqual([second.id]);

    store.getState().selectElement(null);
    expect(store.getState().activeElementIds).toEqual([]);
  });

  /** @description Selecting a different element or clearing selection must automatically exit path editing so the editor never shows stale edit overlays. */
  it('exits path editing when selection changes away from the edited element', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rectangle = makeElement();
    const store = storeWithElements(path, rectangle);

    store.getState().enterPathEditing(path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);

    store.getState().selectElement(rectangle.id);
    expect(store.getState().pathEditingElementId).toBeNull();
  });
});

describe('EditorStore - CRUD and committed vs ephemeral updates', () => {
  /** @description Adding by type must use element factory defaults, select the new element, and auto-enter path drawing for empty paths. */
  it('adds new elements with defaults and auto-enters drawing for paths', () => {
    const store = createEditorStore();

    const textId = store.getState().addElement('text');
    const text = findElement(store, textId);

    expect(text?.content).toBe('New Text');
    expect(store.getState().activeElementIds).toEqual([textId]);

    const pathId = store.getState().addElement('path');

    expect(store.getState().pathDrawingElementId).toBe(pathId);
  });

  /** @description Removing an element must also deselect it, while configured required elements must remain protected from deletion. */
  it('removes normal elements but blocks required elements from deletion', () => {
    const removable = makeElement();
    const required = makeElement({ type: 'text' });
    const store = createEditorStore({ config: { requiredElements: [required.id] } });

    store.getState().setDocument(makeDocument([removable, required]));
    store.getState().selectElement(removable.id);
    store.getState().removeElement(removable.id);

    expect(findElement(store, removable.id)).toBeUndefined();
    expect(store.getState().activeElementIds).toEqual([]);

    store.getState().removeElement(required.id);
    expect(findElement(store, required.id)).toBeDefined();
  });

  /** @description Deleting a parent must promote any required descendants to the root while deleting non-required descendants from the same subtree. */
  it('promotes required descendants when deleting their parent', () => {
    const parent = makeElement({ type: 'group', position: { x: 8, y: 12 } });
    const requiredChild = makeElement({
      type: 'text',
      parentId: parent.id,
      position: { x: 24, y: 48 },
    });
    const ordinaryChild = makeElement({
      type: 'rectangle',
      parentId: parent.id,
      position: { x: 30, y: 60 },
    });
    const store = createEditorStore({ config: { requiredElements: [requiredChild.id] } });

    store.getState().setDocument(makeDocument([parent, requiredChild, ordinaryChild]));
    store.getState().removeElement(parent.id);

    const promotedChild = findElement(store, requiredChild.id);

    expect(findElement(store, parent.id)).toBeUndefined();
    expect(promotedChild).toBeDefined();
    expect(promotedChild?.parentId).toBeNull();
    expect(promotedChild?.position).toEqual({ x: 24, y: 48 });
    expect(findElement(store, ordinaryChild.id)).toBeUndefined();
  });

  /** @description Ephemeral updates must change live geometry without creating a new undo step, while committed updates must be undoable. */
  it('keeps ephemeral updates out of history but records committed updates', () => {
    const element = makeElement();
    const store = storeWithElements(element);

    store.getState().updateElementEphemeral(element.id, { width: 180 });
    expect(findElement(store, element.id)?.width).toBe(180);

    store.getState().commitElementUpdate(element.id, { width: 240, position: { x: 12, y: 18 } });
    expect(findElement(store, element.id)?.width).toBe(240);

    store.getState().undo();
    expect(findElement(store, element.id)?.width).toBe(180);

    store.getState().redo();
    expect(findElement(store, element.id)?.position).toEqual({ x: 12, y: 18 });
  });

  /** @description Group moves must batch multiple element translations into one undo snapshot so a single undo restores the whole drag. */
  it('commits group moves as a single undoable snapshot', () => {
    const first = makeElement({ position: { x: 1, y: 2 } });
    const second = makeElement({ position: { x: 3, y: 4 } });
    const store = storeWithElements(first, second);

    store.getState().commitGroupMove([
      { elementId: first.id, position: { x: 10, y: 20 } },
      { elementId: second.id, position: { x: 30, y: 40 } },
    ]);

    expect(findElement(store, first.id)?.position).toEqual({ x: 10, y: 20 });
    expect(findElement(store, second.id)?.position).toEqual({ x: 30, y: 40 });

    store.getState().undo();
    expect(findElement(store, first.id)?.position).toEqual({ x: 1, y: 2 });
    expect(findElement(store, second.id)?.position).toEqual({ x: 3, y: 4 });
  });

  /** @description Style changes must update the element immediately and remain reversible through undo/redo like any other committed edit. */
  it('updates element style as an undoable committed change', () => {
    const element = makeElement({ type: 'text' });
    const store = storeWithElements(element);

    store.getState().updateElementStyle(element.id, { fontSize: 24, fontColor: '#ff0000' });
    expect(findElement(store, element.id)?.style.fontSize).toBe(24);

    store.getState().undo();
    expect(findElement(store, element.id)?.style.fontSize).not.toBe(24);
  });

  /** @description Toggling visibility for a child element without its own page instance must create a page-level override instead of no-oping, so nested layer rows can be hidden independently from their parent. */
  it('creates a page visibility override when toggling a child element', () => {
    const parent = makeElement({ id: 'el-parent', type: 'group' });
    const child = makeElement({ id: 'el-child', type: 'text', parentId: parent.id });
    const baseDocument = makeDocument([parent, child]);
    const store = createEditorStore();

    store.getState().setDocument({
      ...baseDocument,
      pages: baseDocument.pages.map((page) => ({
        ...page,
        elements: [
          {
            elementId: parent.id,
            transform: {
              position: { x: parent.position.x, y: parent.position.y, z: 0 },
              rotation: { x: 0, y: 0, z: parent.rotation },
              scale: { x: 1, y: 1, z: 1 },
            },
            visible: true,
          },
        ],
      })),
    });

    store.getState().toggleVisibility(child.id);

    const hiddenChildInstance = store
      .getState()
      .document.pages[0]?.elements.find((instance) => instance.elementId === child.id);

    expect(hiddenChildInstance?.visible).toBe(false);

    store.getState().toggleVisibility(child.id);

    const visibleChildInstance = store
      .getState()
      .document.pages[0]?.elements.find((instance) => instance.elementId === child.id);

    expect(visibleChildInstance?.visible).toBe(true);
  });
});

describe('EditorStore - order, grouping, locking, and history bounds', () => {
  /** @description Reordering must support forward/front/back moves and preserve the shared document array order used for stacking on canvas. */
  it('reorders elements through the document element array', () => {
    const first = makeElement({ name: 'A' });
    const second = makeElement({ name: 'B' });
    const third = makeElement({ name: 'C' });
    const store = storeWithElements(first, second, third);

    store.getState().reorderElement(first.id, 'forward');
    expect(getElements(store).map((element) => element.id)).toEqual([second.id, first.id, third.id]);

    store.getState().reorderElement(first.id, 'front');
    expect(getElements(store).at(-1)?.id).toBe(first.id);

    store.getState().reorderElement(third.id, 'back');
    expect(getElements(store)[0]?.id).toBe(third.id);
  });

  /** @description Grouping must require a multi-selection, assign one shared groupId, and ungrouping must clear it again. */
  it('groups and ungroups the current multi-selection', () => {
    const first = makeElement();
    const second = makeElement({ type: 'ellipse' });
    const store = storeWithElements(first, second);

    store.getState().selectElement(first.id);
    store.getState().groupElements();

    expect(findElement(store, first.id)?.groupId).toBeNull();

    store.getState().toggleSelectElement(second.id);
    store.getState().groupElements();

    const groupId = findElement(store, first.id)?.groupId;

    expect(groupId).toBeTruthy();
    expect(findElement(store, second.id)?.groupId).toBe(groupId);

    store.getState().ungroupElements();
    expect(findElement(store, first.id)?.groupId).toBeNull();
    expect(findElement(store, second.id)?.groupId).toBeNull();
  });

  /** @description Lock toggling must flip the top-level locked flag so later canvas tools can block transforms for protected elements. */
  it('toggles the element locked flag', () => {
    const element = makeElement({ locked: false });
    const store = storeWithElements(element);

    expect(findElement(store, element.id)?.locked).toBe(false);
    store.getState().toggleLock(element.id);
    expect(findElement(store, element.id)?.locked).toBe(true);
  });

  /** @description The undo stack must remain bounded by maxUndoSteps so long editing sessions do not grow memory without limit. */
  it('drops the oldest history entries after the configured undo limit', () => {
    const store = createEditorStore({ config: { maxUndoSteps: 3 } });

    for (let index = 0; index < 5; index += 1) {
      store.getState().addElement('rectangle');
    }

    for (let index = 0; index < 10; index += 1) {
      store.getState().undo();
    }

    expect(getElements(store).length).toBeGreaterThanOrEqual(2);
  });
});
