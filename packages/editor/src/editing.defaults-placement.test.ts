import { describe, expect, it } from 'vitest';

import {
  appendPathPoint,
  beginPlacement,
  cancelPlacement,
  commitEllipseRotation,
  commitPlacementExtent,
  getElementDefaults,
  isSamePlacementPoint,
  resolveCornerBounds,
  resolveEllipseBounds,
  resolvePlacementMode,
  resolvePluginSingleClickBounds,
  setEllipseRadius,
  setPlacementAnchor,
  startPathDrawing,
  startPathEditing,
  updatePlacementPreview,
  validateEditorConfig,
} from './editing';
import { getElements, makeElement, storeWithElements } from './editing-test-helpers';
import { createEditorStore } from './store-actions';

const COUNTDOWN_PLUGIN = { type: 'countdown', defaults: { width: 144, height: 96, content: 'Countdown' } };

describe('getElementDefaults', () => {
  /** @description The placement tool must use per-type defaults so every inserted built-in element starts with sensible dimensions, starter content, and visible styling (fill/stroke/color) so the element doesn't render transparent. */
  it('returns the expected dimensions, content, and visible default styling for built-in and plugin types', () => {
    const text = getElementDefaults('text');

    expect(text.width).toBe(80);
    expect(text.height).toBe(20);
    expect(text.content).toBe('New Text');
    expect(text.style.fontColor).toBeDefined();

    const rectangle = getElementDefaults('rectangle');

    expect(rectangle.width).toBe(80);
    expect(rectangle.height).toBe(50);
    expect(rectangle.style.backgroundColor).toBeDefined();

    const ellipse = getElementDefaults('ellipse');

    expect(ellipse.width).toBe(50);
    expect(ellipse.height).toBe(50);
    expect(ellipse.style.backgroundColor).toBeDefined();

    const path = getElementDefaults('path');

    expect(path.style.stroke).toBeDefined();
    expect(path.style.strokeWidth).toBeGreaterThan(0);

    const ticker = getElementDefaults('ticker');

    expect(ticker.width).toBe(400);
    expect(ticker.height).toBe(40);
    expect(ticker.content).toBe('["Item 1"]');

    const plugin = getElementDefaults('custom-card', [
      { type: 'custom-card', defaults: { width: 144, height: 96, content: 'Plugin' } },
    ]);

    expect(plugin.width).toBe(144);
    expect(plugin.height).toBe(96);
    expect(plugin.content).toBe('Plugin');
  });

  /** @description Every built-in element type must have a human-readable default name so newly placed elements aren't blank in the Layers panel. */
  it('supplies a human-readable default name for every built-in element type', () => {
    expect(getElementDefaults('text').name).toBe('Text');
    expect(getElementDefaults('rectangle').name).toBe('Rectangle');
    expect(getElementDefaults('ellipse').name).toBe('Ellipse');
    expect(getElementDefaults('path').name).toBe('Path');
    expect(getElementDefaults('image').name).toBe('Image');
    expect(getElementDefaults('svg').name).toBe('SVG');
    expect(getElementDefaults('qrcode').name).toBe('QR Code');
    expect(getElementDefaults('video').name).toBe('Video');
    expect(getElementDefaults('clock').name).toBe('Clock');
    expect(getElementDefaults('ticker').name).toBe('Ticker');
    expect(getElementDefaults('group').name).toBe('Group');
  });

  /** @description Plugins can override the default name via their own `defaults.name`; falling back to the plugin `label` or a capitalized type token otherwise. */
  it('resolves default names for plugin types', () => {
    expect(
      getElementDefaults('countdown', [{ type: 'countdown', defaults: { name: 'Countdown Timer' } }]).name,
    ).toBe('Countdown Timer');
    expect(getElementDefaults('countdown', [{ type: 'countdown', label: 'Countdown' }]).name).toBe('Countdown');
    expect(getElementDefaults('countdown', [{ type: 'countdown' }]).name).toBe('Countdown');
  });
});

describe('path drawing round-trip', () => {
  /**
   * @description Drawing a path via the real placement commands + appendPathPoint
   * must produce an element whose world-space vertex positions EXACTLY match
   * the click doc coordinates the user supplied. If even one point drifts,
   * clicks will visually land off their click location on screen.
   */
  it('path vertices match click doc coordinates end-to-end', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');

    const clicks = [
      { x: 120, y: 80 },
      { x: 260, y: 120 },
      { x: 200, y: 240 },
      { x: 410, y: 150 },
      { x: 330, y: 320 },
    ] as const;

    const [first, ...rest] = clicks;
    const elementId = setPlacementAnchor(store, first.x, first.y);

    expect(elementId).not.toBeNull();

    for (const click of rest) {
      appendPathPoint(store, click.x, click.y);
    }

    const element = getElements(store)[0];

    expect(element).toBeDefined();

    const pathContent = element?.content ?? '';
    const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
    const actualVertices: { readonly x: number; readonly y: number }[] = [];

    for (const match of pathContent.matchAll(pointExpression)) {
      const relativeX = Number.parseFloat(match[2] ?? '0');
      const relativeY = Number.parseFloat(match[3] ?? '0');

      actualVertices.push({
        x: (element?.position.x ?? 0) + relativeX,
        y: (element?.position.y ?? 0) + relativeY,
      });
    }

    expect(actualVertices).toHaveLength(clicks.length);

    for (let index = 0; index < clicks.length; index += 1) {
      const expected = clicks[index];
      const actual = actualVertices[index];

      if (expected === undefined || actual === undefined) {
        throw new Error(`Missing vertex at index ${String(index)}`);
      }

      // Allow 0.01-unit tolerance for coordinate rounding.
      expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(0.01);
    }
  });

  /** @description Paths drawn with negative deltas (up-left, down-left) must still preserve their click positions. */
  it.each<{ readonly label: string; readonly anchor: { readonly x: number; readonly y: number }; readonly offsets: ReadonlyArray<{ readonly x: number; readonly y: number }> }>([
    {
      label: 'anchor (500,500) / mixed directions',
      anchor: { x: 500, y: 500 },
      offsets: [
        { x: 50, y: 60 },
        { x: -80, y: 40 },
        { x: -30, y: -70 },
        { x: 90, y: -40 },
      ],
    },
    {
      label: 'anchor (1000,200) / up-left + down-right',
      anchor: { x: 1000, y: 200 },
      offsets: [
        { x: -100, y: -80 },
        { x: 50, y: -50 },
        { x: 80, y: 100 },
      ],
    },
  ])('path vertices match clicks in every drag direction — $label', ({ anchor, offsets }) => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, anchor.x, anchor.y);

    const clicks = [anchor, ...offsets.map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }))];

    for (let index = 1; index < clicks.length; index += 1) {
      const click = clicks[index];

      if (click === undefined) continue;
      appendPathPoint(store, click.x, click.y);
    }

    const element = getElements(store)[0];
    const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
    const matches = Array.from((element?.content ?? '').matchAll(pointExpression));

    expect(matches).toHaveLength(clicks.length);

    for (let index = 0; index < clicks.length; index += 1) {
      const match = matches[index];
      const expected = clicks[index];

      if (match === undefined || expected === undefined) continue;

      const actualX = (element?.position.x ?? 0) + Number.parseFloat(match[2] ?? '0');
      const actualY = (element?.position.y ?? 0) + Number.parseFloat(match[3] ?? '0');

      expect(Math.abs(actualX - expected.x)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(actualY - expected.y)).toBeLessThanOrEqual(0.01);
    }
  });

  /** @description Regression guard for the "whole element moves when clicking left/up" bug. Each appendPathPoint that extends the bbox in negative X or Y must propagate the new element.position to the active page instance's transform — the renderer reads the instance transform, not element.position, so without the sync the rendered path stays pinned at the first click while its bbox re-anchors in state. */
  it('syncs element position to the active page instance transform after each append', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 500, 300);

    const readInstance = (): { readonly x: number; readonly y: number } | null => {
      const state = store.getState();
      const element = state.document.elements[0];

      if (element === undefined) return null;

      const page = state.document.pages[state.activePageIndex];
      const instance = page?.elements.find((item) => item.elementId === element.id);

      return instance === undefined ? null : { x: instance.transform.position.x, y: instance.transform.position.y };
    };

    const readElement = (): { readonly x: number; readonly y: number } | null => {
      const element = store.getState().document.elements[0];

      return element === undefined ? null : { x: element.position.x, y: element.position.y };
    };

    // Second click to the RIGHT — element.position shifts only by stroke padding.
    appendPathPoint(store, 550, 300);
    expect(readInstance()).toEqual(readElement());

    // Third click UPWARD — element.position.y moves up, instance must follow.
    appendPathPoint(store, 550, 250);
    expect(readInstance()).toEqual(readElement());

    // Fourth click LEFTWARD — element.position.x moves left, instance must follow.
    appendPathPoint(store, 400, 250);
    expect(readInstance()).toEqual(readElement());

    // Final vertex positions reconstructed through the page instance transform
    // must match the original click coordinates exactly.
    const element = store.getState().document.elements[0];

    expect(element).toBeDefined();

    const instance = readInstance();

    expect(instance).not.toBeNull();

    const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
    const matches = Array.from((element?.content ?? '').matchAll(pointExpression));
    const reconstructed = matches.map((match) => ({
      x: (instance?.x ?? 0) + Number.parseFloat(match[2] ?? '0'),
      y: (instance?.y ?? 0) + Number.parseFloat(match[3] ?? '0'),
    }));

    expect(reconstructed).toEqual([
      { x: 500, y: 300 },
      { x: 550, y: 300 },
      { x: 550, y: 250 },
      { x: 400, y: 250 },
    ]);
  });

  /** @description Clicking the last committed vertex again commits the path and exits drawing mode. User signal: "done — this is the final point." */
  it('clicking the last vertex again commits the path and exits drawing', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 100, 100);
    appendPathPoint(store, 200, 100);
    appendPathPoint(store, 200, 180);

    expect(store.getState().pathDrawingElementId).not.toBeNull();

    const element = store.getState().document.elements[0];

    expect(element?.content).toBe('M1,1 L101,1 L101,81');

    // Click the last vertex again — triggers commit.
    appendPathPoint(store, 200, 180);

    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });

    // The duplicate click is NOT appended — content is unchanged.
    const committed = store.getState().document.elements[0];

    expect(committed?.content).toBe('M1,1 L101,1 L101,81');
  });

  /** @description Clicks within a small tolerance of the last vertex also commit — mouse jitter / anti-aliased pixels must not prevent the commit. */
  it('clicks within a few doc units of the last vertex commit the path', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 100, 100);
    appendPathPoint(store, 200, 100);

    // 2 doc units away — still commits.
    appendPathPoint(store, 201.5, 101);

    expect(store.getState().pathDrawingElementId).toBeNull();
  });

  /** @description Clicks far from the last vertex still append a new point, not commit. */
  it('clicks far from the last vertex append a new point instead of committing', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 100, 100);
    appendPathPoint(store, 200, 100);

    // 10 doc units away — appends.
    appendPathPoint(store, 210, 100);

    expect(store.getState().pathDrawingElementId).not.toBeNull();

    const element = store.getState().document.elements[0];
    const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
    const matches = Array.from((element?.content ?? '').matchAll(pointExpression));

    expect(matches).toHaveLength(3);
  });

  /** @description The path's bounding box must tightly wrap all click points (modulo stroke-width padding). */
  it('path bbox wraps all click points with stroke-width padding', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 100, 100);
    appendPathPoint(store, 300, 150);
    appendPathPoint(store, 200, 260);

    const element = getElements(store)[0];

    if (element === undefined) throw new Error('Path element missing');

    const strokeWidth = element.style.strokeWidth ?? 1;
    const padding = strokeWidth / 2;

    const expectedMinX = 100 - padding;
    const expectedMinY = 100 - padding;
    const expectedMaxX = 300 + padding;
    const expectedMaxY = 260 + padding;

    expect(element.position.x).toBeCloseTo(expectedMinX, 1);
    expect(element.position.y).toBeCloseTo(expectedMinY, 1);
    expect(element.position.x + element.width).toBeCloseTo(expectedMaxX, 1);
    expect(element.position.y + element.height).toBeCloseTo(expectedMaxY, 1);
  });
});

describe('placement assigns a human-readable name to new elements', () => {
  /** @description Two-click rectangle placement stamps the default "Rectangle" name so the Layers panel shows a real label instead of an empty entry. */
  it('rectangle placement names the element "Rectangle"', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    setPlacementAnchor(store, 10, 10);
    commitPlacementExtent(store, 60, 40);

    expect(getElements(store)[0]?.name).toBe('Rectangle');
  });

  /** @description Three-click ellipse placement names the element "Ellipse". */
  it('ellipse placement names the element "Ellipse"', () => {
    const store = createEditorStore();

    beginPlacement(store, 'ellipse');
    setPlacementAnchor(store, 50, 50);
    setEllipseRadius(store, 80, 70);
    commitEllipseRotation(store, 100, 50);

    expect(getElements(store)[0]?.name).toBe('Ellipse');
  });

  /** @description Path placement names the element "Path" on the very first click. */
  it('path placement names the element "Path"', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 20, 20);

    expect(getElements(store)[0]?.name).toBe('Path');
  });

  /** @description Plugin single-click placement uses the plugin's declared default name. */
  it('plugin single-click placement uses the plugin default name', () => {
    const store = createEditorStore();

    beginPlacement(store, 'countdown');
    setPlacementAnchor(store, 200, 100, [
      { type: 'countdown', label: 'Countdown', defaults: { width: 144, height: 96 } },
    ]);

    expect(getElements(store)[0]?.name).toBe('Countdown');
  });
});

describe('placement writes visible default styling into new elements', () => {
  /** @description Two-click rectangle placement must stamp the default fill so the new element is visible immediately after the extent click (not a transparent, invisible shape). */
  it('commits rectangle placement with a visible backgroundColor', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    setPlacementAnchor(store, 10, 10);
    commitPlacementExtent(store, 60, 40);

    const placed = getElements(store)[0];

    expect(placed?.style.fill.kind).toBe('solid');
  });

  /** @description Three-click ellipse placement must stamp the default fill so the new element is visible. */
  it('commits ellipse placement with a visible fill', () => {
    const store = createEditorStore();

    beginPlacement(store, 'ellipse');
    setPlacementAnchor(store, 50, 50);
    setEllipseRadius(store, 80, 70);
    commitEllipseRotation(store, 100, 50);

    const placed = getElements(store)[0];

    expect(placed?.style.fill.kind).toBe('solid');
  });

  /** @description Path placement must stamp a default stroke so the path renders visibly before the user finishes drawing. */
  it('commits path placement with a visible stroke', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');
    setPlacementAnchor(store, 20, 20);

    const placed = getElements(store)[0];

    expect(placed?.style.stroke).toBeDefined();
    expect(placed?.style.strokeWidth).toBeGreaterThan(0);
  });
});

describe('resolveCornerBounds', () => {
  /** @description Dragging from top-left to bottom-right must produce a rectangle whose top-left is the anchor point. */
  it('places top-left at anchor when dragging down-right', () => {
    expect(resolveCornerBounds({ x: 50, y: 30 }, { x: 110, y: 70 })).toEqual({
      position: { x: 50, y: 30 },
      width: 60,
      height: 40,
      rotation: 0,
    });
  });

  /** @description Dragging up-left must still produce a rectangle with a positive width/height and the correct top-left corner. */
  it('normalises negative drags so width and height are positive', () => {
    expect(resolveCornerBounds({ x: 110, y: 70 }, { x: 50, y: 30 })).toEqual({
      position: { x: 50, y: 30 },
      width: 60,
      height: 40,
      rotation: 0,
    });
  });

  /** @description Dragging up-right and down-left must both produce correct bounds, validating all four drag directions. */
  it('handles up-right and down-left drags correctly', () => {
    expect(resolveCornerBounds({ x: 50, y: 70 }, { x: 110, y: 30 })).toEqual({
      position: { x: 50, y: 30 },
      width: 60,
      height: 40,
      rotation: 0,
    });
    expect(resolveCornerBounds({ x: 110, y: 30 }, { x: 50, y: 70 })).toEqual({
      position: { x: 50, y: 30 },
      width: 60,
      height: 40,
      rotation: 0,
    });
  });
});

describe('resolveEllipseBounds', () => {
  /** @description Ellipse phase 2 uses component-wise deltas so rx and ry can be independent; rotation is zero when phase 3 has not yet been committed. */
  it('derives rx and ry from component-wise deltas with zero rotation', () => {
    expect(resolveEllipseBounds({ x: 100, y: 100 }, { x: 130, y: 120 }, null)).toEqual({
      position: { x: 70, y: 80 },
      width: 60,
      height: 40,
      rotation: 0,
    });
  });

  /** @description Ellipse phase 3 stamps rotation derived from atan2 in degrees; a horizontal rotation pointer yields 0°. */
  it('stamps rotation in degrees based on atan2 of the pointer vs. centre', () => {
    const bounds = resolveEllipseBounds({ x: 100, y: 100 }, { x: 130, y: 120 }, { x: 150, y: 100 });

    expect(bounds.position).toEqual({ x: 70, y: 80 });
    expect(bounds.width).toBe(60);
    expect(bounds.height).toBe(40);
    expect(bounds.rotation).toBe(0);
  });

  /** @description A diagonal rotation pointer produces a non-zero rotation matching the atan2 of the Δy/Δx pair. */
  it('produces 45° rotation for equal positive Δx and Δy', () => {
    const bounds = resolveEllipseBounds({ x: 100, y: 100 }, { x: 120, y: 120 }, { x: 150, y: 150 });

    expect(bounds.rotation).toBe(45);
  });
});

describe('resolvePluginSingleClickBounds', () => {
  /** @description Plugin single-click placement must anchor the element's top-left at the click point using the plugin's declared default width/height. */
  it('places the plugin default-sized element at the click point', () => {
    expect(resolvePluginSingleClickBounds({ x: 200, y: 100 }, 144, 96)).toEqual({
      position: { x: 200, y: 100 },
      width: 144,
      height: 96,
      rotation: 0,
    });
  });
});

describe('isSamePlacementPoint', () => {
  /** @description Placement actions compare extent clicks against their anchor to ignore degenerate zero-size placements. */
  it('detects coordinate equality with 2-decimal precision', () => {
    expect(isSamePlacementPoint({ x: 100, y: 50 }, { x: 100, y: 50 })).toBe(true);
    expect(isSamePlacementPoint({ x: 100, y: 50 }, { x: 100.004, y: 50 })).toBe(true);
    expect(isSamePlacementPoint({ x: 100, y: 50 }, { x: 100.05, y: 50 })).toBe(false);
  });
});

describe('resolvePlacementMode', () => {
  /** @description Built-in corner types use the two-click corner flow; ellipse uses three-click; path uses multi-click drawing; registered plugins fall back to single-click. */
  it('maps element types to their placement mode', () => {
    for (const cornerType of ['rectangle', 'image', 'svg', 'video', 'qrcode', 'clock', 'ticker', 'group', 'text']) {
      expect(resolvePlacementMode(cornerType)).toBe('corner');
    }

    expect(resolvePlacementMode('ellipse')).toBe('ellipse');
    expect(resolvePlacementMode('path')).toBe('path');
    expect(resolvePlacementMode('countdown', [COUNTDOWN_PLUGIN])).toBe('plugin-single-click');
  });
});

describe('placement state transitions', () => {
  /** @description beginPlacement enters the anchor sub-state and cancelPlacement resets everything to none. */
  it('starts and cancels placement mode', () => {
    const store = createEditorStore();

    beginPlacement(store, 'text');
    expect(store.getState().placement).toEqual({ type: 'placement-anchor', elementType: 'text' });
    expect(store.getState().editingMode).toEqual({ type: 'placement-anchor', elementType: 'text' });

    cancelPlacement(store);
    expect(store.getState().placement).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'none' });
    expect(store.getState().placementPreview).toBeNull();
  });

  /** @description Entering placement must clear any active path editing or drawing mode so the canvas has a single interaction mode at a time. */
  it('clears path editing and drawing when placement starts', () => {
    const path = makeElement({ type: 'path', content: 'M0,0 L10,10' });
    const store = storeWithElements(path);

    startPathEditing(store, path.id);
    startPathDrawing(store, path.id);
    beginPlacement(store, 'rectangle');

    expect(store.getState().pathEditingElementId).toBeNull();
    expect(store.getState().pathDrawingElementId).toBeNull();
    expect(store.getState().placement).toEqual({ type: 'placement-anchor', elementType: 'rectangle' });
  });

  /** @description Two-click placement for corner types transitions anchor → extent → committed element, and the element size matches the click-to-click delta. */
  it('two-click placement for corner types creates an element with click-derived size', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    setPlacementAnchor(store, 50, 30);
    expect(store.getState().placement).toEqual({
      type: 'placement-extent',
      elementType: 'rectangle',
      anchor: { x: 50, y: 30 },
    });

    const elementId = commitPlacementExtent(store, 110, 70);
    const placed = getElements(store)[0];

    expect(elementId).not.toBeNull();
    expect(placed?.type).toBe('rectangle');
    expect(placed?.position).toEqual({ x: 50, y: 30 });
    expect(placed?.width).toBe(60);
    expect(placed?.height).toBe(40);
    expect(store.getState().placement).toBeNull();
    expect(store.getState().activeElementIds).toEqual([elementId as string]);
  });

  /** @description Dragging a corner type from bottom-right to top-left still produces a rectangle with a positive size anchored at the top-left click. */
  it('normalises reverse-direction corner drags', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    setPlacementAnchor(store, 110, 70);
    commitPlacementExtent(store, 50, 30);

    const placed = getElements(store)[0];

    expect(placed?.position).toEqual({ x: 50, y: 30 });
    expect(placed?.width).toBe(60);
    expect(placed?.height).toBe(40);
  });

  /** @description An extent click on the same point as the anchor is a no-op, keeping the placement in the sizing sub-state instead of creating a zero-size element. */
  it('ignores extent clicks equal to the anchor', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    setPlacementAnchor(store, 100, 50);

    const result = commitPlacementExtent(store, 100, 50);

    expect(result).toBeNull();
    expect(getElements(store)).toHaveLength(0);
    expect(store.getState().placement).toEqual({
      type: 'placement-extent',
      elementType: 'rectangle',
      anchor: { x: 100, y: 50 },
    });
  });

  /** @description Ellipse placement transitions through all three phases and stamps the radius and rotation derived from the clicks. */
  it('three-click ellipse placement stamps rx, ry, and rotation from clicks', () => {
    const store = createEditorStore();

    beginPlacement(store, 'ellipse');
    setPlacementAnchor(store, 100, 100);
    expect(store.getState().placement).toEqual({ type: 'placement-ellipse-radius', anchor: { x: 100, y: 100 } });

    setEllipseRadius(store, 130, 120);
    expect(store.getState().placement).toEqual({
      type: 'placement-ellipse-rotation',
      anchor: { x: 100, y: 100 },
      radius: { rx: 30, ry: 20 },
    });

    commitEllipseRotation(store, 150, 100);

    const placed = getElements(store)[0];

    expect(placed?.type).toBe('ellipse');
    expect(placed?.position).toEqual({ x: 70, y: 80 });
    expect(placed?.width).toBe(60);
    expect(placed?.height).toBe(40);
    expect(placed?.rotation).toBe(0);
    expect(store.getState().placement).toBeNull();
  });

  /** @description Path placement creates a single-point path element with "M0,0" content on the first click and enters path-drawing mode immediately. */
  it('path placement creates a single-point path and enters path-drawing mode', () => {
    const store = createEditorStore();

    beginPlacement(store, 'path');

    const elementId = setPlacementAnchor(store, 120, 80);
    const placed = getElements(store)[0];

    expect(elementId).not.toBeNull();
    expect(placed?.type).toBe('path');
    expect(placed?.content).toBe('M0,0');
    expect(placed?.position).toEqual({ x: 120, y: 80 });
    expect(store.getState().pathDrawingElementId).toBe(elementId);
    expect(store.getState().placement).toBeNull();
    expect(store.getState().editingMode).toEqual({ type: 'path-drawing', elementId: elementId as string });
  });

  /** @description External plugin element types bypass the multi-click flow and are created immediately at the plugin's declared default size. */
  it('plugin single-click placement creates an element at the plugin default size', () => {
    const store = createEditorStore();

    beginPlacement(store, 'countdown');

    const elementId = setPlacementAnchor(store, 200, 100, [COUNTDOWN_PLUGIN]);
    const placed = getElements(store)[0];

    expect(elementId).not.toBeNull();
    expect(placed?.type).toBe('countdown');
    expect(placed?.position).toEqual({ x: 200, y: 100 });
    expect(placed?.width).toBe(144);
    expect(placed?.height).toBe(96);
    expect(store.getState().placement).toBeNull();
    expect(store.getState().activeElementIds).toEqual([elementId as string]);
  });

  /** @description Escape / cancelPlacement from any placement sub-state must clear placement without creating any element. */
  it('cancels placement from every sub-state without creating an element', () => {
    const corner = createEditorStore();

    beginPlacement(corner, 'rectangle');
    setPlacementAnchor(corner, 10, 10);
    cancelPlacement(corner);
    expect(getElements(corner)).toHaveLength(0);
    expect(corner.getState().placement).toBeNull();
    expect(corner.getState().editingMode).toEqual({ type: 'none' });

    const ellipseRadius = createEditorStore();

    beginPlacement(ellipseRadius, 'ellipse');
    setPlacementAnchor(ellipseRadius, 10, 10);
    cancelPlacement(ellipseRadius);
    expect(getElements(ellipseRadius)).toHaveLength(0);
    expect(ellipseRadius.getState().placement).toBeNull();

    const ellipseRotation = createEditorStore();

    beginPlacement(ellipseRotation, 'ellipse');
    setPlacementAnchor(ellipseRotation, 10, 10);
    setEllipseRadius(ellipseRotation, 30, 30);
    cancelPlacement(ellipseRotation);
    expect(getElements(ellipseRotation)).toHaveLength(0);
    expect(ellipseRotation.getState().placement).toBeNull();
  });

  /** @description updatePlacementPreview stores the pointer coordinate without mutating history and is a no-op when placement is inactive. */
  it('tracks the ephemeral preview pointer during placement', () => {
    const store = createEditorStore();

    updatePlacementPreview(store, 10, 20);
    expect(store.getState().placementPreview).toBeNull();

    beginPlacement(store, 'rectangle');
    updatePlacementPreview(store, 10, 20);
    expect(store.getState().placementPreview).toEqual({ x: 10, y: 20 });

    setPlacementAnchor(store, 10, 10);
    updatePlacementPreview(store, 55, 65);
    expect(store.getState().placementPreview).toEqual({ x: 55, y: 65 });

    cancelPlacement(store);
    expect(store.getState().placementPreview).toBeNull();
  });

  /** @description Sub-state actions called in the wrong sub-state must be no-ops so stray events can't corrupt placement. */
  it('wrong-phase actions are no-ops', () => {
    const store = createEditorStore();

    beginPlacement(store, 'rectangle');
    expect(commitPlacementExtent(store, 20, 20)).toBeNull();
    expect(setEllipseRadius(store, 20, 20)).toBe(false);
    expect(commitEllipseRotation(store, 20, 20)).toBeNull();
  });
});

describe('validateEditorConfig', () => {
  /** @description Editor config validation must accept well-formed configs and reject invalid font definitions before the editor mounts. */
  it('validates good configs and rejects invalid ones', () => {
    expect(() => validateEditorConfig({ allowedFonts: [{ family: 'Inter' }] })).not.toThrow();
    expect(() => validateEditorConfig({ allowedFonts: [{ family: '' }] })).toThrow();
  });
});
