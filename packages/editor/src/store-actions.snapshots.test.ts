import { describe, expect, it } from '@jest/globals';

import { createEditorStore, type NamedSnapshot } from './store-actions';
import { makeDocument, makeElement } from './store-actions-test-helpers';

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

    store.getState().addElement('rectangle');
    store.getState().addElement('ellipse');

    expect(store.getState().document.elements.length).toBe(3);

    const snapshotId = store.getState().snapshots[0]?.id;

    if (!snapshotId) {
      throw new Error('Snapshot not found');
    }

    store.getState().restoreSnapshot(snapshotId);

    expect(store.getState().document.elements).toHaveLength(1);
    expect(store.getState().document.elements[0]?.id).toBe('el-1');

    store.getState().undo();
    expect(store.getState().document.elements).toHaveLength(3);

    store.getState().redo();
    expect(store.getState().document.elements).toHaveLength(1);
    expect(store.getState().document.elements[0]?.id).toBe('el-1');
  });

  /** @description Deleting a snapshot must remove it from the list. */
  it('deletes a snapshot', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocument([]));

    const id1 = store.getState().saveSnapshot('Snap 1');
    const id2 = store.getState().saveSnapshot('Snap 2');
    const id3 = store.getState().saveSnapshot('Snap 3');

    expect(store.getState().snapshots).toHaveLength(3);

    store.getState().deleteSnapshot(id1);

    expect(store.getState().snapshots).toHaveLength(2);
    expect(store.getState().snapshots.map((s) => s.id)).toEqual([id2, id3]);
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

    store.getState().selectElement('el-2');
    expect(store.getState().activeElementIds).toEqual(['el-2']);

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
