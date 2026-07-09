import { describe, expect, it } from 'vitest';

import {
  deleteClipPathPoint,
  insertClipPathPoint,
  startClipPathEditing,
  startMotionPathEditing,
  startPathEditing,
  stopClipPathEditing,
  stopMotionPathEditing,
  updateClipPathPoint,
} from './editing';
import { makeElement, storeWithElements } from './editing-test-helpers';

describe('clip-path editing — start and stop', () => {
  /** @description Starting clip-path editing on an element with clipPath capability MUST set clipPathEditingElementId and select the element. Stopping MUST clear the ID to null. */
  it('sets and clears clipPathEditingElementId', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    expect(store.getState().clipPathEditingElementId).toBe(rect.id);
    expect(store.getState().activeElementIds).toContain(rect.id);

    stopClipPathEditing(store);
    expect(store.getState().clipPathEditingElementId).toBeNull();
  });

  /** @description Starting clip-path editing MUST clear path editing, path drawing, and placement modes so only one editing mode is active at a time. */
  it('clears other editing modes on start', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathEditing(store, path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);

    startClipPathEditing(store, rect.id);
    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().placement).toBeNull();
    expect(store.getState().clipPathEditingElementId).toBe(rect.id);
  });

  /** @description Changing the active selection to a different element MUST auto-exit clip-path editing. */
  it('auto-exits on selection change to a different element', () => {
    const rect = makeElement({ type: 'rectangle' });
    const text = makeElement({ type: 'text' });
    const store = storeWithElements(rect, text);

    startClipPathEditing(store, rect.id);
    expect(store.getState().clipPathEditingElementId).toBe(rect.id);

    store.getState().selectElement(text.id);
    expect(store.getState().clipPathEditingElementId).toBeNull();
  });

  /** @description Clearing the selection to null MUST auto-exit clip-path editing. */
  it('auto-exits when selection is cleared to null', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    store.getState().selectElement(null);

    expect(store.getState().clipPathEditingElementId).toBeNull();
  });

  /** @description Calling startClipPathEditing on an element without clipPath capability (e.g. text, path, qrcode) MUST be a no-op. */
  it('is a no-op for elements without clipPath capability', () => {
    const text = makeElement({ type: 'text' });
    const store = storeWithElements(text);

    startClipPathEditing(store, text.id);
    expect(store.getState().clipPathEditingElementId).toBeNull();
  });

  /** @description When the element's customClipPath is empty, starting clip-path editing MUST seed a default rectangular polygon and set maskType to 'custom'. */
  it('seeds default rectangular polygon for empty customClipPath', () => {
    const rect = makeElement({ type: 'rectangle', style: { customClipPath: '', maskType: 'none' } });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');
    expect(updated?.style.maskType).toBe('custom');
  });

  /** @description When the element already has a customClipPath, starting clip-path editing MUST NOT overwrite it. */
  it('does not overwrite existing customClipPath', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'circle(50%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('circle(50%)');
  });
});

describe('clip-path editing — point mutations', () => {
  /** @description updateClipPathPoint must update the coordinates of the point at the given index in element-relative percentages. */
  it('updates a control point in the polygon', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    updateClipPathPoint(store, 1, 80, 0);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 80% 0%, 100% 100%, 0% 100%)');
  });

  /** @description updateClipPathPoint must be a no-op when not in clip-path editing mode. */
  it('is a no-op when not in clip-path editing mode', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    updateClipPathPoint(store, 1, 80, 0);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');
  });

  /** @description insertClipPathPoint must insert a new point after the given index. */
  it('inserts a point after the given index', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    insertClipPathPoint(store, 0, 50, 0);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 50% 0%, 100% 0%, 0% 100%)');
  });

  /** @description insertClipPathPoint must be a no-op when not in editing mode. */
  it('is a no-op when not in editing mode', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    insertClipPathPoint(store, 0, 50, 0);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 0% 100%)');
  });

  /** @description deleteClipPathPoint must remove a point when the polygon has more than 3 points. */
  it('deletes a point when polygon has more than 3 points', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 50% 0%, 100% 0%, 100% 100%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    deleteClipPathPoint(store, 2);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 50% 0%, 100% 100%, 0% 100%)');
  });

  /** @description deleteClipPathPoint must reject deletion when the polygon has exactly 3 points (minimum enforced). */
  it('rejects deletion at minimum 3 points', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    deleteClipPathPoint(store, 1);

    const updated = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(updated?.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 0% 100%)');
  });

  /** @description Clip-path mutations must be tracked by undo/redo so the user can revert changes. */
  it('tracks mutations with undo/redo', () => {
    const rect = makeElement({
      type: 'rectangle',
      style: { customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', maskType: 'custom' },
    });
    const store = storeWithElements(rect);

    startClipPathEditing(store, rect.id);
    updateClipPathPoint(store, 1, 80, 0);

    const afterUpdate = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(afterUpdate?.style.customClipPath).toBe('polygon(0% 0%, 80% 0%, 100% 100%, 0% 100%)');

    store.getState().undo();

    const afterUndo = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(afterUndo?.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');

    store.getState().redo();

    const afterRedo = store.getState().document.elements.find((el) => el.id === rect.id);

    expect(afterRedo?.style.customClipPath).toBe('polygon(0% 0%, 80% 0%, 100% 100%, 0% 100%)');
  });
});

/* ================================================================== */
/*  Motion path editing — state management                           */
/* ================================================================== */

describe('motion path editing — start and stop', () => {
  /** @description Starting motion path editing MUST set motionPathEditingElementId and select the element. Stopping MUST clear the ID to null. */
  it('sets and clears motionPathEditingElementId', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startMotionPathEditing(store, rect.id);
    expect(store.getState().motionPathEditingElementId).toBe(rect.id);
    expect(store.getState().activeElementIds).toContain(rect.id);

    stopMotionPathEditing(store);
    expect(store.getState().motionPathEditingElementId).toBeNull();
  });

  /** @description Starting motion path editing MUST clear path editing, path drawing, clip-path editing, and placement modes so only one overlay mode is active. */
  it('clears other editing modes on start', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathEditing(store, path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);

    startMotionPathEditing(store, rect.id);
    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().clipPathEditingElementId).toBeNull();
    expect(store.getState().placement).toBeNull();
    expect(store.getState().motionPathEditingElementId).toBe(rect.id);
  });

  /** @description Changing the active selection to a different element MUST auto-exit motion path editing. */
  it('auto-exits on selection change to a different element', () => {
    const rect = makeElement({ type: 'rectangle' });
    const text = makeElement({ type: 'text' });
    const store = storeWithElements(rect, text);

    startMotionPathEditing(store, rect.id);
    expect(store.getState().motionPathEditingElementId).toBe(rect.id);

    store.getState().selectElement(text.id);
    expect(store.getState().motionPathEditingElementId).toBeNull();
  });

  /** @description Clearing the selection to null MUST auto-exit motion path editing. */
  it('auto-exits when selection is cleared to null', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startMotionPathEditing(store, rect.id);
    store.getState().selectElement(null);

    expect(store.getState().motionPathEditingElementId).toBeNull();
  });

  /** @description Starting clip-path editing while motion path editing is active MUST clear motion path editing (mutual exclusivity). */
  it('is cleared when clip-path editing starts', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startMotionPathEditing(store, rect.id);
    expect(store.getState().motionPathEditingElementId).toBe(rect.id);

    startClipPathEditing(store, rect.id);
    expect(store.getState().motionPathEditingElementId).toBeNull();
    expect(store.getState().clipPathEditingElementId).toBe(rect.id);
  });

  /** @description The editingMode union MUST reflect motion-path-editing when the mode is active. */
  it('sets editingMode to motion-path-editing', () => {
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(rect);

    startMotionPathEditing(store, rect.id);
    expect(store.getState().editingMode).toEqual({ type: 'motion-path-editing', elementId: rect.id });

    stopMotionPathEditing(store);
    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });
});
