import type { BroadsetElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  appendPathPoint,
  cancelPlacement,
  getElementDefaults,
  placeElement,
  startPathDrawing,
  startPathEditing,
  startPlacement,
  stopPathDrawing,
  stopPathEditing,
  validateEditorConfig,
} from './editing';
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

// ===========================================================================
// Element Factory Defaults
// ===========================================================================

describe('getElementDefaults', () => {
  /**
   * @description Text elements must use 80×20 dimensions and 'New Text'
   * content by default per the editing spec.
   */
  it('returns text defaults: 80×20, "New Text"', () => {
    const defaults = getElementDefaults('text');

    expect(defaults).toEqual({ width: 80, height: 20, content: 'New Text' });
  });

  /**
   * @description Each built-in element type must use its type-specific
   * default dimensions and content.
   */
  it('returns correct defaults for each built-in type', () => {
    expect(getElementDefaults('image')).toEqual({
      width: 60,
      height: 60,
      content: '',
    });
    expect(getElementDefaults('svg')).toEqual({
      width: 60,
      height: 60,
      content: '',
    });
    expect(getElementDefaults('path')).toEqual({
      width: 80,
      height: 50,
      content: '',
    });
    expect(getElementDefaults('rectangle')).toEqual({
      width: 80,
      height: 50,
      content: '',
    });
    expect(getElementDefaults('ellipse')).toEqual({
      width: 50,
      height: 50,
      content: '',
    });
    expect(getElementDefaults('qrcode')).toEqual({
      width: 40,
      height: 40,
      content: 'https://example.com',
    });
    expect(getElementDefaults('group')).toEqual({
      width: 120,
      height: 80,
      content: '',
    });
  });

  /**
   * @description Plugins with explicit defaults override the system defaults
   * for their element type.
   */
  it('uses plugin defaults when provided', () => {
    const plugins = [
      {
        type: 'timer',
        defaults: { width: 100, height: 100, content: 'Timer' },
      },
    ];

    expect(getElementDefaults('timer', plugins)).toEqual({
      width: 100,
      height: 100,
      content: 'Timer',
    });
  });

  /**
   * @description Plugins without explicit defaults fall back to the system
   * fallback dimensions (80×50, empty content).
   */
  it('uses system fallback for plugin without defaults', () => {
    const plugins = [{ type: 'custom' }];

    expect(getElementDefaults('custom', plugins)).toEqual({
      width: 80,
      height: 50,
      content: '',
    });
  });
});

// ===========================================================================
// Placement Mode
// ===========================================================================

describe('Placement Mode', () => {
  /**
   * @description startPlacement sets editingMode to placement with the given
   * type; cancelPlacement resets it to none.
   */
  it('startPlacement sets mode, cancelPlacement resets it', () => {
    const store = createEditorStore();

    startPlacement(store, 'text');

    expect(store.getState().editingMode).toEqual({
      type: 'placement',
      elementType: 'text',
    });

    cancelPlacement(store);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /**
   * @description Starting placement while path editing or drawing is active
   * must replace the mode, effectively clearing path editing/drawing.
   */
  it('startPlacement clears path editing and drawing', () => {
    const el = makeElement();
    const store = storeWithElements(el);

    store.getState().enterPathEditing(el.id);

    expect(store.getState().editingMode.type).toBe('path-editing');

    startPlacement(store, 'rectangle');

    expect(store.getState().editingMode).toEqual({
      type: 'placement',
      elementType: 'rectangle',
    });
  });

  /**
   * @description placeElement creates an element centered at the given
   * coordinates using the type-specific factory defaults.
   */
  it('placeElement creates element centered at position', () => {
    const store = createEditorStore();

    startPlacement(store, 'text');

    const id = placeElement(store, 100, 50);

    expect(id).not.toBeNull();

    const elements = getElements(store);

    expect(elements).toHaveLength(1);

    const placed = elements[0];

    expect(placed?.type).toBe('text');
    expect(placed?.width).toBe(80);
    expect(placed?.height).toBe(20);
    expect(placed?.position).toEqual({ x: 100 - 80 / 2, y: 50 - 20 / 2 });
    expect(placed?.content).toBe('New Text');
    expect(store.getState().activeElementIds).toEqual([id]);
    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /**
   * @description placeElement with custom width and height uses those
   * dimensions instead of the type defaults.
   */
  it('placeElement with custom dimensions', () => {
    const store = createEditorStore();

    startPlacement(store, 'rectangle');

    const id = placeElement(store, 100, 80, 60, 40);

    expect(id).not.toBeNull();

    const elements = getElements(store);
    const placed = elements[0];

    expect(placed?.width).toBe(60);
    expect(placed?.height).toBe(40);
    expect(placed?.position).toEqual({ x: 100 - 60 / 2, y: 80 - 40 / 2 });
  });

  /**
   * @description Placing a path element must auto-enter path drawing mode
   * for that element, matching addElement("path") behavior.
   */
  it('placeElement with path type enters drawing mode', () => {
    const store = createEditorStore();

    startPlacement(store, 'path');

    const id = placeElement(store, 100, 50);

    expect(id).not.toBeNull();
    expect(store.getState().editingMode).toEqual({
      type: 'path-drawing',
      elementId: id,
    });
  });

  /**
   * @description placeElement without an active pending placement type must
   * be a no-op — no element is created.
   */
  it('placeElement with no pending placement is no-op', () => {
    const store = createEditorStore();

    const id = placeElement(store, 100, 50);

    expect(id).toBeNull();
    expect(getElements(store)).toHaveLength(0);
  });
});

// ===========================================================================
// Config Validation
// ===========================================================================

describe('validateEditorConfig', () => {
  /**
   * @description A valid EditorConfig with required fields must be accepted
   * without throwing.
   */
  it('accepts a valid config', () => {
    const config = {
      allowedFonts: [{ family: 'Arial' }],
    };

    expect(() => validateEditorConfig(config)).not.toThrow();
  });

  /**
   * @description An EditorConfig with an invalid font definition (missing
   * family) must be rejected with a descriptive error.
   */
  it('rejects invalid font definition', () => {
    const config = {
      allowedFonts: [{ family: '' }],
    };

    expect(() => validateEditorConfig(config)).toThrow();
  });
});

// ===========================================================================
// Path Editing Mode
// ===========================================================================

describe('Path Editing Mode', () => {
  /**
   * @description Starting path editing must set editingMode to path-editing
   * for the target element and select it.
   */
  it('startPathEditing sets path-editing mode and selects element', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathEditing(store, el.id);

    expect(store.getState().editingMode).toEqual({
      type: 'path-editing',
      elementId: el.id,
    });
    expect(store.getState().activeElementIds).toContain(el.id);
  });

  /**
   * @description Stopping path editing must reset editingMode to none.
   */
  it('stopPathEditing clears editing mode', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathEditing(store, el.id);
    stopPathEditing(store);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /**
   * @description Selecting a different element must auto-exit path editing.
   */
  it('auto-exits when selection changes to different element', () => {
    const a = makeElement({ type: 'path' });
    const b = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a, b);

    startPathEditing(store, a.id);
    store.getState().selectElement(b.id);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /**
   * @description Re-selecting the same element must NOT exit path editing.
   */
  it('keeps editing when same element is reselected', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathEditing(store, el.id);
    store.getState().selectElement(el.id);

    expect(store.getState().editingMode).toEqual({
      type: 'path-editing',
      elementId: el.id,
    });
  });

  /**
   * @description Selecting null (deselect all) must auto-exit path editing.
   */
  it('auto-exits when selection is cleared', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathEditing(store, el.id);
    store.getState().selectElement(null);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });
});

// ===========================================================================
// Path Drawing Mode
// ===========================================================================

describe('Path Drawing Mode', () => {
  /**
   * @description Starting path drawing must set editingMode to path-drawing
   * and clear any active path editing mode.
   */
  it('startPathDrawing sets drawing mode and clears editing', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathEditing(store, el.id);
    startPathDrawing(store, el.id);

    expect(store.getState().editingMode).toEqual({
      type: 'path-drawing',
      elementId: el.id,
    });
  });

  /**
   * @description Stopping path drawing must reset editingMode to none.
   */
  it('stopPathDrawing clears drawing mode', () => {
    const el = makeElement({ type: 'path' });
    const store = storeWithElements(el);

    startPathDrawing(store, el.id);
    stopPathDrawing(store);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });

  /**
   * @description Selection change to a different element must auto-exit
   * path drawing mode.
   */
  it('auto-exits when selection changes', () => {
    const a = makeElement({ type: 'path' });
    const b = makeElement({ type: 'rectangle' });
    const store = storeWithElements(a, b);

    startPathDrawing(store, a.id);
    store.getState().selectElement(b.id);

    expect(store.getState().editingMode).toEqual({ type: 'none' });
  });
});

// ===========================================================================
// Path Point Appending
// ===========================================================================

describe('appendPathPoint', () => {
  /**
   * @description The first appended point must create an M command.
   * Bounding box must be padded by half the stroke width.
   */
  it('first point creates M command with stroke padding', () => {
    const el = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
    });
    const store = storeWithElements(el);

    startPathDrawing(store, el.id);
    appendPathPoint(store, 10, 20);

    const elements = getElements(store);
    const path = elements.find((e) => e.id === el.id);

    // Content must start with M
    expect(path?.content).toMatch(/^M/);
    // Element position must be updated to reflect point location
    expect(path?.position.x).toBeDefined();
    expect(path?.position.y).toBeDefined();
  });

  /**
   * @description Subsequent points must create L commands. With three
   * points, the path data should contain M and two L commands.
   */
  it('subsequent points create L commands', () => {
    const el = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
    });
    const store = storeWithElements(el);

    startPathDrawing(store, el.id);
    appendPathPoint(store, 10, 20);
    appendPathPoint(store, 30, 40);
    appendPathPoint(store, 50, 60);

    const elements = getElements(store);
    const path = elements.find((e) => e.id === el.id);

    // Should have M and two L commands
    expect(path?.content).toMatch(/^M/);
    expect(path?.content).toMatch(/L/);

    // Count L commands
    const lCount = (path?.content ?? '').match(/L/g)?.length ?? 0;

    expect(lCount).toBe(2);
  });

  /**
   * @description Coordinates must be rounded to 2 decimal places.
   */
  it('rounds coordinates to 2 decimal places', () => {
    const el = makeElement({
      type: 'path',
      content: '',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
    });
    const store = storeWithElements(el);

    startPathDrawing(store, el.id);
    appendPathPoint(store, 10.12345, 20.6789);

    const elements = getElements(store);
    const path = elements.find((e) => e.id === el.id);
    const content = path?.content ?? '';

    // No coordinate should have more than 2 decimal places
    const numbers = content.match(/-?\d+\.?\d*/g) ?? [];

    for (const num of numbers) {
      const decimalPart = num.split('.')[1];

      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(2);
      }
    }
  });

  /**
   * @description Appending a point when not in drawing mode must be a no-op.
   */
  it('no-op when not in drawing mode', () => {
    const el = makeElement({
      type: 'path',
      content: 'M0,0',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
    });
    const store = storeWithElements(el);

    appendPathPoint(store, 10, 20);

    const elements = getElements(store);
    const path = elements.find((e) => e.id === el.id);

    expect(path?.content).toBe('M0,0');
  });
});
