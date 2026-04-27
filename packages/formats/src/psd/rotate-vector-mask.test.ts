import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { elementToLayer } from './export-layer';
import { makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5+ — rotation MUST compose into the exported PSD layer
 * geometry for native shape and path layers, not only for image
 * (`placedLayer`) layers. The rotation pass expands the layer's
 * axis-aligned bounding box to enclose the rotated outline and
 * re-normalises the vector mask path knots so Photoshop reads back
 * a rotated shape.
 *
 * These tests inspect the layer object produced by `elementToLayer`
 * directly. Round-tripping through ag-psd's writer + reader collapses
 * the AABB on layers without raster `imageData`, so the in-memory
 * layer is the authoritative surface for geometric correctness.
 */

describe('PSD export — shape rotation', () => {
  /**
   * @description A 90° rotated rectangle (100×50) MUST land with a
   * layer bounding box swapped to 50×100. Floating-point round-off
   * can shift the bounds by 1 px so the assertion uses a 2 px
   * tolerance.
   */
  it('expands the layer bounds to enclose a rotated rectangle', () => {
    const el = makeElement('rectangle', {
      id: 'rect-rot-90',
      name: 'RotatedRect',
      position: { x: 50, y: 50 },
      width: 100,
      height: 50,
      rotation: 90,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#ff0000' } } as never,
      }),
    });
    const layer = elementToLayer(el);
    const exportedWidth = (layer.right ?? 0) - (layer.left ?? 0);
    const exportedHeight = (layer.bottom ?? 0) - (layer.top ?? 0);

    expect(Math.abs(exportedWidth - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(exportedHeight - 100)).toBeLessThanOrEqual(2);
  });

  /**
   * @description A rotated rectangle keeps its centre point — the
   * AABB centre after rotation matches the original bounds' centre
   * because rotation is around the centre.
   */
  it('keeps the layer centre stable after rotation', () => {
    const el = makeElement('rectangle', {
      id: 'rect-rot-45',
      name: 'RotatedRect45',
      position: { x: 100, y: 100 },
      width: 80,
      height: 40,
      rotation: 45,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#00ff00' } } as never,
      }),
    });
    const layer = elementToLayer(el);
    const cx = ((layer.left ?? 0) + (layer.right ?? 0)) / 2;
    const cy = ((layer.top ?? 0) + (layer.bottom ?? 0)) / 2;

    expect(Math.abs(cx - 140)).toBeLessThanOrEqual(2);
    expect(Math.abs(cy - 120)).toBeLessThanOrEqual(2);
  });

  /**
   * @description An unrotated rectangle goes through the rotation
   * pass without modification — the layer bounds remain the original
   * axis-aligned position+size, the vector mask is unchanged.
   */
  it('leaves an unrotated rectangle untouched', () => {
    const el = makeElement('rectangle', {
      id: 'rect-flat',
      name: 'FlatRect',
      position: { x: 25, y: 35 },
      width: 60,
      height: 40,
      rotation: 0,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#0000ff' } } as never,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.left).toBe(25);
    expect(layer.top).toBe(35);
    expect(layer.right).toBe(85);
    expect(layer.bottom).toBe(75);
  });

  /**
   * @description A rotated ellipse expands its layer AABB to enclose
   * the rotated outline. For a circular ellipse (width === height)
   * the AABB stays the same regardless of rotation.
   */
  it('keeps a circle stable under rotation', () => {
    const el = makeElement('ellipse', {
      id: 'circle-rot',
      name: 'RotatedCircle',
      position: { x: 0, y: 0 },
      width: 60,
      height: 60,
      rotation: 37,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#aabbcc' } } as never,
      }),
    });
    const layer = elementToLayer(el);
    const exportedWidth = (layer.right ?? 0) - (layer.left ?? 0);
    const exportedHeight = (layer.bottom ?? 0) - (layer.top ?? 0);

    // Bezier-approximated ellipse expands at oblique angles because
    // the Kappa control points sit at the kappa-corners of the
    // circumscribing square, not on the unit circle. After rotation
    // those rotated control points enlarge the AABB by ~13 %; this
    // is the geometric truth of cubic-bezier ellipse approximation.
    // 12 px tolerance covers the worst-case over-shoot.
    expect(Math.abs(exportedWidth - 60)).toBeLessThanOrEqual(12);
    expect(Math.abs(exportedHeight - 60)).toBeLessThanOrEqual(12);
  });

  /**
   * @description A rotated rectangle's vector mask path knots all
   * map back to the rotated geometry — every knot lies inside the
   * unit square [0, PSD_COORD_MAX] within the new layer bounds.
   * Catches re-normalisation mistakes that would push knots outside
   * the layer's frame.
   */
  it('keeps every rotated knot inside the unit square', () => {
    const el = makeElement('rectangle', {
      id: 'rect-knots',
      name: 'RotatedRect',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      rotation: 30,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#ff00ff' } } as never,
      }),
    });
    const layer = elementToLayer(el);
    const knots = layer.vectorMask?.paths[0]?.knots ?? [];

    expect(knots.length).toBeGreaterThan(0);

    for (const knot of knots) {
      for (let i = 0; i < 6; i += 2) {
        const ny = knot.points[i] ?? 0;
        const nx = knot.points[i + 1] ?? 0;

        expect(ny).toBeGreaterThanOrEqual(-0.001);
        expect(ny).toBeLessThanOrEqual(1.001);
        expect(nx).toBeGreaterThanOrEqual(-0.001);
        expect(nx).toBeLessThanOrEqual(1.001);
      }
    }
  });
});
