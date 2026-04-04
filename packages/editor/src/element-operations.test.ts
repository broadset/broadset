import { describe, expect, it } from '@jest/globals';

import {
  alignElements,
  collectDescendants,
  distributeElements,
  getResizeHandlePositions,
  registerShortcut,
  resolveSnap,
  updateDocumentElement,
} from './element-operations';

// ===========================================================================
// Alignment and Distribution
// ===========================================================================

describe('alignElements', () => {
  /**
   * @description Aligning multiple elements to shared anchors (left, right,
   * center, top, bottom) must produce correct positions.
   */
  it('aligns elements to shared anchor positions', () => {
    const elements = [
      { id: 'a', x: 10, y: 10, width: 50, height: 50 },
      { id: 'b', x: 100, y: 200, width: 50, height: 50 },
    ];

    const leftAligned = alignElements(elements, 'left');

    expect(leftAligned[0]?.x).toBe(leftAligned[1]?.x);

    const rightAligned = alignElements(elements, 'right');
    const rightA = (rightAligned[0]?.x ?? 0) + (rightAligned[0]?.width ?? 0);
    const rightB = (rightAligned[1]?.x ?? 0) + (rightAligned[1]?.width ?? 0);

    expect(rightA).toBe(rightB);
  });
});

describe('distributeElements', () => {
  /**
   * @description Distributing elements horizontally or vertically must
   * produce deterministic equal gaps between elements.
   */
  it('distributes elements with deterministic spacing', () => {
    const elements = [
      { id: 'a', x: 0, y: 0, width: 20, height: 20 },
      { id: 'b', x: 100, y: 0, width: 20, height: 20 },
      { id: 'c', x: 50, y: 0, width: 20, height: 20 },
    ];

    const distributed = distributeElements(elements, 'horizontal');

    // Sort by x to check equal spacing
    const sorted = [...distributed].sort((a, b) => a.x - b.x);
    const s0 = sorted[0] ?? { x: 0, width: 0 };
    const s1 = sorted[1] ?? { x: 0, width: 0 };
    const s2 = sorted[2] ?? { x: 0, width: 0 };
    const gap1 = s1.x - (s0.x + s0.width);
    const gap2 = s2.x - (s1.x + s1.width);

    expect(gap1).toBeCloseTo(gap2, 1);
  });
});

// ===========================================================================
// Resize-Handle Geometry
// ===========================================================================

describe('getResizeHandlePositions', () => {
  /**
   * @description Edge and corner handles must appear at deterministic
   * geometric positions around the element bounding box.
   */
  it('positions edge and corner handles deterministically', () => {
    const handles = getResizeHandlePositions({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });

    // Should have 8 handles (4 corners + 4 edges)
    expect(handles).toHaveLength(8);

    // Top-left corner should be at element origin
    const topLeft = handles.find((h) => h.position === 'top-left');

    expect(topLeft?.x).toBe(10);
    expect(topLeft?.y).toBe(20);

    // Bottom-right should be at x+width, y+height
    const bottomRight = handles.find((h) => h.position === 'bottom-right');

    expect(bottomRight?.x).toBe(110);
    expect(bottomRight?.y).toBe(70);
  });
});

// ===========================================================================
// Shortcut Dispatch Semantics
// ===========================================================================

describe('registerShortcut', () => {
  /**
   * @description Duplicate shortcut bindings must resolve deterministically
   * with the last-registered handler taking precedence.
   */
  it('resolves duplicate bindings deterministically', () => {
    const registry = new Map<string, () => string>();

    registerShortcut(registry, 'Ctrl+Z', () => 'first');
    registerShortcut(registry, 'Ctrl+Z', () => 'second');

    const handler = registry.get('Ctrl+Z');
    const result = handler?.();

    expect(result).toBe('second');
  });
});

// ===========================================================================
// Smart-Guide Snapping
// ===========================================================================

describe('resolveSnap', () => {
  /**
   * @description Multiple candidate guides within snapping threshold
   * must resolve to the closest guide by precedence.
   */
  it('snaps to closest guide by threshold and precedence', () => {
    const candidates = [
      { position: 100, distance: 5 },
      { position: 102, distance: 3 },
      { position: 200, distance: 50 },
    ];

    const snap = resolveSnap(candidates, 10);

    // Should snap to the closest candidate within threshold
    expect(snap?.position).toBe(102);
  });
});

// ===========================================================================
// Immutable Document Element Update
// ===========================================================================

describe('updateDocumentElement', () => {
  /**
   * @description Updating an existing element must produce a new page array
   * with only the targeted element changed.
   */
  it('updates existing element immutably', () => {
    const pages = [
      {
        id: 'p1',
        elements: [
          { id: 'e1', name: 'Box', x: 0 },
          { id: 'e2', name: 'Circle', x: 10 },
        ],
      },
    ];

    const updated = updateDocumentElement(pages, 0, 'e1', { x: 50 });

    expect(updated[0]?.elements[0]?.['x']).toBe(50);
    expect(updated[0]?.elements[1]?.['x']).toBe(10); // unchanged

    // Immutability: original not modified
    expect(pages[0]?.elements[0]?.['x']).toBe(0);
  });

  /**
   * @description Updating a non-existent element must return pages unchanged.
   */
  it('returns pages unchanged for non-existent element', () => {
    const pages = [
      {
        id: 'p1',
        elements: [{ id: 'e1', name: 'Box', x: 0 }],
      },
    ];

    const result = updateDocumentElement(pages, 0, 'e99', { x: 50 });

    expect(result).toBe(pages);
  });
});

// ===========================================================================
// Descendant Collection
// ===========================================================================

describe('collectDescendants', () => {
  /**
   * @description A parent element with nested children must recursively
   * collect all descendant IDs following parentId links.
   */
  it('recursively collects all descendants', () => {
    const elements = [
      { id: 'g1', parentId: null },
      { id: 'c1', parentId: 'g1' },
      { id: 'c2', parentId: 'g1' },
      { id: 'c1a', parentId: 'c1' },
    ];

    const descendants = collectDescendants('g1', elements);

    expect(descendants).toContain('c1');
    expect(descendants).toContain('c2');
    expect(descendants).toContain('c1a');
    expect(descendants).not.toContain('g1');
  });

  /**
   * @description A leaf element with no children must return an empty set.
   */
  it('returns empty set for leaf element', () => {
    const elements = [
      { id: 'g1', parentId: null },
      { id: 'leaf', parentId: 'g1' },
    ];

    const descendants = collectDescendants('leaf', elements);

    expect(descendants).toHaveLength(0);
  });
});
