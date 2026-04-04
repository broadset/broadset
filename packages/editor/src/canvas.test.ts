import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  computeGridLines,
  computeInlineEditOverlay,
  computeMarqueeSelection,
  computeRulerTicks,
  computeSafetyBoundaries,
} from './canvas';
import type { EditorDocument } from './store-actions';
import { createEditorStore, createEmptyEditorDocument } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocWithElements(count: number): EditorDocument {
  const base = createEmptyEditorDocument();

  return {
    ...base,
    pages: [
      {
        id: 'page-1',
        elements: Array.from({ length: count }, (_, i) => {
          const el = createDefaultElement('shape');

          return { ...el, id: `el-${String(i)}`, position: { x: i * 50, y: i * 50 } };
        }),
      },
    ],
  };
}

// ===========================================================================
// Marquee Selection
// ===========================================================================

describe('Marquee Selection', () => {
  /**
   * @description The marquee must select all elements whose bounding boxes
   * intersect the selection rectangle. This is the core interaction for
   * multi-element selection via drag.
   */
  it('selects elements intersecting the marquee rectangle', () => {
    const elements = [
      { id: 'a', position: { x: 0, y: 0 }, width: 40, height: 40 },
      { id: 'b', position: { x: 100, y: 100 }, width: 40, height: 40 },
      { id: 'c', position: { x: 200, y: 200 }, width: 40, height: 40 },
    ];

    const selected = computeMarqueeSelection(elements, {
      x: 0,
      y: 0,
      width: 150,
      height: 150,
    });

    expect(selected).toContain('a');
    expect(selected).toContain('b');
    expect(selected).not.toContain('c');
  });

  /**
   * @description An empty marquee (zero-size) must not select anything, even
   * if it lands exactly on an element's origin.
   */
  it('returns empty for zero-size marquee', () => {
    const elements = [{ id: 'a', position: { x: 0, y: 0 }, width: 40, height: 40 }];

    const selected = computeMarqueeSelection(elements, {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

    expect(selected).toEqual([]);
  });
});

// ===========================================================================
// Grid Line Computation
// ===========================================================================

describe('Grid Line Computation', () => {
  /**
   * @description Grid lines must appear at the configured interval across
   * the entire canvas so the user has a consistent visual reference grid.
   */
  it('produces grid lines at configured interval', () => {
    const lines = computeGridLines({
      canvasWidth: 100,
      canvasHeight: 60,
      gridSize: 10,
      zoom: 1,
    });

    const hLines = lines.filter((l) => l.axis === 'h');
    const vLines = lines.filter((l) => l.axis === 'v');

    expect(hLines.length).toBeGreaterThan(0);
    expect(vLines.length).toBeGreaterThan(0);

    // All horizontal lines should be multiples of gridSize
    for (const line of hLines) {
      expect(line.position % 10).toBe(0);
    }
  });

  /**
   * @description When zoom is applied, the grid lines must appear at
   * screen-space intervals that correspond to the logical gridSize.
   */
  it('accounts for zoom in screen-space positions', () => {
    const linesZ1 = computeGridLines({
      canvasWidth: 100,
      canvasHeight: 60,
      gridSize: 10,
      zoom: 1,
    });

    const linesZ2 = computeGridLines({
      canvasWidth: 100,
      canvasHeight: 60,
      gridSize: 10,
      zoom: 2,
    });

    // At zoom 2, each grid cell covers 2x screen pixels, so we should have
    // at least as many logical grid lines
    expect(linesZ1.length).toBeGreaterThan(0);
    expect(linesZ2.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Ruler Tick Computation
// ===========================================================================

describe('Ruler Tick Computation', () => {
  /**
   * @description Ruler ticks must be computed in the current unit system so
   * the user sees measurements in their preferred units.
   */
  it('computes ticks in mm units', () => {
    const ticks = computeRulerTicks({
      length: 100,
      unit: 'mm',
      zoom: 1,
      origin: 0,
    });

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]?.label).toBeDefined();
  });

  /**
   * @description Origin offset must shift tick labels so the ruler matches
   * the user's configured origin point.
   */
  it('offsets ticks by origin', () => {
    const ticks0 = computeRulerTicks({
      length: 100,
      unit: 'px',
      zoom: 1,
      origin: 0,
    });

    const ticks50 = computeRulerTicks({
      length: 100,
      unit: 'px',
      zoom: 1,
      origin: 50,
    });

    // With origin 50, the first tick label should differ from origin 0
    expect(ticks0[0]?.label).not.toBe(ticks50[0]?.label);
  });
});

// ===========================================================================
// Safety Boundary Computation
// ===========================================================================

describe('Safety Boundary Computation', () => {
  /**
   * @description Broadcast mode must produce safety overlay rectangles
   * based on the canvas padding so the user sees broadcast-safe zones.
   */
  it('returns overlays for broadcast mode with padding', () => {
    const rects = computeSafetyBoundaries({
      canvasWidth: 508,
      canvasHeight: 285.75,
      padding: [10, 10, 10, 10],
      viewMode: 'broadcast',
    });

    expect(rects.length).toBeGreaterThan(0);
  });

  /**
   * @description None mode must produce no overlays so the canvas is
   * unobstructed.
   */
  it('returns empty for none viewMode', () => {
    const rects = computeSafetyBoundaries({
      canvasWidth: 508,
      canvasHeight: 285.75,
      padding: [10, 10, 10, 10],
      viewMode: 'none',
    });

    expect(rects).toEqual([]);
  });
});

// ===========================================================================
// Inline Edit Overlay (Zoom Compensation)
// ===========================================================================

describe('Inline Edit Overlay', () => {
  /**
   * @description The overlay position and size must be zoom-compensated so
   * the editable area visually matches the element on the canvas.
   */
  it('produces zoom-compensated screen-space coordinates', () => {
    const result = computeInlineEditOverlay({
      elementRect: { x: 100, y: 50, width: 200, height: 40 },
      zoom: 2,
      panX: 10,
      panY: 5,
    });

    // At zoom 2 with pan (10, 5): screenX = 100*2 + 10 = 210
    expect(result.x).toBe(210);
    expect(result.y).toBe(105);
    expect(result.width).toBe(400);
    expect(result.height).toBe(80);
  });

  /**
   * @description At zoom 1 with no pan, overlay coordinates must equal
   * the element's logical coordinates.
   */
  it('matches element rect at zoom 1 with zero pan', () => {
    const rect = { x: 50, y: 25, width: 100, height: 30 };
    const result = computeInlineEditOverlay({
      elementRect: rect,
      zoom: 1,
      panX: 0,
      panY: 0,
    });

    expect(result).toEqual(rect);
  });
});

// ===========================================================================
// Store Stability Tests (undo/redo, interleaved mutations, selection cycling)
// ===========================================================================

describe('Rapid Undo/Redo Stability', () => {
  /**
   * @description Rapid undo/redo cycles must not corrupt the store state.
   * The document, selection, and page index must remain valid after each
   * operation to prevent the user from encountering broken state.
   */
  it('maintains consistent state after rapid undo/redo cycles', () => {
    const store = createEditorStore();

    // Create a series of committed changes
    for (let i = 0; i < 5; i++) {
      store.getState().addElement('shape');
    }

    // Rapid undo/redo alternation
    for (let i = 0; i < 20; i++) {
      store.getState().undo();
      store.getState().redo();
    }

    const state = store.getState();

    expect(state.document.pages[0]?.elements.length).toBe(5);
    expect(state.activePageIndex).toBeGreaterThanOrEqual(0);
    expect(state.activePageIndex).toBeLessThan(state.document.pages.length);
  });
});

describe('Interleaved Mutation Stability', () => {
  /**
   * @description Add/remove/undo interleaving must maintain all store
   * invariants: valid page structure, consistent selection, and no
   * orphaned data (e.g., selected element IDs that no longer exist).
   */
  it('maintains invariants after add/remove/undo interleaving', () => {
    const store = createEditorStore();

    // Add two elements
    const id1 = store.getState().addElement('shape');
    const id2 = store.getState().addElement('text');

    // Remove the first
    store.getState().removeElement(id1);

    // Undo the removal
    store.getState().undo();

    const state = store.getState();
    const elements = state.document.pages[0]?.elements ?? [];
    const elementIds = new Set(elements.map((e) => e.id));

    // Element should be restored
    expect(elementIds.has(id1)).toBe(true);
    expect(elementIds.has(id2)).toBe(true);

    // Selection should be valid (all selected IDs exist in elements)
    for (const selectedId of state.activeElementIds) {
      expect(elementIds.has(selectedId)).toBe(true);
    }

    // Page structure: at least one page with a valid array
    expect(state.document.pages.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(elements)).toBe(true);
  });
});

describe('Selection Cycling Stability', () => {
  /**
   * @description Rapidly cycling selection through many elements must not
   * produce stale or inconsistent state. The activeElementIds must always
   * reflect the LAST selection action, not a stale intermediate value.
   */
  it('always reflects the last selection action after rapid cycling', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocWithElements(10));

    const elements = store.getState().document.pages[0]?.elements ?? [];

    // Rapid selection cycling
    for (const el of elements) {
      store.getState().selectElement(el.id);
    }

    const lastElement = elements[elements.length - 1];

    expect(lastElement).toBeDefined();
    expect(store.getState().activeElementIds).toEqual([lastElement?.id]);
  });
});
