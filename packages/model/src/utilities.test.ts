import { describe, expect, it } from '@jest/globals';

import {
  computeEdgeAnchors,
  deepClone,
  generateDefaultClipPath,
  parseClipPathData,
  scalePathData,
  serializeClipPath,
} from './utilities';
import { createEmptyBroadsetDocument } from './document';

/** @description Deep clone produces a value-equal but referentially independent copy */
describe('Document clone fidelity', () => {
  /** @description Clone preserves all data by value */
  it('clone preserves all document data', () => {
    const original = createEmptyBroadsetDocument();
    const cloned = deepClone(original);

    expect(cloned).toEqual(original);
  });

  /** @description Cloned arrays and objects are new references */
  it('clone is structurally independent', () => {
    const original = createEmptyBroadsetDocument();
    const cloned = deepClone(original);

    expect(cloned).not.toBe(original);
    expect(cloned.pages).not.toBe(original.pages);
    expect(cloned.canvas).not.toBe(original.canvas);
    expect(cloned.animationRegistry).not.toBe(original.animationRegistry);
  });
});

/** @description Clip-path parsing handles quoted, unquoted, and non-path forms */
describe('Clip-path path value normalization', () => {
  /** @description path("...") with double quotes returns raw data */
  it('parses path with double quotes', () => {
    const result = parseClipPathData('path("M 0 0 L 100 0 L 100 100 Z")');

    expect(result).toBe('M 0 0 L 100 0 L 100 100 Z');
  });

  /** @description path('...') with single quotes returns raw data */
  it('parses path with single quotes', () => {
    const result = parseClipPathData("path('M 0 0 L 50 50')");

    expect(result).toBe('M 0 0 L 50 50');
  });

  /** @description path(...) without quotes returns raw data */
  it('parses path without quotes', () => {
    const result = parseClipPathData('path(M 0 0 L 100 0)');

    expect(result).toBe('M 0 0 L 100 0');
  });

  /** @description Non-path clip value returns null */
  it('returns null for non-path clip value', () => {
    const result = parseClipPathData('circle(50%)');

    expect(result).toBeNull();
  });

  /** @description Empty string returns null */
  it('returns null for empty string', () => {
    const result = parseClipPathData('');

    expect(result).toBeNull();
  });
});

/** @description Path serialization wraps data in path("...") */
describe('Clip-path serialization', () => {
  /** @description Serialized output is valid path(...) */
  it('serializes raw path data', () => {
    const result = serializeClipPath('M 0 0 L 100 0 L 100 100 Z');

    expect(result).toBe('path("M 0 0 L 100 0 L 100 100 Z")');
  });
});

/** @description Path scaling multiplies coordinates by a zoom factor */
describe('Path zoom scaling', () => {
  /** @description Scaling by 2 doubles all coordinates */
  it('scales path coordinates by zoom factor', () => {
    const result = scalePathData('M 0 0 L 100 50', 2);

    expect(result).toBe('M 0 0 L 200 100');
  });

  /** @description Scaling by 1 leaves coordinates unchanged */
  it('scale factor 1 preserves coordinates', () => {
    const result = scalePathData('M 10 20 L 30 40', 1);

    expect(result).toBe('M 10 20 L 30 40');
  });

  /** @description Fractional results are rounded to 2 decimal places */
  it('rounds fractional coordinates to 2 decimals', () => {
    const result = scalePathData('M 10 10', 0.333);

    expect(result).toMatch(/^M 3\.33 3\.33$/);
  });
});

/** @description Default clip path generates rectangle with non-zero dimensions */
describe('Default clip path generation', () => {
  /** @description Positive dimensions produce a rectangle path */
  it('generates rectangle path for positive dimensions', () => {
    const result = generateDefaultClipPath(100, 50);

    expect(result).toContain('M');
    expect(result).toContain('Z');
  });

  /** @description Zero dimensions use minimum non-zero substitutes */
  it('generates non-degenerate path for zero dimensions', () => {
    const result = generateDefaultClipPath(0, 0);

    expect(result).toContain('M');
    expect(result).toContain('Z');
    // Must not contain "0 0 L 0 0" type degeneracy
    expect(result).not.toMatch(/M 0 0 L 0 0/);
  });
});

/** @description Edge anchor inference from element and canvas geometry */
describe('Edge anchor inference', () => {
  /** @description Top-left quadrant → left, top */
  it('computes left/top for top-left quadrant element', () => {
    const result = computeEdgeAnchors({ x: 0, y: 0, width: 50, height: 50 }, { canvasWidth: 200, canvasHeight: 200 });

    expect(result.anchorX).toBe('left');
    expect(result.anchorY).toBe('top');
  });

  /** @description Bottom-right quadrant → right, bottom */
  it('computes right/bottom for bottom-right quadrant element', () => {
    const result = computeEdgeAnchors(
      { x: 150, y: 150, width: 50, height: 50 },
      { canvasWidth: 200, canvasHeight: 200 },
    );

    expect(result.anchorX).toBe('right');
    expect(result.anchorY).toBe('bottom');
  });

  /** @description Centered element → right, bottom (tie-breaker) */
  it('returns right/bottom when element is centered on canvas', () => {
    const result = computeEdgeAnchors({ x: 75, y: 75, width: 50, height: 50 }, { canvasWidth: 200, canvasHeight: 200 });

    expect(result.anchorX).toBe('right');
    expect(result.anchorY).toBe('bottom');
  });
});
