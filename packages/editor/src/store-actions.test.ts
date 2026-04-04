import type { BroadsetElement, BroadsetElementStyle, ElementPosition } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import type { EditorDocument, EditorStore } from './store-actions';
import { createEditorStore, createEmptyEditorDocument } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return createDefaultElement('shape', overrides);
}

function makeDoc(elements: BroadsetElement[]): EditorDocument {
  const base = createEmptyEditorDocument();

  return {
    ...base,
    pages: [{ id: 'page-1', elements }],
  };
}

function storeWithElements(...elements: BroadsetElement[]): EditorStore {
  const store = createEditorStore();

  store.getState().setDocument(makeDoc(elements));

  return store;
}

function getElements(store: EditorStore): readonly BroadsetElement[] {
  return store.getState().document.pages[0]?.elements ?? [];
}

function findElement(store: EditorStore, id: string): BroadsetElement | undefined {
  return getElements(store).find((e) => e.id === id);
}

// ===========================================================================
// Tests
// ===========================================================================

describe('EditorStore — document lifecycle', () => {
  /**
   * @description loadTemplate replaces the document and clears selection so
   * the user starts from a clean slate when opening a template.
   */
  it('R-SA-1: loadTemplate replaces document and clears selection', () => {
    const store = createEditorStore();
    const el = makeElement();
    const doc = makeDoc([el]);

    store.getState().selectElement(el.id);
    store.getState().loadTemplate(doc);

    expect(store.getState().document).toBe(doc);
    expect(store.getState().activeElementIds).toEqual([]);
  });

  /**
   * @description loadTemplate must also clear undo history so users cannot
   * undo back into the previous template's state.
   */
  it('R-SA-1: loadTemplate clears undo history', () => {
    const store = createEditorStore();

    store.getState().addElement('shape');
    store.getState().loadTemplate(createEmptyEditorDocument());
    store.getState().undo();

    expect(getElements(store)).toEqual([]);
  });

  /**
   * @description setDocument patches the document in-place without resetting
   * selection, useful for non-user-driven updates.
   */
  it('R-SA-2: setDocument patches document without clearing selection', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().selectElement(el.id);

    const newDoc = makeDoc([el, makeElement()]);

    store.getState().setDocument(newDoc);

    expect(store.getState().document).toBe(newDoc);
    expect(store.getState().activeElementIds).toEqual([el.id]);
  });

  /**
   * @description getDocument returns the current document snapshot.
   */
  it('R-SA-3: getDocument returns the current document', () => {
    const store = createEditorStore();
    const doc = store.getState().getDocument();

    expect(doc).toBe(store.getState().document);
  });

  /**
   * @description updateFeatureConfig merges provided keys into the existing
   * feature configuration.
   */
  it('R-SA-4: updateFeatureConfig merges partial config', () => {
    const store = createEditorStore();

    store.getState().updateFeatureConfig({ animations: false });

    expect(store.getState().featureConfig.animations).toBe(false);
  });
});

describe('EditorStore — selection', () => {
  /**
   * @description selectElement sets the sole active element; passing null
   * deselects everything.
   */
  it('R-SA-5: selectElement sets single selection', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().selectElement(el.id);

    expect(store.getState().activeElementIds).toEqual([el.id]);

    store.getState().selectElement(null);

    expect(store.getState().activeElementIds).toEqual([]);
  });

  /**
   * @description toggleSelectElement adds an unselected element and removes
   * an already-selected one (multi-select toggle).
   */
  it('R-SA-5: toggleSelectElement adds/removes from multi-selection', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().selectElement(a.id);
    store.getState().toggleSelectElement(b.id);

    expect(store.getState().activeElementIds).toEqual([a.id, b.id]);

    store.getState().toggleSelectElement(a.id);

    expect(store.getState().activeElementIds).toEqual([b.id]);
  });
});

describe('EditorStore — element CRUD', () => {
  /**
   * @description addElement creates a new element using createDefaultElement
   * and appends it to the active page's elements, then selects it.
   */
  it('R-SA-6: addElement inserts a default element and selects it', () => {
    const store = createEditorStore();
    const id = store.getState().addElement('shape');

    const elements = getElements(store);

    expect(elements).toHaveLength(1);
    expect(elements[0]?.id).toBe(id);
    expect(store.getState().activeElementIds).toEqual([id]);
  });

  /**
   * @description addElement with type 'text' sets content = "New Text".
   */
  it('R-SA-6: addElement(text) has default text content', () => {
    const store = createEditorStore();
    const id = store.getState().addElement('text');
    const el = findElement(store, id);

    expect(el?.content).toBe('New Text');
  });

  /**
   * @description removeElement deletes the element from the page and removes
   * it from the selection.
   */
  it('R-SA-7: removeElement deletes element and clears it from selection', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().selectElement(el.id);
    store.getState().removeElement(el.id);

    expect(getElements(store)).toHaveLength(0);
    expect(store.getState().activeElementIds).toEqual([]);
  });

  /**
   * @description removeElement must refuse to remove elements whose id is
   * listed in config.requiredElements.
   */
  it('R-SA-7: removeElement refuses to delete required elements', () => {
    const el = makeElement();
    const store = createEditorStore({
      config: { requiredElements: [el.id] },
    });

    store.getState().setDocument(makeDoc([el]));
    store.getState().removeElement(el.id);

    expect(getElements(store)).toHaveLength(1);
  });
});

describe('EditorStore — element transform', () => {
  /**
   * @description commitElementUpdate applies position/size changes and gets
   * tracked by undo history.
   */
  it('R-SA-8: commitElementUpdate applies position and size', () => {
    const el = makeElement();
    const store = storeWithElements(el);
    const pos: ElementPosition = { x: 50, y: 60 };

    store.getState().commitElementUpdate(el.id, { position: pos, width: 200 });

    const updated = findElement(store, el.id);

    expect(updated?.position).toEqual(pos);
    expect(updated?.width).toBe(200);
  });

  /**
   * @description updateElementEphemeral updates the element without pushing
   * a new undo entry, so a drag produces a single undo step.
   */
  it('R-SA-8: updateElementEphemeral does not create undo entries', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().updateElementEphemeral(el.id, { width: 300 });
    store.getState().updateElementEphemeral(el.id, { width: 400 });

    expect(findElement(store, el.id)?.width).toBe(400);

    store.getState().undo();

    const after = findElement(store, el.id);

    expect(after?.width).not.toBe(400);
  });

  /**
   * @description commitGroupMove applies position updates for multiple
   * elements at once.
   */
  it('R-SA-8: commitGroupMove updates multiple elements', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().commitGroupMove([
      { elementId: a.id, position: { x: 10, y: 20 } },
      { elementId: b.id, position: { x: 30, y: 40 } },
    ]);

    expect(findElement(store, a.id)?.position).toEqual({ x: 10, y: 20 });
    expect(findElement(store, b.id)?.position).toEqual({ x: 30, y: 40 });
  });
});

describe('EditorStore — style', () => {
  /**
   * @description updateElementStyle merges the provided partial style into
   * the element's existing style object.
   */
  it('R-SA-9: updateElementStyle merges partial style', () => {
    const el = makeElement();
    const store = storeWithElements(el);
    const style: Partial<BroadsetElementStyle> = {
      backgroundColor: '#ff0000',
    };

    store.getState().updateElementStyle(el.id, style);

    const updated = findElement(store, el.id);

    expect(updated?.style.backgroundColor).toBe('#ff0000');
  });
});

describe('EditorStore — layer reordering', () => {
  /**
   * @description reorderElement('forward') moves the element one position up
   * in the z-order.
   */
  it('R-SA-10: reorderElement forward moves element up', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().reorderElement(a.id, 'forward');

    const elements = getElements(store);

    expect(elements[0]?.id).toBe(b.id);
    expect(elements[1]?.id).toBe(a.id);
  });

  /**
   * @description reorderElement('back') moves the element to the back.
   */
  it('R-SA-10: reorderElement back sends element to bottom', () => {
    const a = makeElement();
    const b = makeElement();
    const c = makeElement();
    const store = storeWithElements(a, b, c);

    store.getState().reorderElement(c.id, 'back');

    const elements = getElements(store);

    expect(elements[0]?.id).toBe(c.id);
    expect(elements[1]?.id).toBe(a.id);
  });

  /**
   * @description reorderElement('front') moves the element to the very top.
   */
  it('R-SA-10: reorderElement front sends element to top', () => {
    const a = makeElement();
    const b = makeElement();
    const c = makeElement();
    const store = storeWithElements(a, b, c);

    store.getState().reorderElement(a.id, 'front');

    const elements = getElements(store);

    expect(elements[2]?.id).toBe(a.id);
  });
});

describe('EditorStore — undo/redo', () => {
  /**
   * @description Undo reverts the last committed state change. Redo restores
   * it.
   */
  it('R-SA-11: undo and redo restore previous state', () => {
    const store = createEditorStore();
    const id = store.getState().addElement('shape');

    expect(getElements(store)).toHaveLength(1);

    store.getState().undo();

    expect(getElements(store)).toHaveLength(0);

    store.getState().redo();

    expect(getElements(store)).toHaveLength(1);
    expect(getElements(store)[0]?.id).toBe(id);
  });

  /**
   * @description Undo must respect the configured maxUndoSteps limit so
   * memory does not grow unbounded.
   */
  it('R-SA-11: undo respects maxUndoSteps limit', () => {
    const store = createEditorStore({ config: { maxUndoSteps: 3 } });

    for (let i = 0; i < 5; i++) {
      store.getState().addElement('shape');
    }

    for (let i = 0; i < 10; i++) {
      store.getState().undo();
    }

    const remaining = getElements(store).length;

    expect(remaining).toBeGreaterThanOrEqual(2);
  });
});

describe('EditorStore — grouping', () => {
  /**
   * @description groupElements assigns a shared groupId to all currently-
   * selected elements (minimum 2).
   */
  it('R-SA-12a: groupElements assigns shared groupId', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().selectElement(a.id);
    store.getState().toggleSelectElement(b.id);
    store.getState().groupElements();

    const elA = findElement(store, a.id);
    const elB = findElement(store, b.id);

    expect(elA?.groupId).toBeTruthy();
    expect(elA?.groupId).toBe(elB?.groupId);
  });

  /**
   * @description groupElements with fewer than 2 selected elements is a
   * no-op.
   */
  it('R-SA-12a: groupElements with < 2 selected is no-op', () => {
    const a = makeElement();
    const store = storeWithElements(a);

    store.getState().selectElement(a.id);
    store.getState().groupElements();

    expect(findElement(store, a.id)?.groupId).toBeNull();
  });

  /**
   * @description ungroupElements clears the groupId on all selected elements.
   */
  it('R-SA-12a: ungroupElements clears groupId', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().selectElement(a.id);
    store.getState().toggleSelectElement(b.id);
    store.getState().groupElements();

    expect(findElement(store, a.id)?.groupId).toBeTruthy();

    store.getState().ungroupElements();

    expect(findElement(store, a.id)?.groupId).toBeNull();
    expect(findElement(store, b.id)?.groupId).toBeNull();
  });
});

describe('EditorStore — locking', () => {
  /**
   * @description toggleLock flips the element's screen.locked property. A
   * locked element should not be movable by drag (enforced at the UI layer).
   */
  it('R-SA-12b: toggleLock flips screen.locked', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    expect(findElement(store, el.id)?.screen.locked).toBe(false);

    store.getState().toggleLock(el.id);

    expect(findElement(store, el.id)?.screen.locked).toBe(true);

    store.getState().toggleLock(el.id);

    expect(findElement(store, el.id)?.screen.locked).toBe(false);
  });
});

describe('EditorStore — path editing', () => {
  /**
   * @description enterPathEditing sets editingMode to path-editing for the
   * given element.
   */
  it('enterPathEditing sets path-editing mode', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().enterPathEditing(el.id);

    expect(store.getState().editingMode).toEqual({
      type: 'path-editing',
      elementId: el.id,
    });
  });

  /**
   * @description Selecting a different element while in path-editing mode
   * must automatically exit path-editing.
   */
  it('selectElement exits path-editing when selecting different element', () => {
    const a = makeElement();
    const b = makeElement();
    const store = storeWithElements(a, b);

    store.getState().enterPathEditing(a.id);
    store.getState().selectElement(b.id);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });
});
