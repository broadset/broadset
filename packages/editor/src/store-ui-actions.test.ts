/** @jest-environment jsdom */

import type { BroadsetDocument, Page } from '@broadset/model';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { createEditorStore, createEmptyEditorDocument } from './store-actions';

function createPage(index: number): Page {
  return {
    id: `page-${String(index + 1)}`,
    name: `Scene ${String(index + 1)}`,
    elements: [],
    locale: null,
    extensions: {},
  };
}

function makeMultiPageDocument(pageCount: number): BroadsetDocument {
  const base = createEmptyEditorDocument();

  return {
    ...base,
    pages: Array.from({ length: pageCount }, (_, index) => createPage(index)),
  };
}

describe('Page Navigation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** @description Switching to a valid page must update the active index and clear selection so users cannot accidentally edit the previous scene’s selection. */
  it('updates the active page index and clears selection on a valid switch', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeMultiPageDocument(3));

    const elementId = store.getState().addElement('rectangle');

    expect(store.getState().activeElementIds).toEqual([elementId]);

    store.getState().switchPage(2);

    expect(store.getState().activePageIndex).toBe(2);
    expect(store.getState().activeElementIds).toEqual([]);
  });

  /** @description Out-of-range page indices must be ignored to keep the store state stable even if a bad caller requests an invalid page. */
  it('ignores an invalid page index', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeMultiPageDocument(3));

    store.getState().switchPage(5);

    expect(store.getState().activePageIndex).toBe(0);
  });
});

describe('Page Add and Remove', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** @description Adding a page must append a new empty scene so the editor always has a blank surface ready for the next layout. */
  it('adds an empty page', () => {
    const store = createEditorStore();

    expect(store.getState().document.pages).toHaveLength(1);

    store.getState().addPage();

    expect(store.getState().document.pages).toHaveLength(2);
    expect(store.getState().document.pages[1]?.elements).toEqual([]);
  });

  /** @description Removing the active page must clamp the active index back into range so the editor never points at a missing scene. */
  it('adjusts the active page index when the active page is removed', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeMultiPageDocument(3));
    store.getState().switchPage(2);

    store.getState().removePage(2);

    expect(store.getState().document.pages).toHaveLength(2);
    expect(store.getState().activePageIndex).toBe(1);
  });

  /** @description The editor must preserve at least one page at all times, so removing the last remaining page must be a no-op. */
  it('blocks removal of the last remaining page', () => {
    const store = createEditorStore();

    store.getState().removePage(0);

    expect(store.getState().document.pages).toHaveLength(1);
  });
});

describe('Canvas Settings and Guides', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** @description Canvas settings must merge partial updates so hosts can change zoom or pan without having to resend the full settings object. */
  it('merges partial canvas setting updates', () => {
    const store = createEditorStore();

    store.getState().updateCanvasSettings({ zoom: 2 });

    expect(store.getState().canvasSettings.zoom).toBe(2);
    expect(store.getState().canvasSettings.panX).toBe(0);
    expect(store.getState().canvasSettings.showRulers).toBe(true);
  });

  /** @description Canvas settings are workspace UI state and must stay out of undo history, unlike committed document edits. */
  it('keeps canvas setting changes out of undo history', () => {
    const store = createEditorStore();

    store.getState().addElement('rectangle');
    store.getState().updateCanvasSettings({ zoom: 2 });
    store.getState().undo();

    expect(store.getState().canvasSettings.zoom).toBe(2);
    expect(store.getState().document.elements).toHaveLength(0);
  });

  /** @description Guide creation, update, and removal must operate by id so ruler-created guides can be edited and deleted later. */
  it('adds, updates, and removes guides by id', () => {
    const store = createEditorStore();

    store.getState().addGuide({ type: 'h', pos: 100, locked: false });
    store.getState().addGuide({ type: 'v', pos: 50, locked: false });

    const firstGuideId = store.getState().canvasSettings.guides[0]?.id;

    expect(firstGuideId).toBeDefined();

    if (firstGuideId === undefined) {
      throw new Error('Expected the first guide to have an id');
    }

    store.getState().updateGuide(firstGuideId, { pos: 200 });
    expect(store.getState().canvasSettings.guides[0]?.pos).toBe(200);

    store.getState().removeGuide(firstGuideId);
    expect(store.getState().canvasSettings.guides).toHaveLength(1);
    expect(store.getState().canvasSettings.guides[0]?.type).toBe('v');
  });

  /** @description Resetting the origin must return rulers and guide math to the top-left origin used by default. */
  it('resets originX and originY to zero', () => {
    const store = createEditorStore();

    store.getState().updateCanvasSettings({ originX: 50, originY: 30 });
    store.getState().resetOrigin();

    expect(store.getState().canvasSettings.originX).toBe(0);
    expect(store.getState().canvasSettings.originY).toBe(0);
  });
});

describe('Palette, Fonts, and Media Source', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** @description The saved color palette must reject duplicates and persist across store instances so custom swatches survive reloads. */
  it('persists palette changes and rejects duplicates', () => {
    const store = createEditorStore();

    store.getState().addPaletteColor('#ff0000');
    store.getState().addPaletteColor('#ff0000');
    expect(store.getState().savedPalette).toEqual(['#ff0000']);

    store.getState().addPaletteColor('#00ff00');
    store.getState().removePaletteColor(0);

    const freshStore = createEditorStore();

    expect(freshStore.getState().savedPalette).toEqual(['#00ff00']);
  });

  /** @description Host applications must be able to replace the entire available font list and media source configuration in one step. */
  it('replaces fonts and updates the media source configuration', () => {
    const store = createEditorStore();
    const source = { assets: [], categories: [{ id: 'cat-1', name: 'Brand' }] };

    store.getState().setAvailableFonts(['Arial', 'Roboto']);
    store.getState().setMediaSource(source);

    expect(store.getState().availableFonts).toEqual(['Arial', 'Roboto']);
    expect(store.getState().mediaSource).toEqual(source);

    store.getState().setMediaSource(null);
    expect(store.getState().mediaSource).toBeNull();
  });

  /** @description Grid defaults from EditorConfig must merge into the canvas workspace settings so hosts can customize the initial editor environment. */
  it('merges grid defaults from the editor config', () => {
    const store = createEditorStore({
      config: { gridDefaults: { gridSize: 10, snapToGrid: true } },
    });

    expect(store.getState().gridSettings.gridSize).toBe(10);
    expect(store.getState().gridSettings.snapToGrid).toBe(true);
    expect(store.getState().gridSettings.showGrid).toBe(false);
  });
});
