import type { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import type { PhysicalUnitContextV1 } from './physical-units';
import { geometryToBoxStyle, transformToCss } from './transform-css';

const IDENTITY_3D: projectFormatV1.ElementTransform = {
  kind: 'matrix3d',
  matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const MILLIMETRES: PhysicalUnitContextV1 = { unit: 'mm', dpi: 254 };

describe('transformToCss', () => {
  it('maps a six-value affine2d matrix to CSS matrix()', () => {
    expect(transformToCss({ kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] })).toBe('matrix(1, 0, 0, 1, 10, 20)');
    expect(transformToCss({ kind: 'affine2d', matrix: [0.5, 0.25, -0.25, 0.5, 0, 0] })).toBe(
      'matrix(0.5, 0.25, -0.25, 0.5, 0, 0)',
    );
  });

  it('maps a sixteen-value matrix3d to CSS matrix3d()', () => {
    expect(transformToCss(IDENTITY_3D)).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });

  it('converts only affine and matrix3d translation slots to CSS pixels', () => {
    expect(transformToCss({ kind: 'affine2d', matrix: [2, 3, 4, 5, 25.4, 50.8] }, MILLIMETRES)).toBe(
      'matrix(2, 3, 4, 5, 254, 508)',
    );
    expect(
      transformToCss(
        { kind: 'matrix3d', matrix: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 25.4, 50.8, 76.2, 1] },
        MILLIMETRES,
      ),
    ).toBe('matrix3d(2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 254, 508, 762, 1)');
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

  it('converts bounds and all transform-origin coordinates from the surface unit', () => {
    const style = geometryToBoxStyle(
      {
        bounds: { width: 25.4, height: 50.8 },
        transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 25.4, 50.8] },
        origin: [2.54, 5.08, 7.62],
      },
      MILLIMETRES,
    );

    expect(style).toEqual({
      width: '254px',
      height: '508px',
      transform: 'matrix(1, 0, 0, 1, 254, 508)',
      transformOrigin: '25.4px 50.8px 76.2px',
    });
  });
});
