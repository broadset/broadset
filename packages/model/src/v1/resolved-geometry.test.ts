import { describe, expect, it } from 'vitest';

import type { ElementGeometry, ElementTransform } from './element';
import { composeElementTransformsV1, resolveWorldGeometryV1 } from './resolved-geometry';

describe('resolved scene geometry', () => {
  it('composes nested affine transforms without decomposition', () => {
    const parent: ElementTransform = { kind: 'affine2d', matrix: [2, 0, 0, 2, 10, 20] };
    const local: ElementTransform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 3, 4] };

    expect(composeElementTransformsV1(parent, local)).toEqual({
      kind: 'affine2d',
      matrix: [2, 0, 0, 2, 16, 28],
    });
  });

  it('promotes affine children under matrix3d ancestry and preserves exact coefficients', () => {
    const parent: ElementTransform = {
      kind: 'matrix3d',
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1],
    };
    const local: ElementTransform = { kind: 'affine2d', matrix: [2, 0, 0, 3, 4, 5] };

    expect(composeElementTransformsV1(parent, local)).toEqual({
      kind: 'matrix3d',
      matrix: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 14, 25, 30, 1],
    });
  });

  it('composes reflected and skewed affine coefficients exactly', () => {
    const parent: ElementTransform = { kind: 'affine2d', matrix: [-1, 0.5, 0.25, 1, 2, 3] };
    const local: ElementTransform = { kind: 'affine2d', matrix: [1, 2, 3, 4, 5, 6] };

    expect(composeElementTransformsV1(parent, local)).toEqual({
      kind: 'affine2d',
      matrix: [-0.5, 2.5, -2, 5.5, -1.5, 11.5],
    });
  });

  it('keeps local bounds and origin while replacing only the world transform', () => {
    const geometry: ElementGeometry = {
      bounds: { width: 40, height: 20 },
      origin: [4, 5, 0],
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 3, 4] },
    };

    expect(resolveWorldGeometryV1(geometry, { kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] })).toEqual({
      bounds: { width: 40, height: 20 },
      origin: [4, 5, 0],
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 13, 24] },
    });
  });
});
