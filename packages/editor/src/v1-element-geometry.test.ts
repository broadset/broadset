import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { getEditorElementRectV1, updateElementRectV1 } from './v1-element-geometry';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createVector(transform: projectFormatV1.ElementTransform): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id('element'),
    name: 'Element',
    kind: 'vector',
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 50, transform }),
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
}

describe('v1 editor element geometry', () => {
  it('projects affine bounds, translation, and rotation into editor rect fields', () => {
    const element = createVector({ kind: 'affine2d', matrix: [0, 2, -3, 0, 10, 20] });

    expect(getEditorElementRectV1(element)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 90,
    });
  });

  it('updates affine geometry while preserving scale and accepting a new rotation', () => {
    const element = createVector({ kind: 'affine2d', matrix: [2, 0, 0, 3, 10, 20] });
    const updated = updateElementRectV1(element, {
      x: 30,
      y: 40,
      width: 240,
      height: 120,
      rotation: 90,
    });

    expect(updated.geometry.bounds).toEqual({ width: 240, height: 120 });
    expect(updated.geometry.transform.kind).toBe('affine2d');

    if (updated.geometry.transform.kind !== 'affine2d') throw new Error('Expected an affine transform');

    const [a, b, c, d, e, f] = updated.geometry.transform.matrix;

    expect(a).toBeCloseTo(0);
    expect(b).toBeCloseTo(2);
    expect(c).toBeCloseTo(-3);
    expect(d).toBeCloseTo(0);
    expect(e).toBe(30);
    expect(f).toBe(40);
  });

  it('updates matrix3d translation without discarding its other components', () => {
    const matrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      5, 6, 7, 1,
    ] as const;
    const element = createVector({ kind: 'matrix3d', matrix });
    const updated = updateElementRectV1(element, { x: 15, y: 16 });

    expect(getEditorElementRectV1(updated)).toEqual({
      x: 15,
      y: 16,
      width: 100,
      height: 50,
      rotation: 0,
    });
    expect(updated.geometry.transform.kind === 'matrix3d' ? updated.geometry.transform.matrix[14] : undefined).toBe(7);
  });

  it('ignores non-finite coordinates and non-positive bounds', () => {
    const element = createVector({ kind: 'affine2d', matrix: [1, 0, 0, 1, 10, 20] });

    expect(updateElementRectV1(element, { x: Number.NaN, width: 0, height: -1 })).toBe(element);
  });
});
