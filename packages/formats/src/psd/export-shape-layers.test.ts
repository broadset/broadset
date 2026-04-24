import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { elementToLayer } from './export-layer';
import { makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5 unit P5.3a — rectangle / ellipse / path elements MUST emit
 * native PSD vector shape layers (`vectorFill` + `vectorStroke` +
 * `vectorMask`) instead of rasterized solid-pixel `imageData`. Native
 * shape layers stay editable in Photoshop's Properties panel; a
 * rasterized rectangle is a baked bitmap the user can't resize
 * without quality loss.
 */

describe('PSD export — native shape layers', () => {
  /**
   * @description A solid-fill rectangle emits `vectorFill` with the
   * fill color, not raster pixels. The existence of `vectorFill`
   * proves the layer is a native shape layer.
   */
  it('emits a native vector shape layer for a filled rectangle', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      width: 100,
      height: 50,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#ff0000' } } as never,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.vectorFill).toBeDefined();
    expect(layer.vectorFill?.type).toBe('color');

    if (layer.vectorFill?.type === 'color') {
      const color = layer.vectorFill.color as { readonly r: number; readonly g: number; readonly b: number };

      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(0);
    }
  });

  /**
   * @description Rectangle shape layers MUST carry a `vectorMask`
   * whose path defines the rectangle geometry — Photoshop reads the
   * geometry from this mask, not from `top`/`left`/`right`/`bottom`.
   */
  it('emits a vectorMask path for a rectangle', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      width: 100,
      height: 50,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#00ff00' } } as never,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.vectorMask).toBeDefined();
    expect(layer.vectorMask?.paths.length).toBeGreaterThan(0);
  });

  /**
   * @description An ellipse emits a vector shape layer — the
   * `vectorOrigination` hint tells Photoshop to show the ellipse tool
   * when the layer is selected.
   */
  it('emits a vector shape layer for an ellipse', () => {
    const el = makeElement('ellipse', {
      id: 'el',
      width: 60,
      height: 60,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#0000ff' } } as never,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.vectorFill).toBeDefined();
    expect(layer.vectorMask?.paths.length).toBeGreaterThan(0);
  });

  /**
   * @description Rectangle / ellipse shape layers MUST NOT leak
   * raster pixels via `imageData` — if `imageData` is populated the
   * output is a rasterized shape, not a native vector shape layer.
   */
  it('does not emit imageData for native shape layers', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      width: 40,
      height: 40,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#123456' } } as never,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.imageData).toBeUndefined();
  });
});
