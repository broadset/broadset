import type { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { geometryToBoxStyle, transformToCss } from './transform-css';

const IDENTITY_3D: projectFormatV1.ElementTransform = {
  kind: 'matrix3d',
  matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};

describe('transformToCss', () => {
  it('maps a six-value affine2d matrix to CSS matrix()', () => {
    expect(transformToCss({ kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] })).toBe('matrix(1, 0, 0, 1, 10, 20)');
    expect(transformToCss({ kind: 'affine2d', matrix: [0.5, 0.25, -0.25, 0.5, 0, 0] })).toBe('matrix(0.5, 0.25, -0.25, 0.5, 0, 0)');
  });

  it('maps a sixteen-value matrix3d to CSS matrix3d()', () => {
    expect(transformToCss(IDENTITY_3D)).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });
});

describe('geometryToBoxStyle', () => {
  it('emits width/height/transform/transform-origin', () => {
    const style = geometryToBoxStyle({
      bounds: { width: 120, height: 48 },
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      origin: [10, 20, 0],
    });

    expect(style).toEqual({
      width: '120px',
      height: '48px',
      transform: 'matrix(1, 0, 0, 1, 0, 0)',
      transformOrigin: '10px 20px 0px',
    });
  });
});
