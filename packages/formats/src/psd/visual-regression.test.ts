import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Visual regression test — mirrors `pdf/visual-regression.test.ts`.
 * ag-psd has no compositor, so instead of pixel-diffing a rendered
 * image, we assert per-layer pixel samples on the imageData buffer
 * the writer emits. The test catches the "structurally valid but
 * paints nothing" failure mode: a Broadset element whose intended
 * fill is missing from the exported layer's pixel buffer would slip
 * past the geometry-only validators but show up here.
 *
 * The exporter emits a placeholder grey solid for image elements
 * (the placedLayer transform carries the real bytes); for native
 * vector shape layers the writer emits imageData too because ag-psd
 * derives written Photoshop layer bounds from that pixel body.
 * The samples below validate the contract Broadset exports under,
 * not what Photoshop would render at composite time.
 */

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function sampleImageData(
  data: Uint8Array | Uint8ClampedArray | undefined,
  width: number,
  x: number,
  y: number,
): Rgba | undefined {
  if (data === undefined) return undefined;

  const offset = (y * width + x) * 4;

  if (offset + 3 >= data.length) return undefined;

  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0,
    a: data[offset + 3] ?? 0,
  };
}

describe('PSD visual regression — pixel sampling on exporter output', () => {
  /**
   * @description An image element exports with a placeholder grey
   * solid in `imageData`. The grey RGB (200, 200, 200) is the
   * exporter's contract for placed-layer placeholders — a regression
   * that changed it to (0, 0, 0) or transparent would flip pixels
   * that downstream readers display before the placedLayer transform
   * resolves.
   */
  it('samples the placeholder grey on an exported image layer', () => {
    const el = makeElement('image', {
      id: 'img-1',
      name: 'Image',
      position: { x: 10, y: 10 },
      width: 60,
      height: 40,
      content:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, { skipCompositeImageData: true, skipThumbnail: true, useImageData: true });
    const layer = psd.children?.[0];
    const imageData = layer?.imageData;

    expect(imageData).toBeDefined();

    const rawData = imageData?.data;
    const dataView = rawData instanceof Uint8Array || rawData instanceof Uint8ClampedArray ? rawData : undefined;
    const sample = sampleImageData(dataView, imageData?.width ?? 0, 0, 0);

    expect(sample).toBeDefined();
    expect(sample?.r).toBe(200);
    expect(sample?.g).toBe(200);
    expect(sample?.b).toBe(200);
    expect(sample?.a).toBe(255);
  });

  /**
   * @description Native vector shape layers carry imageData because
   * ag-psd otherwise writes zero-sized Photoshop layers. The geometry
   * still lives in the vector mask.
   */
  it('emits imageData and vector metadata for rectangle shape layers', () => {
    const el = makeElement('rectangle', {
      id: 'rect-1',
      name: 'Rect',
      position: { x: 0, y: 0 },
      width: 80,
      height: 50,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#ff00aa' } } as never,
      }),
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, { skipCompositeImageData: true, skipThumbnail: true, useImageData: true });
    const layer = psd.children?.[0];

    expect(layer?.imageData?.width).toBe(80);
    expect(layer?.imageData?.height).toBe(50);
    expect(layer?.vectorFill).toBeDefined();
  });

  /**
   * @description Gradient rectangle fills produce visible layer pixels so Photoshop
   * receives both usable bounds and non-empty channel data for non-solid Broadset fills.
   */
  it('emits visible imageData for gradient rectangle shape layers', () => {
    const el = makeElement('rectangle', {
      id: 'gradient-rect',
      name: 'Gradient Rect',
      position: { x: 0, y: 0 },
      width: 60,
      height: 40,
      style: makeStyle({
        opacity: 1,
        fill: {
          kind: 'gradient',
          gradient: {
            type: 'linear',
            angle: 180,
            stops: [
              { color: { kind: 'rgb', hex: '#ff0000' }, position: 0 },
              { color: { kind: 'rgb', hex: '#0000ff' }, position: 100 },
            ],
          },
        } as never,
      }),
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, { skipCompositeImageData: true, skipThumbnail: true, useImageData: true });
    const imageData = psd.children?.[0]?.imageData;
    const rawData = imageData?.data;
    const dataView = rawData instanceof Uint8Array || rawData instanceof Uint8ClampedArray ? rawData : undefined;
    const topSample = sampleImageData(dataView, imageData?.width ?? 0, 10, 5);
    const bottomSample = sampleImageData(dataView, imageData?.width ?? 0, 10, 35);

    expect(topSample?.a).toBe(255);
    expect(bottomSample?.a).toBe(255);
    expect(topSample?.r).toBeGreaterThan(bottomSample?.r ?? 0);
    expect(bottomSample?.b).toBeGreaterThan(topSample?.b ?? 0);
  });

  /**
   * @description An ellipse fill survives as a vector shape — the
   * writer must produce a `vectorFill` carrying the colour rather
   * than rasterising a circle into pixels. This is the parity check
   * for `applyShapeFill`'s ellipse branch.
   */
  it('keeps ellipse fills as vector and preserves the fill colour', () => {
    const el = makeElement('ellipse', {
      id: 'ellipse-1',
      name: 'Circle',
      position: { x: 30, y: 30 },
      width: 40,
      height: 40,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#22cc88' } } as never,
      }),
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, { skipCompositeImageData: true, skipThumbnail: true, useImageData: true });
    const layer = psd.children?.[0];

    expect(layer?.imageData?.width).toBe(40);
    expect(layer?.imageData?.height).toBe(40);
    expect(layer?.vectorMask?.paths.length).toBeGreaterThan(0);

    if (layer?.vectorFill?.type === 'color') {
      const color = layer.vectorFill.color as { readonly r: number; readonly g: number; readonly b: number };

      expect(color.r).toBe(0x22);
      expect(color.g).toBe(0xcc);
      expect(color.b).toBe(0x88);
    } else {
      throw new Error('vectorFill missing or wrong type');
    }
  });
});
