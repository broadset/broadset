import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createDefaultFeatureConfig,
  createEmptyBroadsetDocument,
  type ElementOverrides,
} from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { createEditorStore, type NamedSnapshot } from './store-actions';

type ElementFactoryOverrides = ElementOverrides & {
  readonly type?: string;
};

function makeElement(overrides: ElementFactoryOverrides = {}): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

function makeDocument(elements: readonly BroadsetElement[], mode: 'screen' | 'print' = 'screen'): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    documentMode: mode,
    elements,
  };
}

function storeWithElements(...elements: readonly BroadsetElement[]) {
  const store = createEditorStore();

  store.getState().setDocument(makeDocument(elements));

  return store;
}

function getElements(store: ReturnType<typeof createEditorStore>): readonly BroadsetElement[] {
  return store.getState().document.elements;
}

function findElement(store: ReturnType<typeof createEditorStore>, elementId: string): BroadsetElement | undefined {
  return getElements(store).find((element) => element.id === elementId);
}

describe('EditorStore — document lifecycle', () => {
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

describe('EditorStore — selection and editing exits', () => {
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

describe('EditorStore — CRUD and committed vs ephemeral updates', () => {
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
});

describe('EditorStore — order, grouping, locking, and history bounds', () => {
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

describe('Named Snapshots', () => {
  /** @description Creating a snapshot must store a full clone of the current document with a name and timestamp. */
  it('creates a snapshot with name, timestamp, and document clone', () => {
    const store = createEditorStore();
    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([el]);

    store.getState().loadTemplate(doc);

    const snapshotId = store.getState().saveSnapshot('Before animation');
    const snapshots = store.getState().snapshots;

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.id).toBe(snapshotId);
    expect(snapshots[0]?.name).toBe('Before animation');
    expect(snapshots[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshots[0]?.document.elements).toHaveLength(1);
    expect(snapshots[0]?.document.elements[0]?.id).toBe('el-1');
  });

  /** @description Snapshot document must be a deep clone so later edits don't retroactively alter the saved state. */
  it('stores a deep clone of the document', () => {
    const store = createEditorStore();
    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([el]);

    store.getState().loadTemplate(doc);
    store.getState().saveSnapshot('Checkpoint');

    // Modify the document after snapshot
    store.getState().addElement('rectangle');

    const snapshot = store.getState().snapshots[0];

    expect(snapshot?.document.elements).toHaveLength(1);
    expect(store.getState().document.elements.length).toBeGreaterThan(1);
  });

  /** @description Restoring a snapshot must replace the document state and make the restoration undoable via undo. */
  it('restores a snapshot and makes the restoration undoable', () => {
    const store = createEditorStore();
    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([el]);

    store.getState().loadTemplate(doc);
    store.getState().saveSnapshot('Checkpoint');

    // Add more elements to diverge from snapshot
    store.getState().addElement('rectangle');
    store.getState().addElement('ellipse');

    expect(store.getState().document.elements.length).toBe(3);

    // Restore the snapshot
    const snapshotId = store.getState().snapshots[0]?.id;

    if (!snapshotId) {
      throw new Error('Snapshot not found');
    }

    store.getState().restoreSnapshot(snapshotId);

    expect(store.getState().document.elements).toHaveLength(1);
    expect(store.getState().document.elements[0]?.id).toBe('el-1');

    // Undo should revert the restoration
    store.getState().undo();
    expect(store.getState().document.elements).toHaveLength(3);

    // Redo should re-apply the restoration
    store.getState().redo();
    expect(store.getState().document.elements).toHaveLength(1);
    expect(store.getState().document.elements[0]?.id).toBe('el-1');
  });

  /** @description Deleting a snapshot must remove it from the list. */
  it('deletes a snapshot', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    const id1 = store.getState().saveSnapshot('Snap 1');
    const _id2 = store.getState().saveSnapshot('Snap 2');
    const id3 = store.getState().saveSnapshot('Snap 3');

    expect(store.getState().snapshots).toHaveLength(3);

    store.getState().deleteSnapshot(id1);

    expect(store.getState().snapshots).toHaveLength(2);
    expect(store.getState().snapshots.map((s) => s.id)).toEqual([_id2, id3]);
  });

  /** @description Creating a 21st snapshot when 20 already exist must fail. */
  it('rejects creation when 20 snapshots exist', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    for (let i = 0; i < 20; i += 1) {
      store.getState().saveSnapshot(`Snap ${String(i + 1)}`);
    }

    expect(store.getState().snapshots).toHaveLength(20);

    expect(() => {
      store.getState().saveSnapshot('Snap 21');
    }).toThrow();

    expect(store.getState().snapshots).toHaveLength(20);
  });

  /** @description Creating a snapshot with a duplicate name must fail. */
  it('rejects creation with a duplicate name', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));
    store.getState().saveSnapshot('Checkpoint');

    expect(() => {
      store.getState().saveSnapshot('Checkpoint');
    }).toThrow();

    expect(store.getState().snapshots).toHaveLength(1);
  });

  /** @description Renaming a snapshot must update the name while keeping the id and document. */
  it('renames a snapshot', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    const id = store.getState().saveSnapshot('Old Name');

    store.getState().renameSnapshot(id, 'New Name');

    expect(store.getState().snapshots[0]?.name).toBe('New Name');
    expect(store.getState().snapshots[0]?.id).toBe(id);
  });

  /** @description Renaming to a duplicate name must fail. */
  it('rejects renaming to a duplicate name', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));
    store.getState().saveSnapshot('Alpha');

    const id2 = store.getState().saveSnapshot('Beta');

    expect(() => {
      store.getState().renameSnapshot(id2, 'Alpha');
    }).toThrow();

    expect(store.getState().snapshots[1]?.name).toBe('Beta');
  });

  /** @description Saving a snapshot with an empty name must fail. */
  it('rejects creation with empty name', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    expect(() => {
      store.getState().saveSnapshot('');
    }).toThrow();

    expect(store.getState().snapshots).toHaveLength(0);
  });

  /** @description Restoring a non-existent snapshot must be a no-op. */
  it('is a no-op when restoring a non-existent snapshot', () => {
    const store = createEditorStore();
    const el = makeElement({ id: 'el-1' });

    store.getState().loadTemplate(makeDocument([el]));

    // Should not throw
    store.getState().restoreSnapshot('non-existent-id');
    expect(store.getState().document.elements).toHaveLength(1);
  });

  /** @description Restoring a snapshot must clear active selection and editing state to avoid stale references. */
  it('clears selection and editing state when restoring a snapshot', () => {
    const store = createEditorStore();
    const el1 = makeElement({ id: 'el-1' });
    const el2 = makeElement({ id: 'el-2' });

    store.getState().loadTemplate(makeDocument([el1, el2]));
    store.getState().selectElement('el-1');
    store.getState().saveSnapshot('Check');

    // Select a different element
    store.getState().selectElement('el-2');
    expect(store.getState().activeElementIds).toEqual(['el-2']);

    // Restore — selection must be cleared
    const snapshotId = store.getState().snapshots[0]?.id;

    if (!snapshotId) {
      throw new Error('Snapshot not found');
    }

    store.getState().restoreSnapshot(snapshotId);
    expect(store.getState().activeElementIds).toEqual([]);
    expect(store.getState().pathEditingElementId).toBeNull();
  });

  /** @description Loading a new template must clear snapshots since they belong to the old document. */
  it('clears snapshots when a new template is loaded', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));
    store.getState().saveSnapshot('Snap 1');

    expect(store.getState().snapshots).toHaveLength(1);

    store.getState().loadTemplate(makeDocument([]));
    expect(store.getState().snapshots).toHaveLength(0);
  });

  /** @description Snapshots must survive JSON serialization and deserialization without loss. */
  it('round-trips snapshots through JSON serialization', () => {
    const store = createEditorStore();
    const el = makeElement({ id: 'el-rt' });

    store.getState().loadTemplate(makeDocument([el]));

    const id = store.getState().saveSnapshot('Round-trip Test');

    const serialized = JSON.stringify(store.getState().snapshots);
    const deserialized: readonly NamedSnapshot[] = JSON.parse(serialized) as readonly NamedSnapshot[];

    expect(deserialized).toHaveLength(1);
    expect(deserialized[0]?.id).toBe(id);
    expect(deserialized[0]?.name).toBe('Round-trip Test');
    expect(deserialized[0]?.timestamp).toBeDefined();
    expect(deserialized[0]?.document.elements).toHaveLength(1);
    expect(deserialized[0]?.document.elements[0]?.id).toBe('el-rt');
  });

  /** @description Renaming a snapshot to an empty or whitespace-only name must fail. */
  it('rejects renaming to empty name', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    const id = store.getState().saveSnapshot('Original');

    expect(() => {
      store.getState().renameSnapshot(id, '  ');
    }).toThrow();

    expect(store.getState().snapshots[0]?.name).toBe('Original');
  });
});
