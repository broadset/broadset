import { beforeEach, describe, expect, it } from '@jest/globals';

import type { EditorDocument, EditorStore } from './store-actions';
import { createEditorStore, createEmptyEditorDocument } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMultiPageDoc(pageCount: number): EditorDocument {
  const base = createEmptyEditorDocument();

  return {
    ...base,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      id: `page-${String(i + 1)}`,
      elements: [],
    })),
  };
}

// ===========================================================================
// Page Navigation
// ===========================================================================

describe('Page Navigation', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
    store.getState().loadTemplate(makeMultiPageDoc(3));
  });

  /**
   * @description Switching to a valid page must update the active index
   * and clear element selection so the user doesn't accidentally edit
   * elements from the previous page.
   */
  it('updates activePageIndex and clears selection on valid switch', () => {
    store.getState().addElement('shape');
    expect(store.getState().activeElementIds.length).toBeGreaterThan(0);

    store.getState().switchPage(2);

    expect(store.getState().activePageIndex).toBe(2);
    expect(store.getState().activeElementIds).toEqual([]);
  });

  /**
   * @description Out-of-range page indices must be silently ignored so the
   * store stays in a consistent state even with bad input.
   */
  it('ignores invalid page index', () => {
    store.getState().switchPage(5);

    expect(store.getState().activePageIndex).toBe(0);
  });
});

// ===========================================================================
// Page Add / Remove
// ===========================================================================

describe('Page Add and Remove', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Adding a page must append an empty page to the document so
   * the user can start placing elements on a blank canvas.
   */
  it('adds an empty page', () => {
    expect(store.getState().document.pages).toHaveLength(1);

    store.getState().addPage();

    const pages = store.getState().document.pages;

    expect(pages).toHaveLength(2);
    expect(pages[1]?.elements).toEqual([]);
  });

  /**
   * @description Removing the active page must adjust activePageIndex so it
   * stays within bounds, preventing index-out-of-range errors.
   */
  it('adjusts activePageIndex when active page is removed', () => {
    store.getState().loadTemplate(makeMultiPageDoc(3));
    store.getState().switchPage(2);

    store.getState().removePage(2);

    expect(store.getState().document.pages).toHaveLength(2);
    expect(store.getState().activePageIndex).toBe(1);
  });

  /**
   * @description Removing a page before the active one must decrement the
   * active index so the user keeps viewing the same page content.
   */
  it('shifts activePageIndex when a page before it is removed', () => {
    store.getState().loadTemplate(makeMultiPageDoc(3));
    store.getState().switchPage(2);

    store.getState().removePage(0);

    expect(store.getState().document.pages).toHaveLength(2);
    expect(store.getState().activePageIndex).toBe(1);
  });

  /**
   * @description A document must always have at least one page, so removing
   * the last remaining page is a no-op.
   */
  it('blocks removal of last page', () => {
    store.getState().removePage(0);

    expect(store.getState().document.pages).toHaveLength(1);
  });
});

// ===========================================================================
// Canvas Settings Update
// ===========================================================================

describe('Canvas Settings Update', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Partial updates must merge cleanly so callers can update a
   * single property without having to re-supply the full settings object.
   */
  it('merges partial updates without affecting other fields', () => {
    store.getState().updateCanvasSettings({ zoom: 2 });

    expect(store.getState().canvasSettings.zoom).toBe(2);
    expect(store.getState().canvasSettings.panX).toBe(0);
    expect(store.getState().canvasSettings.showRulers).toBe(true);
  });

  /**
   * @description Canvas settings are transient workspace state (zoom, pan)
   * and must NOT pollute the undo history. This test adds an element (which
   * IS tracked), changes zoom (which is NOT tracked), then undoes — the
   * element add is reverted but zoom stays at the new value.
   */
  it('is not tracked by undo', () => {
    store.getState().addElement('shape');
    store.getState().updateCanvasSettings({ zoom: 2 });

    store.getState().undo();

    expect(store.getState().canvasSettings.zoom).toBe(2);
    expect(store.getState().document.pages[0]?.elements).toHaveLength(0);
  });
});

// ===========================================================================
// Guide Management
// ===========================================================================

describe('Guide Management', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Adding a guide must insert it into the guides array with a
   * unique ID so it can be addressed later for updates or removal.
   */
  it('adds a guide to canvasSettings.guides', () => {
    store.getState().addGuide({ type: 'h', pos: 100, locked: false });

    const guides = store.getState().canvasSettings.guides;

    expect(guides).toHaveLength(1);
    expect(guides[0]?.type).toBe('h');
    expect(guides[0]?.pos).toBe(100);
    expect(guides[0]?.id).toBeDefined();
  });

  /**
   * @description Removing a guide by ID must filter it out of the array,
   * leaving other guides untouched.
   */
  it('removes a guide by ID', () => {
    store.getState().addGuide({ type: 'h', pos: 100, locked: false });
    store.getState().addGuide({ type: 'v', pos: 50, locked: false });

    const guideId = store.getState().canvasSettings.guides[0]?.id;

    expect(guideId).toBeDefined();

    if (guideId === undefined) return;

    store.getState().removeGuide(guideId);

    expect(store.getState().canvasSettings.guides).toHaveLength(1);
    expect(store.getState().canvasSettings.guides[0]?.type).toBe('v');
  });

  /**
   * @description Updating a guide by ID must merge the provided partial
   * properties so the caller can reposition without re-specifying type.
   */
  it('updates guide properties', () => {
    store.getState().addGuide({ type: 'h', pos: 100, locked: false });

    const guideId = store.getState().canvasSettings.guides[0]?.id;

    expect(guideId).toBeDefined();

    if (guideId === undefined) return;

    store.getState().updateGuide(guideId, { pos: 200 });

    expect(store.getState().canvasSettings.guides[0]?.pos).toBe(200);
    expect(store.getState().canvasSettings.guides[0]?.type).toBe('h');
  });
});

// ===========================================================================
// Origin Reset
// ===========================================================================

describe('Origin Reset', () => {
  /**
   * @description Resetting the origin must return both values to zero so
   * rulers and guides recalibrate to the canvas top-left.
   */
  it('resets originX and originY to 0', () => {
    const store = createEditorStore();

    store.getState().updateCanvasSettings({ originX: 50, originY: 30 });
    store.getState().resetOrigin();

    expect(store.getState().canvasSettings.originX).toBe(0);
    expect(store.getState().canvasSettings.originY).toBe(0);
  });
});

// ===========================================================================
// Color Palette
// ===========================================================================

describe('Color Palette', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Adding a new color must both update the in-memory palette
   * and persist to localStorage so it survives page reloads.
   */
  it('adds a new color and persists across store instances', () => {
    store.getState().addPaletteColor('#ff0000');

    expect(store.getState().savedPalette).toContain('#ff0000');

    const freshStore = createEditorStore();

    expect(freshStore.getState().savedPalette).toContain('#ff0000');
  });

  /**
   * @description Duplicate colors must be silently rejected to keep the
   * palette compact and avoid confusing the user with repeated entries.
   */
  it('rejects duplicate color', () => {
    store.getState().addPaletteColor('#ff0000');
    store.getState().addPaletteColor('#ff0000');

    expect(store.getState().savedPalette).toHaveLength(1);
  });

  /**
   * @description Removing by index must update the palette and persist the
   * change so it survives page reloads.
   */
  it('removes by index and persists', () => {
    store.getState().addPaletteColor('#ff0000');
    store.getState().addPaletteColor('#00ff00');

    store.getState().removePaletteColor(0);

    expect(store.getState().savedPalette).toEqual(['#00ff00']);

    const freshStore = createEditorStore();

    expect(freshStore.getState().savedPalette).toEqual(['#00ff00']);
  });
});

// ===========================================================================
// Default Canvas Settings
// ===========================================================================

describe('Default Canvas Settings', () => {
  /**
   * @description A freshly created editor must initialize canvas settings to
   * deterministic defaults so the first-time UX is predictable.
   */
  it('matches documented defaults', () => {
    localStorage.clear();

    const store = createEditorStore();
    const cs = store.getState().canvasSettings;

    expect(cs.zoom).toBe(1);
    expect(cs.panX).toBe(0);
    expect(cs.panY).toBe(0);
    expect(cs.showRulers).toBe(true);
    expect(cs.perspective).toBe(1000);
    expect(cs.guides).toEqual([]);
    expect(cs.originX).toBe(0);
    expect(cs.originY).toBe(0);

    const gs = store.getState().gridSettings;

    expect(gs.showGrid).toBe(false);
    expect(gs.snapToGrid).toBe(false);
    expect(gs.gridSize).toBe(5);
  });

  /**
   * @description When gridDefaults are supplied in EditorConfig, they must be
   * merged on top of the system defaults so hosts can customize grid behavior
   * while still inheriting safe fallbacks for unspecified fields.
   */
  it('merges gridDefaults from EditorConfig', () => {
    localStorage.clear();

    const store = createEditorStore({
      config: { gridDefaults: { gridSize: 10, snapToGrid: true } },
    });
    const gs = store.getState().gridSettings;

    expect(gs.gridSize).toBe(10);
    expect(gs.snapToGrid).toBe(true);
    expect(gs.showGrid).toBe(false);
  });
});

// ===========================================================================
// Palette Persistence
// ===========================================================================

describe('Palette Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * @description The palette must be loaded from localStorage on init so
   * colors saved in a previous session are immediately available.
   */
  it('loads palette from localStorage on initialization', () => {
    const store1 = createEditorStore();

    store1.getState().addPaletteColor('#aabb00');

    const store2 = createEditorStore();

    expect(store2.getState().savedPalette).toContain('#aabb00');
  });

  /**
   * @description Every palette mutation must trigger persistence so the user
   * never loses their custom colors on page reload.
   */
  it('persists palette after every modification', () => {
    const store1 = createEditorStore();

    store1.getState().addPaletteColor('#112233');
    store1.getState().addPaletteColor('#445566');
    store1.getState().removePaletteColor(0);

    const store2 = createEditorStore();

    expect(store2.getState().savedPalette).toEqual(['#445566']);
  });
});

// ===========================================================================
// Font Configuration
// ===========================================================================

describe('Font Configuration', () => {
  /**
   * @description Setting available fonts must replace the entire list so the
   * host application controls exactly which fonts the user can choose from.
   */
  it('replaces the available font list', () => {
    localStorage.clear();

    const store = createEditorStore();

    store.getState().setAvailableFonts(['Arial', 'Roboto']);

    expect(store.getState().availableFonts).toEqual(['Arial', 'Roboto']);
  });
});

// ===========================================================================
// Media Source Configuration
// ===========================================================================

describe('Media Source Configuration', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Setting a media source must store the configuration so
   * components can browse and insert media assets.
   */
  it('updates mediaSource', () => {
    const source = { type: 'cdn', url: 'https://cdn.example.com' };

    store.getState().setMediaSource(source);

    expect(store.getState().mediaSource).toEqual(source);
  });

  /**
   * @description Setting null must clear the media source so the editor
   * reverts to having no media library configured.
   */
  it('clears mediaSource with null', () => {
    store.getState().setMediaSource({ type: 'cdn' });
    store.getState().setMediaSource(null);

    expect(store.getState().mediaSource).toBeNull();
  });
});

// ===========================================================================
// Guide Editing Modal
// ===========================================================================

describe('Guide Editing Modal', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    store = createEditorStore();
  });

  /**
   * @description Tracking the guide ID enables the UI to show a precision
   * editing modal for the selected guide.
   */
  it('tracks guide ID for editing', () => {
    store.getState().setEditingGuideId('g1');

    expect(store.getState().editingGuideId).toBe('g1');
  });

  /**
   * @description Setting null must close the editing modal so the user
   * returns to the normal canvas view.
   */
  it('clears editing state with null', () => {
    store.getState().setEditingGuideId('g1');
    store.getState().setEditingGuideId(null);

    expect(store.getState().editingGuideId).toBeNull();
  });
});
