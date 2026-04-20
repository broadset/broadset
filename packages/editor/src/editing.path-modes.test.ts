import { describe, expect, it } from 'vitest';

import {
  appendPathPoint,
  closeAndStopPathDrawing,
  commitAndStopPathDrawing,
  startPathDrawing,
  startPathEditing,
  stopPathDrawing,
  stopPathEditing,
} from './editing';
import { getElements, makeElement, storeWithElements } from './editing-test-helpers';

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
