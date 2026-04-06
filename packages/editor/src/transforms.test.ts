import { describe, expect, it } from '@jest/globals';

import {
  applyDragTranslation,
  applyResize,
  applyRotation,
  calculateAnchors,
  compensateZoom,
  findGridSnap,
  findSnapGuides,
  isBorderRadiusHandle,
} from './transforms';

describe('Drag Translation', () => {
  /** @description Dragging must move the element to the final drop position so the canvas follows the pointer correctly. */
  it('moves an element to its new drop position', () => {
    const result = applyDragTranslation({ x: 10, y: 20 }, { dx: 40, dy: 40 }, 1);

    expect(result).toEqual({ x: 50, y: 60 });
  });

  /** @description The translation math must stay pure so both ephemeral drag frames and the final committed drop use the same geometry result. */
  it('produces the same pure translation math for live and committed drags', () => {
    const result = applyDragTranslation({ x: 0, y: 0 }, { dx: 100, dy: 200 }, 1);

    expect(result).toEqual({ x: 100, y: 200 });
  });
});

describe('Resize via Handles', () => {
  const baseRect = { x: 0, y: 0, width: 80, height: 50 };

  /** @description Corner handles must resize both axes together to preserve the expected transform-widget behavior. */
  it('changes both width and height when resizing from a corner handle', () => {
    const result = applyResize(baseRect, 'se', 20, 10, 1);

    expect(result.width).toBe(100);
    expect(result.height).toBe(60);
  });

  /** @description Edge handles must only affect their corresponding axis so horizontal and vertical resizes remain predictable. */
  it('changes only one axis when resizing from an edge handle', () => {
    const result = applyResize(baseRect, 'e', 30, 15, 1);

    expect(result.width).toBe(110);
    expect(result.height).toBe(50);
  });
});

describe('Rotation', () => {
  /** @description Rotation is stored in degrees, so dragging the rotation handle must add the delta in degree space. */
  it('updates rotation in degrees', () => {
    expect(applyRotation(0, 45)).toBe(45);
  });
});

describe('Anchor Auto-Assignment', () => {
  const canvas = { width: 508, height: 285.75 };

  /** @description Elements centered in the top-left quadrant must anchor to left/top for responsive placement behavior. */
  it('assigns left/top anchors for the top-left quadrant', () => {
    expect(calculateAnchors({ x: 100, y: 50 }, canvas)).toEqual({ anchorX: 'left', anchorY: 'top' });
  });

  /** @description Elements centered in the bottom-right quadrant must anchor to right/bottom after translation. */
  it('assigns right/bottom anchors for the bottom-right quadrant', () => {
    expect(calculateAnchors({ x: 400, y: 200 }, canvas)).toEqual({ anchorX: 'right', anchorY: 'bottom' });
  });
});

describe('Zoom Compensation', () => {
  /** @description At 2× zoom, screen deltas must be halved in canvas space so the movement feels 1:1 under the pointer. */
  it('halves deltas at 2x zoom', () => {
    expect(compensateZoom(100, 2)).toBe(50);
  });

  /** @description At 0.5× zoom, screen deltas must be doubled in canvas space to preserve consistent drag and resize behavior. */
  it('doubles deltas at 0.5x zoom', () => {
    expect(compensateZoom(50, 0.5)).toBe(100);
  });
});

describe('3D Transform Persistence', () => {
  /** @description Translation math must stay isolated to x/y updates so 3D transform fields survive selection and animation changes untouched. */
  it('does not contaminate 3D transform state during drag math', () => {
    const result = applyDragTranslation({ x: 10, y: 10 }, { dx: 5, dy: 5 }, 1);

    expect(result).toEqual({ x: 15, y: 15 });
    expect(Object.keys(result)).toEqual(['x', 'y']);
  });
});

describe('Border Radius Handles', () => {
  /** @description Rectangle selections must expose corner-radius handles, while other element types must not. */
  it('returns true only for rectangle elements', () => {
    expect(isBorderRadiusHandle('rectangle')).toBe(true);
    expect(isBorderRadiusHandle('ellipse')).toBe(false);
    expect(isBorderRadiusHandle('text')).toBe(false);
    expect(isBorderRadiusHandle('image')).toBe(false);
  });
});

describe('Smart Guide Snapping', () => {
  const threshold = 5;

  /** @description When the dragged element lands within the snap threshold of another element edge, it must align and report guide lines for the UI. */
  it('snaps to nearby element edges within threshold', () => {
    const dragged = { x: 103, y: 50, width: 80, height: 50 };
    const others = [{ x: 100, y: 0, width: 60, height: 40 }];
    const result = findSnapGuides(dragged, others, [], threshold);

    expect(result.snappedPosition.x).toBe(100);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  /** @description No guide should fire when the element is farther away than the configured 5px snap threshold. */
  it('does not snap when no candidate is inside the threshold', () => {
    const dragged = { x: 200, y: 200, width: 80, height: 50 };
    const others = [{ x: 0, y: 0, width: 50, height: 50 }];
    const result = findSnapGuides(dragged, others, [], threshold);

    expect(result.snappedPosition).toEqual({ x: 200, y: 200 });
    expect(result.guides).toHaveLength(0);
  });

  /** @description User-created guides must participate in the same snap search as element guides so ruler-created guides behave consistently. */
  it('snaps to user-created guide lines', () => {
    const dragged = { x: 53, y: 50, width: 80, height: 50 };
    const result = findSnapGuides(dragged, [], [{ axis: 'x', position: 50 }], threshold);

    expect(result.snappedPosition.x).toBe(50);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  /** @description When page-center and lower-priority guides are equally close, the page-center guide must win per the spec’s precedence order. */
  it('prefers page-center guides over lower-priority candidates when distances tie', () => {
    const dragged = { x: 100, y: 20, width: 80, height: 40 };
    const others = [{ x: 103, y: 0, width: 40, height: 40 }];
    const result = findSnapGuides(dragged, others, [{ axis: 'x', position: 137, priority: 1 }], threshold);

    expect(result.snappedPosition.x).toBe(97);
    expect(result.guides).toContainEqual({ axis: 'x', position: 137 });
  });
});

describe('Grid Snapping', () => {
  /** @description With grid snapping enabled, positions inside the threshold must quantize to the nearest grid intersection. */
  it('snaps to the nearest grid intersection inside the threshold', () => {
    expect(findGridSnap({ x: 12, y: 23 }, 10, 5)).toEqual({ x: 10, y: 20 });
  });

  /** @description Positions outside the snap threshold must remain unchanged so loose drags do not jump unexpectedly. */
  it('does not snap when outside the grid threshold', () => {
    expect(findGridSnap({ x: 16, y: 17 }, 10, 2)).toEqual({ x: 16, y: 17 });
  });
});
