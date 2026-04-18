import { extractHandles, parsePath, refitPathBounds, refitPathBoundsFromSvg, serializePath } from './path-geometry';

/* ================================================================== */
/*  Path Command Parsing                                               */
/* ================================================================== */

describe('parsePath', () => {
  /**
   * @description Supported SVG path commands (M, L, H, V, C, S, Q, A, Z) MUST
   * parse into deterministic segment sequences preserving command intent and
   * coordinate ordering.
   */
  it('parses supported command families into expected segments', () => {
    const segments = parsePath(
      'M 10 20 L 30 40 H 50 V 60 C 1 2 3 4 5 6 S 7 8 9 10 Q 11 12 13 14 A 25 25 0 0 1 50 25 Z',
    );

    expect(segments.length).toBeGreaterThan(0);

    // M command
    expect(segments[0]).toEqual({ command: 'M', coords: [10, 20] });
    // L command
    expect(segments[1]).toEqual({ command: 'L', coords: [30, 40] });
    // H command
    expect(segments[2]).toEqual({ command: 'H', coords: [50] });
    // V command
    expect(segments[3]).toEqual({ command: 'V', coords: [60] });
    // C command — 6 coords (x1, y1, x2, y2, x, y)
    expect(segments[4]).toEqual({ command: 'C', coords: [1, 2, 3, 4, 5, 6] });
    // S command — 4 coords (x2, y2, x, y)
    expect(segments[5]).toEqual({ command: 'S', coords: [7, 8, 9, 10] });
    // Q command — 4 coords (x1, y1, x, y)
    expect(segments[6]).toEqual({ command: 'Q', coords: [11, 12, 13, 14] });
    // A command — 7 params (rx, ry, angle, largeArc, sweep, x, y)
    expect(segments[7]).toEqual({ command: 'A', coords: [25, 25, 0, 0, 1, 50, 25] });
    // Z command — no coords
    expect(segments[8]).toEqual({ command: 'Z', coords: [] });
  });

  /**
   * @description Relative (lowercase) commands MUST be parsed alongside absolute
   * commands. The parser preserves the original command letter, except the
   * leading moveto, which SVG spec treats as absolute regardless of case.
   */
  it('parses relative commands (lowercase) preserving command letter', () => {
    const segments = parsePath('m 5 5 l 10 10 h 20 v 30 c 1 2 3 4 5 6 s 7 8 9 10 q 11 12 13 14 a 5 5 0 1 0 10 0 z');

    // Leading moveto is always absolute per SVG spec (https://www.w3.org/TR/SVG11/paths.html#PathDataMovetoCommands).
    expect(segments[0]).toEqual({ command: 'M', coords: [5, 5] });
    expect(segments[1]).toEqual({ command: 'l', coords: [10, 10] });
    expect(segments[2]).toEqual({ command: 'h', coords: [20] });
    expect(segments[3]).toEqual({ command: 'v', coords: [30] });
    expect(segments[4]).toEqual({ command: 'c', coords: [1, 2, 3, 4, 5, 6] });
    expect(segments[5]).toEqual({ command: 's', coords: [7, 8, 9, 10] });
    expect(segments[6]).toEqual({ command: 'q', coords: [11, 12, 13, 14] });
    expect(segments[7]).toEqual({ command: 'a', coords: [5, 5, 0, 1, 0, 10, 0] });
    expect(segments[8]).toEqual({ command: 'z', coords: [] });
  });

  /**
   * @description Implicit repeated coordinate groups MUST each be represented
   * as an explicit segment. E.g. "L 10 20 30 40" → two L segments.
   */
  it('normalizes implicit repeated coordinates to explicit segments', () => {
    const segments = parsePath('M 0 0 L 10 20 30 40 50 60');

    expect(segments).toEqual([
      { command: 'M', coords: [0, 0] },
      { command: 'L', coords: [10, 20] },
      { command: 'L', coords: [30, 40] },
      { command: 'L', coords: [50, 60] },
    ]);
  });

  /**
   * @description An empty path string MUST yield an empty segment list.
   */
  it('returns empty array for empty string', () => {
    expect(parsePath('')).toEqual([]);
  });

  /**
   * @description Whitespace-only path strings MUST also yield empty segments.
   */
  it('returns empty array for whitespace-only string', () => {
    expect(parsePath('   ')).toEqual([]);
  });
});

/* ================================================================== */
/*  Path Serialization Stability                                       */
/* ================================================================== */

describe('serializePath', () => {
  /**
   * @description A valid path string parsed and then serialized MUST produce
   * an output that preserves the expected path structure.
   */
  it('produces stable round-trip for basic paths', () => {
    const input = 'M 10 20 L 30 40 Z';
    const segments = parsePath(input);
    const output = serializePath(segments);

    // Round-trip: re-parse the serialized output
    const reparsed = parsePath(output);

    expect(reparsed).toEqual(segments);
  });

  /**
   * @description Coordinates with higher precision decimals MUST be rounded
   * consistently to editor precision (2 decimal places).
   */
  it('rounds coordinates consistently to editor precision', () => {
    const segments = [
      { command: 'M' as const, coords: [10.123456, 20.987654] },
      { command: 'L' as const, coords: [30.555555, 40.444444] },
    ];
    const output = serializePath(segments);

    // Should be rounded to 2dp
    expect(output).toContain('10.12');
    expect(output).toContain('20.99');
    expect(output).toContain('30.56');
    expect(output).toContain('40.44');
  });

  /**
   * @description Complex paths with all command types round-trip correctly.
   */
  it('round-trips complex paths with all command types', () => {
    const input = 'M 0 0 L 10 20 H 50 V 60 C 1 2 3 4 5 6 S 7 8 9 10 Q 11 12 13 14 A 25 25 0 0 1 50 25 Z';
    const segments = parsePath(input);
    const output = serializePath(segments);
    const reparsed = parsePath(output);

    expect(reparsed).toEqual(segments);
  });
});

/* ================================================================== */
/*  Editable Handle Extraction                                         */
/* ================================================================== */

describe('extractHandles', () => {
  /**
   * @description A cubic Bézier segment (C command) MUST produce two `control`
   * handles and one `anchor` handle with correct positions and coordinate indices.
   */
  it('extracts two control handles and one anchor from cubic Bézier', () => {
    const segments = parsePath('M 0 0 C 10 20 30 40 50 60');
    const handles = extractHandles(segments);

    // M produces 1 anchor, C produces 2 control + 1 anchor = 4 total
    expect(handles.length).toBe(4);

    // M anchor
    expect(handles[0]).toMatchObject({ type: 'anchor', x: 0, y: 0 });

    // C control handle 1 (cp1)
    expect(handles[1]).toMatchObject({ type: 'control', x: 10, y: 20 });
    // C control handle 2 (cp2)
    expect(handles[2]).toMatchObject({ type: 'control', x: 30, y: 40 });
    // C anchor (endpoint)
    expect(handles[3]).toMatchObject({ type: 'anchor', x: 50, y: 60 });
  });

  /**
   * @description A horizontal line segment (H) MUST produce one anchor handle
   * with Y index = -1 (constrained).
   */
  it('constrains Y axis for horizontal command', () => {
    const segments = parsePath('M 0 0 H 50');
    const handles = extractHandles(segments);

    // M anchor + H anchor = 2
    expect(handles.length).toBe(2);

    const hHandle = handles[1];

    expect(hHandle).toMatchObject({ type: 'anchor', x: 50 });
    expect(hHandle?.yIndex).toBe(-1);
  });

  /**
   * @description A vertical line segment (V) MUST produce one anchor handle
   * with X index = -1 (constrained).
   */
  it('constrains X axis for vertical command', () => {
    const segments = parsePath('M 0 0 V 60');
    const handles = extractHandles(segments);

    expect(handles.length).toBe(2);

    const vHandle = handles[1];

    expect(vHandle).toMatchObject({ type: 'anchor', y: 60 });
    expect(vHandle?.xIndex).toBe(-1);
  });

  /**
   * @description A line segment (L) MUST produce one anchor handle with both
   * X and Y indices.
   */
  it('extracts one anchor with both axes from line segment', () => {
    const segments = parsePath('M 0 0 L 30 40');
    const handles = extractHandles(segments);

    expect(handles.length).toBe(2);

    const lHandle = handles[1];

    expect(lHandle).toMatchObject({ type: 'anchor', x: 30, y: 40 });
    expect(lHandle?.xIndex).toBeGreaterThanOrEqual(0);
    expect(lHandle?.yIndex).toBeGreaterThanOrEqual(0);
  });

  /**
   * @description A close command (Z) MUST produce no handles.
   */
  it('emits no handles for close command', () => {
    const segments = parsePath('M 0 0 L 10 10 Z');
    const handles = extractHandles(segments);

    // M anchor + L anchor = 2. Z contributes none.
    expect(handles.length).toBe(2);
  });

  /**
   * @description Smooth cubic (S) MUST produce one control + one anchor handle.
   */
  it('extracts handles from smooth cubic (S)', () => {
    const segments = parsePath('M 0 0 C 10 20 30 40 50 60 S 70 80 90 100');
    const handles = extractHandles(segments);

    // M(1) + C(3) + S(2) = 6
    expect(handles.length).toBe(6);

    // S control
    expect(handles[4]).toMatchObject({ type: 'control', x: 70, y: 80 });
    // S anchor
    expect(handles[5]).toMatchObject({ type: 'anchor', x: 90, y: 100 });
  });

  /**
   * @description Quadratic (Q) MUST produce one control + one anchor handle.
   */
  it('extracts handles from quadratic (Q)', () => {
    const segments = parsePath('M 0 0 Q 25 50 50 0');
    const handles = extractHandles(segments);

    // M(1) + Q(2) = 3
    expect(handles.length).toBe(3);

    // Q control
    expect(handles[1]).toMatchObject({ type: 'control', x: 25, y: 50 });
    // Q anchor
    expect(handles[2]).toMatchObject({ type: 'anchor', x: 50, y: 0 });
  });

  /**
   * @description Arc (A) MUST produce one anchor handle for the endpoint.
   */
  it('extracts one anchor from arc (A)', () => {
    const segments = parsePath('M 0 0 A 25 25 0 0 1 50 25');
    const handles = extractHandles(segments);

    // M(1) + A(1) = 2
    expect(handles.length).toBe(2);

    expect(handles[1]).toMatchObject({ type: 'anchor', x: 50, y: 25 });
  });

  /**
   * @description Each handle MUST reference its parent segment index.
   */
  it('includes segment index reference on each handle', () => {
    const segments = parsePath('M 0 0 L 10 20');
    const handles = extractHandles(segments);

    expect(handles[0]?.segmentIndex).toBe(0);
    expect(handles[1]?.segmentIndex).toBe(1);
  });

  /**
   * @description Relative commands MUST be resolved to absolute coordinates
   * for handle positions so they reflect actual on-screen positions.
   */
  it('converts relative commands to absolute coordinates for handles', () => {
    // m 10 10 → abs M(10,10); l 20 30 → abs L(30,40)
    const segments = parsePath('m 10 10 l 20 30');
    const handles = extractHandles(segments);

    expect(handles.length).toBe(2);
    expect(handles[0]).toMatchObject({ type: 'anchor', x: 10, y: 10 });
    expect(handles[1]).toMatchObject({ type: 'anchor', x: 30, y: 40 });
  });
});

/* ================================================================== */
/*  Path Bounds Refit                                                  */
/* ================================================================== */

describe('refitPathBounds', () => {
  /**
   * @description Edited path coordinates MUST produce updated position,
   * width, and height that include stroke padding.
   */
  it('computes padded bounds for edited path', () => {
    const result = refitPathBounds({
      pathData: 'M 10 10 L 60 80',
      strokeWidth: 4,
      currentX: 0,
      currentY: 0,
      currentWidth: 100,
      currentHeight: 100,
    });

    // Bounds should be: min(10,60)-padding .. max(10,60)+padding
    // strokePadding = 4/2 = 2
    expect(result.x).toBe(10 - 2);
    expect(result.y).toBe(10 - 2);
    expect(result.width).toBe(60 - 10 + 4); // span + 2*padding
    expect(result.height).toBe(80 - 10 + 4);
  });

  /**
   * @description When minimum bounds shift, path coordinates MUST be rebased
   * relative to the new origin.
   */
  it('rebases coordinates to new origin when bounds shift', () => {
    const result = refitPathBounds({
      pathData: 'M 20 30 L 70 90',
      strokeWidth: 0,
      currentX: 0,
      currentY: 0,
      currentWidth: 100,
      currentHeight: 100,
    });

    // New origin is at (20, 30), so coordinates should be rebased
    expect(result.x).toBe(20);
    expect(result.y).toBe(30);

    // Rebased path should start at 0,0
    const rebased = parsePath(result.pathData);

    expect(rebased[0]).toEqual({ command: 'M', coords: [0, 0] });
    expect(rebased[1]).toEqual({ command: 'L', coords: [50, 60] }); // 70-20, 90-30
  });

  /**
   * @description Relative commands MUST be resolved to absolute coordinates
   * before bounds computation, so that bounds reflect the actual geometry.
   */
  it('correctly handles relative path commands for bounds computation', () => {
    // m 10 10 l 20 30 → absolute M(10,10) L(30,40)
    const result = refitPathBounds({
      pathData: 'm 10 10 l 20 30',
      strokeWidth: 0,
      currentX: 0,
      currentY: 0,
      currentWidth: 100,
      currentHeight: 100,
    });

    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
    expect(result.width).toBe(20);
    expect(result.height).toBe(30);
  });

  /**
   * @description Cubic Bézier bounds MUST reflect the true curve extrema, not
   * the axis-aligned box over control points. For M 0 0 C 50 100 100 100 150 0,
   * off-curve controls at y=100 extend above the curve, whose true max y is 75.
   */
  it('computes true Bézier curve bounds, not control-point bounds', () => {
    const result = refitPathBounds({
      pathData: 'M 0 0 C 50 100 100 100 150 0',
      strokeWidth: 0,
      currentX: 0,
      currentY: 0,
      currentWidth: 200,
      currentHeight: 200,
    });

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(150);
    expect(result.height).toBe(75);
  });

  /**
   * @description An empty path MUST update content without geometry changes.
   */
  it('does not mutate geometry for empty path', () => {
    const result = refitPathBounds({
      pathData: '',
      strokeWidth: 2,
      currentX: 10,
      currentY: 20,
      currentWidth: 100,
      currentHeight: 50,
    });

    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.pathData).toBe('');
  });
});

/* ================================================================== */
/*  Tight SVG Bounding-Box Refit                                       */
/* ================================================================== */

describe('refitPathBoundsFromSvg', () => {
  /**
   * @description A provided tight bounding box for a curve path MUST produce
   * geometry updates that reflect the tight bounds (not axis-aligned
   * Bézier extrema).
   */
  it('produces tight geometry from SVG bounding box', () => {
    const result = refitPathBoundsFromSvg({
      pathData: 'M 0 0 C 50 100 100 100 150 0',
      svgBBox: { x: 5, y: 0, width: 140, height: 75 },
      strokeWidth: 2,
    });

    // Tight bounds from SVG bbox with stroke padding
    const padding = 1; // strokeWidth/2

    expect(result.x).toBe(5 - padding);
    expect(result.y).toBe(0 - padding);
    expect(result.width).toBe(140 + 2 * padding);
    expect(result.height).toBe(75 + 2 * padding);
  });

  /**
   * @description When SVG bounding box shifts, coordinates MUST be rebased
   * to the new element origin.
   */
  it('rebases coordinates to new origin from shifted SVG box', () => {
    const result = refitPathBoundsFromSvg({
      pathData: 'M 10 20 L 60 80',
      svgBBox: { x: 10, y: 20, width: 50, height: 60 },
      strokeWidth: 0,
    });

    expect(result.x).toBe(10);
    expect(result.y).toBe(20);

    const rebased = parsePath(result.pathData);

    expect(rebased[0]).toEqual({ command: 'M', coords: [0, 0] });
    expect(rebased[1]).toEqual({ command: 'L', coords: [50, 60] });
  });
});
