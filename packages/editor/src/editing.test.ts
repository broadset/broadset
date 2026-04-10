import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementOverrides,
} from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  appendPathPoint,
  cancelPlacement,
  closeAndStopPathDrawing,
  commitAndStopPathDrawing,
  deleteClipPathPoint,
  getElementDefaults,
  insertClipPathPoint,
  placeElement,
  runPreflightDiagnostics,
  startClipPathEditing,
  startMotionPathEditing,
  startPathDrawing,
  startPathEditing,
  startPlacement,
  stopClipPathEditing,
  stopMotionPathEditing,
  stopPathDrawing,
  stopPathEditing,
  updateClipPathPoint,
  validateEditorConfig,
} from './editing';
import { createEditorStore } from './store-actions';

type ElementFactoryOverrides = ElementOverrides & {
  readonly type?: string;
};

function makeElement(overrides: ElementFactoryOverrides = {}): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
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

describe('getElementDefaults', () => {
  /** @description The placement tool must use per-type defaults so every inserted built-in element starts with sensible dimensions and starter content. */
  it('returns the expected defaults for built-in and plugin types', () => {
    expect(getElementDefaults('text')).toEqual({ width: 80, height: 20, content: 'New Text' });
    expect(getElementDefaults('image')).toEqual({ width: 60, height: 60, content: '' });
    expect(getElementDefaults('path')).toEqual({ width: 80, height: 50, content: '' });
    expect(getElementDefaults('ticker')).toEqual({ width: 400, height: 40, content: '["Item 1"]' });

    expect(
      getElementDefaults('custom-card', [
        { type: 'custom-card', defaults: { width: 144, height: 96, content: 'Plugin' } },
      ]),
    ).toEqual({ width: 144, height: 96, content: 'Plugin' });
  });
});

describe('placement mode', () => {
  /** @description Starting and cancelling placement must simply track the pending element type without mutating the document until placement is committed. */
  it('starts and cancels placement mode', () => {
    const store = createEditorStore();

    startPlacement(store, 'text');
    expect(store.getState().pendingPlacementType).toBe('text');

    cancelPlacement(store);
    expect(store.getState().pendingPlacementType).toBeNull();
  });

  /** @description Entering placement must clear any active path editing or drawing mode so the canvas has one interaction mode at a time. */
  it('clears path editing and drawing when placement starts', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    startPathDrawing(store, path.id);
    startPlacement(store, 'rectangle');

    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().pendingPlacementType).toBe('rectangle');
  });

  /** @description Clicking to place with no explicit size must center the default element dimensions around the click point. */
  it('places an element centered on the click point when size is omitted', () => {
    const store = createEditorStore();

    startPlacement(store, 'text');

    const elementId = placeElement(store, 100, 50);
    const placed = getElements(store)[0];

    expect(elementId).toBeTruthy();
    expect(placed?.type).toBe('text');
    expect(placed?.position).toEqual({ x: 60, y: 40 });
    expect(placed?.width).toBe(80);
    expect(placed?.height).toBe(20);
    expect(store.getState().activeElementIds).toEqual([elementId as string]);
    expect(store.getState().pendingPlacementType).toBeNull();
  });

  /** @description Drag placement passes a concrete top-left and dimensions through the UI, and the store must preserve those values exactly. */
  it('places an element using the provided top-left and custom dimensions', () => {
    const store = createEditorStore();

    startPlacement(store, 'rectangle');

    const elementId = placeElement(store, 50, 30, 60, 40);
    const placed = getElements(store)[0];

    expect(elementId).toBeTruthy();
    expect(placed?.position).toEqual({ x: 50, y: 30 });
    expect(placed?.width).toBe(60);
    expect(placed?.height).toBe(40);
  });

  /** @description Path placement must immediately hand control to path drawing mode so the user can start adding points without an extra click. */
  it('auto-enters path drawing when placing a path element', () => {
    const store = createEditorStore();

    startPlacement(store, 'path');

    const elementId = placeElement(store, 100, 60, 80, 50);

    expect(store.getState().pathDrawingElementId).toBe(elementId);
  });

  /** @description Calling placeElement without any pending placement type must be a no-op so accidental clicks never create unexpected elements. */
  it('does nothing when there is no pending placement type', () => {
    const store = createEditorStore();

    const result = placeElement(store, 10, 20, 30, 40);

    expect(result).toBeNull();
    expect(getElements(store)).toHaveLength(0);
  });
});

describe('path editing and drawing state', () => {
  /** @description Starting and stopping path editing must set and clear the dedicated editing element id while keeping the element selected. */
  it('starts and stops path editing mode', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L20,20' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);
    expect(store.getState().activeElementIds).toContain(path.id);

    stopPathEditing(store);
    expect(store.getState().pathEditingElementId).toBeNull();
  });

  /** @description Starting path drawing must clear path editing first, and stopping drawing must leave the store back in its neutral interaction state. */
  it('starts drawing, clears editing, and stops drawing cleanly', () => {
    const path = makeElement({ type: 'path', content: '' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    startPathDrawing(store, path.id);

    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBe(path.id);

    stopPathDrawing(store);
    expect(store.getState().pathDrawingElementId).toBeNull();
  });
});

describe('appendPathPoint', () => {
  /** @description The first appended point must create an M command, update the local bounds, and pad the path box to remain visible during drawing. */
  it('creates the initial move command and updates path geometry', () => {
    const path = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
      style: { strokeWidth: 2 },
    });
    const store = storeWithElements(path);

    startPathDrawing(store, path.id);
    appendPathPoint(store, 10, 20);

    const updated = getElements(store).find((element) => element.id === path.id);

    expect(updated?.content).toMatch(/^M/);
    expect(updated?.position.x).toBeDefined();
    expect(updated?.position.y).toBeDefined();
  });

  /** @description Additional clicks must append line segments and keep coordinates rounded so generated SVG stays stable and human-readable. */
  it('appends line commands and rounds coordinates to two decimals', () => {
    const path = makeElement({ type: 'path', content: '' });
    const store = storeWithElements(path);

    startPathDrawing(store, path.id);
    appendPathPoint(store, 10.12345, 20.6789);
    appendPathPoint(store, 30.33333, 40.44444);
    appendPathPoint(store, 50.55555, 60.66666);

    const updated = getElements(store).find((element) => element.id === path.id);

    expect(updated?.content).toMatch(/^M/);
    expect(updated?.content).toMatch(/L/);

    const numbers = (updated?.content ?? '').match(/-?\d+\.?\d*/g) ?? [];

    for (const value of numbers) {
      const decimals = value.split('.')[1];

      if (decimals !== undefined) {
        expect(decimals.length).toBeLessThanOrEqual(2);
      }
    }
  });

  /** @description Appending without an active drawing element must be ignored so normal canvas clicks cannot corrupt unrelated paths. */
  it('is a no-op when path drawing mode is not active', () => {
    const path = makeElement({ type: 'path', content: 'M0,0' });
    const store = storeWithElements(path);

    appendPathPoint(store, 10, 20);

    const updated = getElements(store).find((element) => element.id === path.id);

    expect(updated?.content).toBe('M0,0');
  });
});

describe('path editing — selection auto-exit', () => {
  /** @description Changing the active selection to a different element MUST auto-exit path editing, because you can only edit one path at a time. */
  it('exits path editing when selection changes to a different element', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathEditing(store, path.id);
    expect(store.getState().pathEditingElementId).toBe(path.id);

    store.getState().selectElement(rect.id);
    expect(store.getState().pathEditingElementId).toBeNull();
  });

  /** @description Selecting null (deselecting all) MUST auto-exit path editing. */
  it('exits path editing when selection is cleared to null', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    store.getState().selectElement(null);

    expect(store.getState().pathEditingElementId).toBeNull();
  });

  /** @description Re-selecting the same element MUST NOT exit path editing so the user can click the element without losing edit context. */
  it('keeps path editing when the same element is reselected', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    store.getState().setActiveElements([path.id]);

    expect(store.getState().pathEditingElementId).toBe(path.id);
  });

  /** @description Multi-selecting elements that include the editing path MUST keep editing active. */
  it('keeps path editing when multi-select includes the editing element', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathEditing(store, path.id);
    store.getState().setActiveElements([path.id, rect.id]);

    expect(store.getState().pathEditingElementId).toBe(path.id);
  });

  /** @description Multi-selecting elements that exclude the editing path MUST exit editing mode. */
  it('exits path editing when multi-select excludes the editing element', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathEditing(store, path.id);
    store.getState().setActiveElements([rect.id]);

    expect(store.getState().pathEditingElementId).toBeNull();
  });
});

describe('path drawing — completion', () => {
  /** @description Pressing Enter during drawing MUST close the path with Z and exit drawing mode. */
  it('Enter closes path with Z and exits drawing mode', () => {
    const path = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
      style: { strokeWidth: 2 },
    });
    const store = storeWithElements(path);

    startPathDrawing(store, path.id);
    appendPathPoint(store, 10, 20);
    appendPathPoint(store, 30, 40);
    appendPathPoint(store, 50, 60);
    closeAndStopPathDrawing(store);

    const updated = store.getState().document.elements.find((el) => el.id === path.id);

    expect(updated?.content).toMatch(/Z$/);
    expect(store.getState().pathDrawingElementId).toBeNull();
  });

  /** @description Pressing Escape during drawing MUST commit the path as-is without Z and exit drawing mode. */
  it('Escape commits path as-is and exits drawing mode', () => {
    const path = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
      style: { strokeWidth: 2 },
    });
    const store = storeWithElements(path);

    startPathDrawing(store, path.id);
    appendPathPoint(store, 10, 20);
    appendPathPoint(store, 30, 40);
    commitAndStopPathDrawing(store);

    const updated = store.getState().document.elements.find((el) => el.id === path.id);

    expect(updated?.content).not.toMatch(/Z$/);
    expect(updated?.content).toMatch(/^M/);
    expect(updated?.content).toMatch(/L/);
    expect(store.getState().pathDrawingElementId).toBeNull();
  });

  /** @description Selection change during drawing MUST auto-exit drawing mode. */
  it('exits drawing when selection changes to different element', () => {
    const path = makeElement({ type: 'path', content: '' });
    const rect = makeElement({ type: 'rectangle' });
    const store = storeWithElements(path, rect);

    startPathDrawing(store, path.id);
    store.getState().selectElement(rect.id);

    expect(store.getState().pathDrawingElementId).toBeNull();
  });
});

describe('appendPathPoint — bounding box growth', () => {
  /** @description Three points appended at known positions MUST produce the expected M/L commands with coordinates relative to the grown bbox, padded by half stroke width. */
  it('produces correct content and bbox for three sequential points', () => {
    const path = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
      style: { strokeWidth: 2 },
    });
    const store = storeWithElements(path);

    startPathDrawing(store, path.id);
    appendPathPoint(store, 10, 20);
    appendPathPoint(store, 30, 40);
    appendPathPoint(store, 50, 60);

    const updated = store.getState().document.elements.find((el) => el.id === path.id);

    // Points: (10,20), (30,40), (50,60)
    // Padding = strokeWidth/2 = 1
    // Min = (10-1, 20-1) = (9, 19), Max = (50+1, 60+1) = (51, 61)
    expect(updated?.position.x).toBe(9);
    expect(updated?.position.y).toBe(19);
    expect(updated?.width).toBe(42); // 51-9
    expect(updated?.height).toBe(42); // 61-19

    // Relative coords: first = (10-9, 20-19) = (1,1), second = (30-9, 40-19) = (21,21), third = (50-9, 60-19) = (41,41)
    expect(updated?.content).toBe('M1,1 L21,21 L41,41');
  });
});

describe('validateEditorConfig', () => {
  /** @description Editor config validation must accept well-formed configs and reject invalid font definitions before the editor mounts. */
  it('validates good configs and rejects invalid ones', () => {
    expect(() => validateEditorConfig({ allowedFonts: [{ family: 'Inter' }] })).not.toThrow();
    expect(() => validateEditorConfig({ allowedFonts: [{ family: '' }] })).toThrow();
  });
});

/* ================================================================== */
/*  Clip-path editing — state management                              */
/* ================================================================== */

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
    expect(store.getState().pendingPlacementType).toBeNull();
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
    expect(store.getState().pendingPlacementType).toBeNull();
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

describe('Preflight Diagnostics', () => {
  function makeScreenDoc(
    elements: readonly BroadsetElement[],
    canvasOverrides: Partial<{ width: number; height: number }> = {},
  ): BroadsetDocument {
    const base = createEmptyBroadsetDocument();

    return {
      ...base,
      documentMode: 'screen',
      canvas: { ...base.canvas, width: canvasOverrides.width ?? 1920, height: canvasOverrides.height ?? 1080 },
      elements,
    };
  }

  function makePrintDoc(
    elements: readonly BroadsetElement[],
    canvasOverrides: Partial<{ width: number; height: number }> = {},
  ): BroadsetDocument {
    const base = createEmptyBroadsetDocument();

    return {
      ...base,
      documentMode: 'print',
      canvas: {
        ...base.canvas,
        width: canvasOverrides.width ?? 210,
        height: canvasOverrides.height ?? 297,
        unit: 'mm',
      },
      elements,
    };
  }

  /** @description A clean document with no issues must produce zero diagnostics. */
  it('reports no issues for a clean document', () => {
    const el = makeElement({
      type: 'rectangle',
      position: { x: 100, y: 100 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});

    expect(issues).toHaveLength(0);
  });

  /** @description Text elements outside the 90% title-safe inset must emit a title-safe warning. */
  it('emits a title-safe warning when a text element extends outside the 90% inset', () => {
    const el = makeElement({
      type: 'text',
      name: 'Title',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el], { width: 1920, height: 1080 });
    const issues = runPreflightDiagnostics(doc, {});
    const titleSafe = issues.filter((i) => i.rule === 'title-safe');

    expect(titleSafe).toHaveLength(1);
    expect(titleSafe[0]?.severity).toBe('warning');
    expect(titleSafe[0]?.elementName).toBe('Title');
  });

  /** @description Large images must emit a dpi-resolution info when rendered size exceeds 500px. */
  it('emits a dpi-resolution info for a large image', () => {
    const el = makeElement({
      type: 'image',
      name: 'Hero Image',
      position: { x: 100, y: 100 },
      width: 600,
      height: 400,
    });
    const doc = makeScreenDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});
    const dpiIssues = issues.filter((i) => i.rule === 'dpi-resolution');

    expect(dpiIssues).toHaveLength(1);
    expect(dpiIssues[0]?.severity).toBe('info');
  });

  /** @description In print mode, elements beyond bleed margin must emit a bleed warning. */
  it('emits a bleed warning in print mode for elements beyond canvas + bleed', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Overflowing Box',
      position: { x: -10, y: -10 },
      width: 50,
      height: 50,
    });
    const doc = makePrintDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});
    const bleedIssues = issues.filter((i) => i.rule === 'bleed');

    expect(bleedIssues).toHaveLength(1);
    expect(bleedIssues[0]?.severity).toBe('warning');
  });

  /** @description In print mode, text below 6pt must emit a small-text warning. */
  it('emits a small-text warning in print mode for text below 6pt', () => {
    const el = makeElement({
      type: 'text',
      name: 'Tiny Label',
      position: { x: 50, y: 50 },
      width: 100,
      height: 20,
    });
    // Set font size below 6
    const elWithSmallFont: BroadsetElement = { ...el, style: { ...el.style, fontSize: 5 } };
    const doc = makePrintDoc([elWithSmallFont]);
    const issues = runPreflightDiagnostics(doc, {});
    const smallTextIssues = issues.filter((i) => i.rule === 'small-text');

    expect(smallTextIssues).toHaveLength(1);
    expect(smallTextIssues[0]?.severity).toBe('warning');
  });

  /** @description In print mode, fluorescent colors must emit a color-mode info. */
  it('emits a color-mode info in print mode for fluorescent colors', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Neon Box',
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
    });
    // Fluorescent / highly saturated green
    const elWithFluo: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#00ff00' },
    };
    const doc = makePrintDoc([elWithFluo]);
    const issues = runPreflightDiagnostics(doc, {});
    const colorIssues = issues.filter((i) => i.rule === 'color-mode');

    expect(colorIssues).toHaveLength(1);
    expect(colorIssues[0]?.severity).toBe('info');
  });

  /** @description Screen-only properties in print mode must emit unsupported-property warnings. */
  it('emits unsupported-property warnings for screen-only properties in print mode', () => {
    const el = makeElement({
      type: 'rectangle',
      name: '3D Box',
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
    });
    const elWith3D: BroadsetElement = {
      ...el,
      style: { ...el.style, rotateX: 15, rotateY: 30 },
    };
    const doc = makePrintDoc([elWith3D]);
    const issues = runPreflightDiagnostics(doc, {});
    const unsupported = issues.filter((i) => i.rule === 'unsupported-property');

    expect(unsupported).toHaveLength(2);
    expect(unsupported[0]?.severity).toBe('warning');
    expect(unsupported[1]?.severity).toBe('warning');
  });

  /** @description Multiple issues must be returned in deterministic order. */
  it('returns diagnostics in deterministic order', () => {
    const text = makeElement({
      type: 'text',
      name: 'A',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
    });
    const image = makeElement({
      type: 'image',
      name: 'B',
      position: { x: 100, y: 100 },
      width: 600,
      height: 400,
    });
    const doc = makeScreenDoc([text, image]);
    const issues1 = runPreflightDiagnostics(doc, {});
    const issues2 = runPreflightDiagnostics(doc, {});

    expect(issues1.map((i) => i.rule)).toEqual(issues2.map((i) => i.rule));
    expect(issues1.map((i) => i.elementName)).toEqual(issues2.map((i) => i.elementName));
  });

  /** @description A text element using a font not in allowedFonts must emit a missing-font warning. */
  it('emits a missing-font warning for text with unknown font', () => {
    const el = makeElement({
      type: 'text',
      name: 'Custom Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'ObscureFont' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues.length).toBeGreaterThanOrEqual(1);
    expect(fontIssues[0]?.severity).toBe('warning');
  });

  /** @description A text element using a font in allowedFonts must not emit missing-font. */
  it('does not emit missing-font for a font in allowedFonts', () => {
    const el = makeElement({
      type: 'text',
      name: 'Custom Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'Arial' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(0);
  });

  /** @description A text element using a system fallback font must not emit missing-font. */
  it('does not emit missing-font for a fallback system font', () => {
    const el = makeElement({
      type: 'text',
      name: 'System Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'sans-serif' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'CustomFont' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(0);
  });

  /** @description SVG elements outside the title-safe area must trigger a title-safe warning. */
  it('emits a title-safe warning for an SVG element outside the 90% inset', () => {
    const el = makeElement({
      type: 'svg',
      name: 'Chart',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el], { width: 1920, height: 1080 });
    const issues = runPreflightDiagnostics(doc, {});
    const titleSafe = issues.filter((i) => i.rule === 'title-safe');

    expect(titleSafe).toHaveLength(1);

    const titleSafeIssue = titleSafe[0];

    expect(titleSafeIssue).toBeDefined();
    expect(titleSafeIssue?.elementName).toBe('Chart');
  });

  /** @description Clock elements with small font size must trigger small-text in print mode. */
  it('emits a small-text warning for a clock element with font below 6pt', () => {
    const el = makeElement({
      type: 'clock',
      name: 'Small Clock',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontSize: 4 },
    };
    const doc = makePrintDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, {});
    const smallText = issues.filter((i) => i.rule === 'small-text');

    expect(smallText).toHaveLength(1);

    const smallTextIssue = smallText[0];

    expect(smallTextIssue).toBeDefined();
    expect(smallTextIssue?.elementName).toBe('Small Clock');
  });

  /** @description Ticker elements with unknown font must trigger missing-font warning. */
  it('emits a missing-font warning for a ticker with unknown font', () => {
    const el = makeElement({
      type: 'ticker',
      name: 'News Ticker',
      position: { x: 100, y: 100 },
      width: 400,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'UnknownFont' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(1);

    const fontIssue = fontIssues[0];

    expect(fontIssue).toBeDefined();
    expect(fontIssue?.elementName).toBe('News Ticker');
  });

  /** @description 3-char hex colors (#0f0) must be detected as fluorescent in print mode. */
  it('detects fluorescent colors in short hex format (#0f0)', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Green Box',
      position: { x: 100, y: 100 },
      width: 100,
      height: 100,
    });
    const elWithColor: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#0f0' },
    };
    const doc = makePrintDoc([elWithColor]);
    const issues = runPreflightDiagnostics(doc, {});
    const colorIssues = issues.filter((i) => i.rule === 'color-mode');

    expect(colorIssues).toHaveLength(1);

    const colorIssue = colorIssues[0];

    expect(colorIssue).toBeDefined();
    expect(colorIssue?.elementName).toBe('Green Box');
  });
});
