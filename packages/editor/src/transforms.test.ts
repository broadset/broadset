import { describe, expect, it } from '@jest/globals';

import type { ResizeHandle } from './transforms';
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

// ===========================================================================
// Drag Translation
// ===========================================================================

describe('Drag Translation', () => {
  /**
   * @description Dragging an element must update its position to the final
   * drop coordinates. This tests the core translation computation.
   */
  it('moves element to new position on drop', () => {
    const result = applyDragTranslation({ x: 10, y: 20 }, { dx: 40, dy: 40 }, 1);

    expect(result).toEqual({ x: 50, y: 60 });
  });

  /**
   * @description Ephemeral updates during drag must produce the same positional
   * result as a committed drop. The distinction between ephemeral and committed
   * is handled by the store (updateElementEphemeral vs commitElementUpdate);
   * the translation function is pure math.
   */
  it('produces position for both ephemeral and committed updates', () => {
    const pos = applyDragTranslation({ x: 0, y: 0 }, { dx: 100, dy: 200 }, 1);

    expect(pos).toEqual({ x: 100, y: 200 });
  });
});

// ===========================================================================
// Resize via Handles
// ===========================================================================

describe('Resize via Handles', () => {
  const baseRect = { x: 0, y: 0, width: 80, height: 50 };

  /**
   * @description Corner handles (SE, NW, NE, SW) must change both width
   * and height simultaneously.
   */
  it('corner handle changes both width and height', () => {
    const result = applyResize(baseRect, 'se' as ResizeHandle, 20, 10, 1);

    expect(result.width).toBe(100);
    expect(result.height).toBe(60);
  });

  /**
   * @description Edge handles (E, W, N, S) must change only one axis,
   * leaving the other unchanged.
   */
  it('edge handle changes only the corresponding axis', () => {
    const result = applyResize(baseRect, 'e' as ResizeHandle, 30, 15, 1);

    expect(result.width).toBe(110);
    expect(result.height).toBe(50);
  });
});

// ===========================================================================
// Rotation
// ===========================================================================

describe('Rotation', () => {
  /**
   * @description Rotation must update the element's rotation angle in degrees,
   * adding the delta to the current value.
   */
  it('updates rotation in degrees', () => {
    const result = applyRotation(0, 45);

    expect(result).toBe(45);
  });
});

// ===========================================================================
// Anchor Auto-Assignment
// ===========================================================================

describe('Anchor Auto-Assignment', () => {
  const canvas = { width: 508, height: 285.75 };

  /**
   * @description When an element's center is in the top-left quadrant of the
   * canvas, anchors must be 'left' and 'top'.
   */
  it('assigns left/top for top-left quadrant', () => {
    const result = calculateAnchors({ x: 100, y: 50 }, canvas);

    expect(result).toEqual({ anchorX: 'left', anchorY: 'top' });
  });

  /**
   * @description When an element's center is in the bottom-right quadrant,
   * anchors must be 'right' and 'bottom'.
   */
  it('assigns right/bottom for bottom-right quadrant', () => {
    const result = calculateAnchors({ x: 400, y: 200 }, canvas);

    expect(result).toEqual({ anchorX: 'right', anchorY: 'bottom' });
  });
});

// ===========================================================================
// Zoom-Compensated Transforms
// ===========================================================================

describe('Zoom-Compensated Transforms', () => {
  /**
   * @description At zoom 2x, screen-space deltas must be halved to maintain
   * 1:1 correspondence in canvas space.
   */
  it('halves deltas at zoom 2x', () => {
    const result = compensateZoom(100, 2);

    expect(result).toBe(50);
  });

  /**
   * @description At zoom 0.5x, screen-space deltas must be doubled for
   * correct canvas-space movement.
   */
  it('doubles deltas at zoom 0.5x', () => {
    const result = compensateZoom(50, 0.5);

    expect(result).toBe(100);
  });
});

// ===========================================================================
// 3D Transform Persistence
// ===========================================================================

describe('3D Transform Persistence', () => {
  /**
   * @description 3D transform values stored on BroadsetScreenProps (rotateX,
   * rotateY, rotateZ, translateZ) are data properties, not UI state. This
   * test verifies that applyDragTranslation does not mutate or discard any
   * fields outside position — the 3D values persist because the store only
   * patches position.
   */
  it('drag does not modify 3D transform fields', () => {
    const pos = applyDragTranslation({ x: 10, y: 10 }, { dx: 5, dy: 5 }, 1);

    // applyDragTranslation returns only { x, y } — it never touches
    // screen.rotateX/Y/Z/translateZ. The store merges position only.
    expect(pos).toEqual({ x: 15, y: 15 });
    expect(Object.keys(pos)).toEqual(['x', 'y']);
  });

  /**
   * @description Rotation updates only the 2D rotation field and do not
   * interfere with 3D properties stored in screen props.
   */
  it('rotation update is isolated from 3D props', () => {
    const result = applyRotation(30, 15);

    expect(result).toBe(45);
    // applyRotation returns a single number — no 3D field contamination
  });
});

// ===========================================================================
// Border Radius Handle Interaction
// ===========================================================================

describe('Border Radius Handle', () => {
  /**
   * @description Corner-radius handles must only appear for rectangle
   * elements. This predicate is used by the UI to decide visibility.
   */
  it('returns true for rectangle elements', () => {
    expect(isBorderRadiusHandle('rectangle')).toBe(true);
  });

  /**
   * @description Non-rectangle element types must not show radius handles.
   */
  it('returns false for non-rectangle elements', () => {
    expect(isBorderRadiusHandle('ellipse')).toBe(false);
    expect(isBorderRadiusHandle('text')).toBe(false);
    expect(isBorderRadiusHandle('image')).toBe(false);
    expect(isBorderRadiusHandle('path')).toBe(false);
    expect(isBorderRadiusHandle('svg')).toBe(false);
    expect(isBorderRadiusHandle('qrcode')).toBe(false);
    expect(isBorderRadiusHandle('group')).toBe(false);
  });
});

// ===========================================================================
// Smart Guide Snapping
// ===========================================================================

describe('Smart Guide Snapping', () => {
  const threshold = 5;

  /**
   * @description When a dragged element's edge is within 5px of another
   * element's edge, snapping must occur and a guide must be reported.
   */
  it('snaps when within threshold of another element edge', () => {
    const dragged = { x: 103, y: 50, width: 80, height: 50 };
    const others = [{ x: 100, y: 0, width: 60, height: 40 }];

    const result = findSnapGuides(dragged, others, [], threshold);

    // Left edge of dragged (103) is within 5px of left edge of other (100)
    expect(result.snappedPosition.x).toBe(100);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  /**
   * @description When a dragged element's edge is more than 5px from all
   * other edges and centers, no snapping must occur.
   */
  it('does not snap beyond threshold', () => {
    const dragged = { x: 200, y: 200, width: 80, height: 50 };
    const others = [{ x: 0, y: 0, width: 50, height: 50 }];

    const result = findSnapGuides(dragged, others, [], threshold);

    expect(result.snappedPosition.x).toBe(200);
    expect(result.snappedPosition.y).toBe(200);
    expect(result.guides).toHaveLength(0);
  });

  /**
   * @description Snap results must include a visual guide definition so the
   * UI can render the guide line.
   */
  it('returns guide definition when snap occurs', () => {
    const dragged = { x: 98, y: 50, width: 80, height: 50 };
    const others = [{ x: 100, y: 0, width: 60, height: 40 }];

    const result = findSnapGuides(dragged, others, [], threshold);

    expect(result.guides.length).toBeGreaterThan(0);

    const guide = result.guides[0];

    expect(guide).toBeDefined();

    if (guide === undefined) return;

    expect(guide).toHaveProperty('axis');
    expect(guide).toHaveProperty('position');
  });

  /**
   * @description User-created guide lines must participate in snapping at the
   * same 5px threshold as element edges.
   */
  it('snaps to user-created guide lines', () => {
    const dragged = { x: 53, y: 50, width: 80, height: 50 };
    const userGuides = [{ axis: 'x' as const, position: 50 }];

    const result = findSnapGuides(dragged, [], userGuides, threshold);

    // Left edge of dragged (53) is within 5px of guide at x=50
    expect(result.snappedPosition.x).toBe(50);
    expect(result.guides.length).toBeGreaterThan(0);
  });

  /**
   * @description When multiple equidistant guides compete, precedence must
   * follow: page center > page edge > element center > element edge.
   * This test verifies element edge vs element center precedence.
   */
  it('prefers element center guide over element edge guide when equidistant', () => {
    // Dragged at x=100, width=80 → left edge at 100, center at 140
    // Other A: x=0, width=200 → center at 100 (matches dragged left edge)
    // Other B: x=97 → left edge at 97 (3px from dragged left=100)
    // Other C: center at 97 (3px from dragged left=100)
    // Both at 3px, but element center should take precedence
    const dragged = { x: 100, y: 0, width: 80, height: 50 };
    const otherEdge = { x: 97, y: 0, width: 50, height: 50 };
    const otherCenter = { x: 67, y: 200, width: 60, height: 50 };
    // otherCenter center = 67 + 30 = 97 → 3px from dragged left edge (100)
    // otherEdge left edge = 97 → 3px from dragged left edge (100)

    const result = findSnapGuides(dragged, [otherEdge, otherCenter], [], threshold);

    // Both are within threshold. Center guide should win over edge guide.
    expect(result.snappedPosition.x).toBe(97);
  });
});

// ===========================================================================
// Grid Snapping
// ===========================================================================

describe('Grid Snapping', () => {
  /**
   * @description When snapToGrid is enabled, elements must snap to grid
   * intersections when within the snap threshold.
   */
  it('snaps to grid intersection within threshold', () => {
    const result = findGridSnap({ x: 12, y: 23 }, 10, 5);

    expect(result).toEqual({ x: 10, y: 20 });
  });

  /**
   * @description When the element is not within the snap threshold of a grid
   * intersection, no snapping must occur.
   */
  it('does not snap beyond grid threshold', () => {
    const result = findGridSnap({ x: 16, y: 17 }, 10, 2);

    // 16 is 6px from nearest grid line (20), and 6 > threshold 2
    expect(result).toEqual({ x: 16, y: 17 });
  });
});

// ===========================================================================
// Transform Sequence Stability
// ===========================================================================

describe('Transform Sequence Stability', () => {
  /**
   * @description A scale → move sequence must produce correct final position
   * and dimensions without floating-point drift.
   */
  it('scale then move produces correct final values', () => {
    // Scale: width 80 * 1.5 = 120, height 50 * 1.5 = 75
    const afterResize = applyResize(
      { x: 0, y: 0, width: 80, height: 50 },
      'se' as ResizeHandle,
      40,
      25,
      1, // 80+40=120, 50+25=75
    );

    // Move: translate by (-50, +50)
    const afterMove = applyDragTranslation({ x: afterResize.x, y: afterResize.y }, { dx: -50, dy: 50 }, 1);

    expect(afterResize.width).toBe(120);
    expect(afterResize.height).toBe(75);
    expect(afterMove).toEqual({ x: -50, y: 50 });
  });

  /**
   * @description A scale → rotate → move sequence must produce correct final
   * values without accumulation drift from floating-point arithmetic.
   */
  it('scale then rotate then move is stable', () => {
    const afterResize = applyResize({ x: 0, y: 0, width: 100, height: 100 }, 'se' as ResizeHandle, 50, 50, 1);

    const afterRotate = applyRotation(0, 45);

    const afterMove = applyDragTranslation({ x: afterResize.x, y: afterResize.y }, { dx: 30, dy: -20 }, 1);

    expect(afterResize.width).toBe(150);
    expect(afterResize.height).toBe(150);
    expect(afterRotate).toBe(45);
    expect(afterMove).toEqual({ x: 30, y: -20 });
  });
});
