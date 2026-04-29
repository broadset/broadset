import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { elementToLayer } from './export-layer';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5 unit P5.3a — rectangle / ellipse / path elements emit PSD
 * vector shape metadata (`vectorFill` + `vectorStroke` + `vectorMask`)
 * plus a layer pixel body. ag-psd writes zero-width / zero-height
 * Photoshop layers when `imageData` is absent, so the pixel body is
 * part of the Photoshop-openability contract.
 */

describe('PSD export — native shape layers', () => {
  /**
   * @description A solid-fill rectangle emits `vectorFill` with the
   * fill color. The layer also carries imageData so ag-psd writes a
   * non-zero Photoshop layer rectangle.
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
    expect(layer.imageData?.width).toBe(100);
    expect(layer.imageData?.height).toBe(50);

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
   * @description Rectangle / ellipse shape layers MUST carry imageData
   * because ag-psd derives written PSD layer bounds from imageData / canvas.
   */
  it('emits imageData so Photoshop receives non-zero layer bounds', () => {
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

    expect(layer.imageData?.width).toBe(40);
    expect(layer.imageData?.height).toBe(40);
  });

  /**
   * @description Shape layer bounds survive the full ag-psd writer/reader path.
   * This guards the Photoshop regression where rectangles opened at 0,0 with 0x0 size.
   */
  it('round-trips a filled rectangle with non-zero PSD bounds', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      name: 'Bounds Rect',
      position: { x: 25, y: 15 },
      width: 40,
      height: 30,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#123456' } } as never,
      }),
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
    const layer = psd.children?.[0];

    expect(layer?.left).toBe(25);
    expect(layer?.top).toBe(15);
    expect(layer?.right).toBe(65);
    expect(layer?.bottom).toBe(45);
  });
});
