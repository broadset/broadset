import { type BroadsetDocument, type BroadsetElement, createDefaultElement } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  computeGridLines,
  computeInlineEditOverlay,
  computeMarqueeSelection,
  computeRulerTicks,
  computeSafetyBoundaries,
} from './canvas';
import { createEditorStore, createEmptyEditorDocument } from './store-actions';

function makeDocumentWithElements(count: number): BroadsetDocument {
  const base = createEmptyEditorDocument();

  return {
    ...base,
    elements: Array.from({ length: count }, (_, index) => {
      const element = createDefaultElement('rectangle');

      return {
        ...element,
        id: `el-${String(index)}`,
        position: { x: index * 50, y: index * 50 },
      } satisfies BroadsetElement;
    }),
  };
}

describe('Marquee Selection', () => {
  /** @description Background marquee drags must select every element whose bounds intersect the selection rectangle. */
  it('selects all elements intersecting the marquee rectangle', () => {
    const elements = [
      { id: 'a', position: { x: 0, y: 0 }, width: 40, height: 40 },
      { id: 'b', position: { x: 100, y: 100 }, width: 40, height: 40 },
      { id: 'c', position: { x: 200, y: 200 }, width: 40, height: 40 },
    ];

    const selected = computeMarqueeSelection(elements, { x: 0, y: 0, width: 150, height: 150 });

    expect(selected).toContain('a');
    expect(selected).toContain('b');
    expect(selected).not.toContain('c');
  });

  /** @description A zero-sized marquee must behave as a no-op so accidental clicks on the background do not create phantom multi-selections. */
  it('returns an empty selection for a zero-sized marquee', () => {
    const selected = computeMarqueeSelection([{ id: 'a', position: { x: 0, y: 0 }, width: 40, height: 40 }], {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

    expect(selected).toEqual([]);
  });
});

describe('Grid and Ruler Computation', () => {
  /** @description Grid lines must repeat at the configured interval so the canvas shows a stable layout reference when the grid is enabled. */
  it('produces grid lines at the configured interval', () => {
    const lines = computeGridLines({ canvasWidth: 100, canvasHeight: 60, gridSize: 10, zoom: 1 });

    expect(lines.filter((line) => line.axis === 'h').length).toBeGreaterThan(0);
    expect(lines.filter((line) => line.axis === 'v').length).toBeGreaterThan(0);
    expect(lines.every((line) => line.position % 10 === 0)).toBe(true);
  });

  /** @description Ruler ticks must reflect the current unit system and origin so labels remain accurate during pan and unit changes. */
  it('computes readable ruler ticks that respond to the origin offset', () => {
    const ticksAtOrigin = computeRulerTicks({ length: 100, unit: 'mm', zoom: 1, origin: 0 });
    const ticksOffset = computeRulerTicks({ length: 100, unit: 'px', zoom: 1, origin: 50 });

    expect(ticksAtOrigin.length).toBeGreaterThan(0);
    expect(ticksAtOrigin[0]?.label).toBeDefined();
    expect(ticksAtOrigin[0]?.label).not.toBe(ticksOffset[0]?.label);
  });
});

describe('Safety Boundaries and Inline Editing Overlay', () => {
  /** @description Broadcast and print safety modes must render overlay rectangles, while none mode must leave the canvas unobstructed. */
  it('returns safety overlays only for non-none view modes', () => {
    expect(
      computeSafetyBoundaries({
        canvasWidth: 508,
        canvasHeight: 285.75,
        padding: [10, 10, 10, 10],
        viewMode: 'broadcast',
      }).length,
    ).toBeGreaterThan(0);

    expect(
      computeSafetyBoundaries({
        canvasWidth: 508,
        canvasHeight: 285.75,
        padding: [10, 10, 10, 10],
        viewMode: 'none',
      }),
    ).toEqual([]);
  });

  /** @description Inline text editing overlays must be zoom-compensated so the contenteditable surface stays aligned with the rendered text element. */
  it('computes a zoom-compensated inline edit overlay rectangle', () => {
    const result = computeInlineEditOverlay({
      elementRect: { x: 100, y: 50, width: 200, height: 40 },
      zoom: 2,
      panX: 10,
      panY: 5,
    });

    expect(result).toEqual({ x: 210, y: 105, width: 400, height: 80 });
  });
});

describe('Canvas Store Stability', () => {
  /** @description Rapid undo/redo cycles must keep the editor state consistent so the canvas never corrupts its selection or page invariants under stress. */
  it('keeps store state consistent through rapid undo and redo cycles', () => {
    const store = createEditorStore();

    for (let index = 0; index < 5; index += 1) {
      store.getState().addElement('rectangle');
    }

    for (let index = 0; index < 20; index += 1) {
      store.getState().undo();
      store.getState().redo();
    }

    const state = store.getState();

    expect(state.document.elements).toHaveLength(5);
    expect(state.activePageIndex).toBeGreaterThanOrEqual(0);
    expect(state.activePageIndex).toBeLessThan(state.document.pages.length);
  });

  /** @description Interleaved add, remove, and undo operations must preserve document invariants and never leave stale selected ids behind. */
  it('maintains invariants after add/remove/undo interleaving', () => {
    const store = createEditorStore();
    const firstId = store.getState().addElement('rectangle');
    const secondId = store.getState().addElement('text');

    store.getState().removeElement(firstId);
    store.getState().undo();

    const state = store.getState();
    const elementIds = new Set(state.document.elements.map((element) => element.id));

    expect(elementIds.has(firstId)).toBe(true);
    expect(elementIds.has(secondId)).toBe(true);
    expect(state.activeElementIds.every((selectedId) => elementIds.has(selectedId))).toBe(true);
    expect(state.document.pages.length).toBeGreaterThanOrEqual(1);
  });

  /** @description Rapid selection cycling must always leave the last clicked element selected with no stale intermediate state left behind. */
  it('tracks the last selection during rapid selection cycling', () => {
    const store = createEditorStore();

    store.getState().loadTemplate(makeDocumentWithElements(10));

    for (const element of store.getState().document.elements) {
      store.getState().selectElement(element.id);
    }

    const lastElement = store.getState().document.elements.at(-1);

    expect(store.getState().activeElementIds).toEqual(lastElement === undefined ? [] : [lastElement.id]);
  });
});
