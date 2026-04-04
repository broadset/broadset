import { describe, expect, it } from '@jest/globals';

import type { PathSegment } from './path-geometry';
import { extractHandles, parsePath, refitPathBounds, refitPathBoundsSvg, serializePath } from './path-geometry';

// ===========================================================================
// Path Command Parsing
// ===========================================================================

describe('parsePath', () => {
  /**
   * @description Supported SVG command families (M, L, C, Q, S, T, A, H, V, Z)
   * must parse into deterministic segment sequences preserving command intent.
   */
  it('parses supported command families into expected segments', () => {
    const segments = parsePath('M 10 20 L 30 40 C 1 2 3 4 5 6 Q 7 8 9 10 H 50 V 60 Z');

    expect(segments.length).toBeGreaterThan(0);

    const commands = segments.map((s) => s.command);

    expect(commands).toContain('M');
    expect(commands).toContain('L');
    expect(commands).toContain('C');
    expect(commands).toContain('Q');
    expect(commands).toContain('H');
    expect(commands).toContain('V');
    expect(commands).toContain('Z');
  });

  /**
   * @description Implicit repeated coordinate groups must be normalized
   * into explicit separate segments.
   */
  it('normalizes implicit repeated coordinates into explicit segments', () => {
    // "L 10 20 30 40" is equivalent to "L 10 20 L 30 40"
    const segments = parsePath('M 0 0 L 10 20 30 40');
    const lineSegments = segments.filter((s) => s.command === 'L');

    expect(lineSegments).toHaveLength(2);
    expect(lineSegments[0]?.values).toEqual([10, 20]);
    expect(lineSegments[1]?.values).toEqual([30, 40]);
  });

  /**
   * @description An empty path string must yield an empty segment list.
   */
  it('returns empty list for empty path input', () => {
    expect(parsePath('')).toEqual([]);
  });
});

// ===========================================================================
// Path Serialization Stability
// ===========================================================================

describe('serializePath', () => {
  /**
   * @description A valid path string parsed and then serialized must
   * preserve the expected path structure (round-trip stability).
   */
  it('round-trips a valid path string', () => {
    const original = 'M 10 20 L 30 40 Z';
    const segments = parsePath(original);
    const serialized = serializePath(segments);

    // Re-parse to verify structural equivalence
    const reparsed = parsePath(serialized);

    expect(reparsed).toEqual(segments);
  });

  /**
   * @description Coordinates with high precision must be rounded
   * consistently to editor precision.
   */
  it('rounds coordinates consistently to editor precision', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [10.123456, 20.789012] },
      { command: 'L', values: [30.999999, 40.000001] },
    ];
    const serialized = serializePath(segments);

    // Should not contain excessive decimal places
    expect(serialized).not.toMatch(/\d+\.\d{5,}/);
  });
});

// ===========================================================================
// Editable Handle Extraction
// ===========================================================================

describe('extractHandles', () => {
  /**
   * @description A cubic Bézier (C) segment must extract two control handles
   * and one anchor handle with correct positions.
   */
  it('extracts three handles from cubic Bézier', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [0, 0] },
      { command: 'C', values: [10, 20, 30, 40, 50, 60] },
    ];
    const handles = extractHandles(segments);
    const cubicHandles = handles.filter((h) => h.segmentIndex === 1);

    const controlHandles = cubicHandles.filter((h) => h.type === 'control');
    const anchorHandles = cubicHandles.filter((h) => h.type === 'anchor');

    expect(controlHandles).toHaveLength(2);
    expect(anchorHandles).toHaveLength(1);
  });

  /**
   * @description A horizontal (H) command must extract one anchor handle
   * with Y index = -1 (constrained axis).
   */
  it('constrains Y axis for horizontal command', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [0, 0] },
      { command: 'H', values: [100] },
    ];
    const handles = extractHandles(segments);
    const hHandle = handles.find((h) => h.segmentIndex === 1);

    expect(hHandle).toBeDefined();
    expect(hHandle?.type).toBe('anchor');
    expect(hHandle?.yIndex).toBe(-1);
  });

  /**
   * @description A vertical (V) command must extract one anchor handle
   * with X index = -1 (constrained axis).
   */
  it('constrains X axis for vertical command', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [0, 0] },
      { command: 'V', values: [100] },
    ];
    const handles = extractHandles(segments);
    const vHandle = handles.find((h) => h.segmentIndex === 1);

    expect(vHandle).toBeDefined();
    expect(vHandle?.type).toBe('anchor');
    expect(vHandle?.xIndex).toBe(-1);
  });

  /**
   * @description Line (L) and Move (M) commands must extract one anchor
   * handle with both X and Y indices set.
   */
  it('extracts one anchor with both axes from line and move', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [10, 20] },
      { command: 'L', values: [30, 40] },
    ];
    const handles = extractHandles(segments);

    for (const h of handles) {
      expect(h.type).toBe('anchor');
      expect(h.xIndex).toBeGreaterThanOrEqual(0);
      expect(h.yIndex).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * @description Close (Z) commands must not emit any handles since
   * they have no editable coordinates.
   */
  it('emits no handles for close command', () => {
    const segments: PathSegment[] = [
      { command: 'M', values: [0, 0] },
      { command: 'L', values: [10, 10] },
      { command: 'Z', values: [] },
    ];
    const handles = extractHandles(segments);
    const zHandles = handles.filter((h) => h.segmentIndex === 2);

    expect(zHandles).toHaveLength(0);
  });
});

// ===========================================================================
// Path Bounds Refit
// ===========================================================================

describe('refitPathBounds', () => {
  /**
   * @description Edited path coordinates must produce position, width,
   * and height that include stroke padding.
   */
  it('computes padded bounds for edited path', () => {
    const result = refitPathBounds({
      pathData: 'M 10 20 L 110 120',
      strokeWidth: 4,
      currentX: 0,
      currentY: 0,
    });

    // Bounds should be at least 100x100 (110-10, 120-20) plus stroke padding
    expect(result.width).toBeGreaterThanOrEqual(100);
    expect(result.height).toBeGreaterThanOrEqual(100);
    expect(result.width).toBeGreaterThan(100); // padding added
  });

  /**
   * @description When minimum bounds shift, path coordinates must be
   * rebased relative to the new origin.
   */
  it('rebases coordinates to updated origin', () => {
    const result = refitPathBounds({
      pathData: 'M 50 50 L 150 150',
      strokeWidth: 0,
      currentX: 0,
      currentY: 0,
    });

    // The origin should shift to the min coords (50, 50)
    // and the rebased path should start near 0,0
    const reparsed = parsePath(result.pathData);
    const firstSegment = reparsed[0];

    expect(firstSegment?.values[0]).toBeLessThanOrEqual(2); // near 0
    expect(firstSegment?.values[1]).toBeLessThanOrEqual(2); // near 0
  });

  /**
   * @description An empty path payload must not mutate geometry.
   */
  it('handles empty path without geometry changes', () => {
    const result = refitPathBounds({
      pathData: '',
      strokeWidth: 2,
      currentX: 10,
      currentY: 20,
    });

    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });
});

// ===========================================================================
// Tight SVG Bounding-Box Refit
// ===========================================================================

describe('refitPathBoundsSvg', () => {
  /**
   * @description A provided tight bounding box for a curve path must
   * produce geometry reflecting the tight bounds.
   */
  it('uses SVG bounding box for tight geometry', () => {
    const result = refitPathBoundsSvg({
      pathData: 'M 0 0 C 50 -20 100 20 150 0',
      svgBBox: { x: 0, y: -10, width: 150, height: 20 },
      currentX: 0,
      currentY: 0,
    });

    expect(result.width).toBeCloseTo(150, 0);
    expect(result.height).toBeCloseTo(20, 0);
  });

  /**
   * @description SVG-based refit with a shifted bounding box must
   * rebase path coordinates to the new element origin.
   */
  it('rebases coordinates for shifted SVG bounding box', () => {
    const result = refitPathBoundsSvg({
      pathData: 'M 50 50 L 150 150',
      svgBBox: { x: 50, y: 50, width: 100, height: 100 },
      currentX: 0,
      currentY: 0,
    });

    expect(result.x).toBeCloseTo(50, 0);
    expect(result.y).toBeCloseTo(50, 0);

    const reparsed = parsePath(result.pathData);
    const firstSegment = reparsed[0];

    expect(firstSegment?.values[0]).toBeLessThanOrEqual(2);
    expect(firstSegment?.values[1]).toBeLessThanOrEqual(2);
  });
});
