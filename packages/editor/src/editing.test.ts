import type { BroadsetElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { cancelPlacement, getElementDefaults, placeElement, startPlacement, validateEditorConfig } from './editing';
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
