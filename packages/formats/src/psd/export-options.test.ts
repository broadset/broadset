import './runtime-canvas';

import { type Layer, type Psd, readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes, exportPsdBytesAsyncWithPreflight } from './export';
import { makeDocument, makeElement } from './test-helpers';

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

/**
 * `PsdExportOptions` reach the exporter via `exportPsdBytes`,
 * `exportPsdBytesAsync`, and `exportPsdBytesAsyncWithPreflight` —
 * each entry now accepts a single options object. `preserveVisibility`
 * is honoured today; `colorSpace` and `bitDepth` surface preflight
 * warnings pointing at the lcms-wasm work tracked in
 * `cross-format-io-improvement-plan.md` Phase 4.1.
 */

function readPsdLayers(bytes: Uint8Array): readonly Layer[] {
  return readPsdDocument(bytes).children ?? [];
}

function readPsdDocument(bytes: Uint8Array): Psd {
  const psd = readPsd(bytes, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    throwForMissingFeatures: false,
  });

  return psd;
}

describe('PSD export — PsdExportOptions plumbing', () => {
  /**
   * @description Default options (no overrides) MUST still produce a
   * working export. The byte stream is non-empty and re-readable.
   */
  it('exports a working PSD with default options', () => {
    const el = makeElement('rectangle', { id: 'r1', name: 'Visible' });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc, {});

    expect(bytes.length).toBeGreaterThan(0);

    const layers = readPsdLayers(bytes);

    expect(layers).toHaveLength(1);
  });

  /**
   * @description With `preserveVisibility: false`, elements whose
   * sole-page instance is `visible: false` are dropped from the
   * exported PSD layer tree.
   */
  it('drops invisible elements when preserveVisibility is false', () => {
    const visible = makeElement('rectangle', { id: 'r-on', name: 'On' });
    const hidden = makeElement('rectangle', { id: 'r-off', name: 'Off' });
    const doc = makeDocument({
      elements: [visible, hidden],
      pages: [
        {
          id: 'page-1',
          name: 'Page 1',
          locale: null,
          extensions: {},
          elements: [
            {
              elementId: 'r-on',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
            },
            {
              elementId: 'r-off',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: false,
            },
          ],
        },
      ],
    });

    const bytes = exportPsdBytes(doc, { preserveVisibility: false });
    const layers = readPsdLayers(bytes);

    expect(layers.map((l) => l.name)).toEqual(['On']);
  });

  /**
   * @description Default `preserveVisibility` (undefined / true) keeps
   * the existing single-page behaviour: every element is emitted
   * regardless of per-instance visibility.
   */
  it('keeps invisible elements when preserveVisibility is the default', () => {
    const visible = makeElement('rectangle', { id: 'r-on', name: 'On' });
    const hidden = makeElement('rectangle', { id: 'r-off', name: 'Off' });
    const doc = makeDocument({
      elements: [visible, hidden],
      pages: [
        {
          id: 'page-1',
          name: 'Page 1',
          locale: null,
          extensions: {},
          elements: [
            {
              elementId: 'r-on',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: true,
            },
            {
              elementId: 'r-off',
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              visible: false,
            },
          ],
        },
      ],
    });

    const bytes = exportPsdBytes(doc);
    const layers = readPsdLayers(bytes);

    expect(layers.map((l) => l.name)).toEqual(['On', 'Off']);
  });

  /**
   * @description Requesting `colorSpace: 'cmyk'` MUST surface a
   * preflight warning that names the unsupported space and points at
   * the Phase 4.1 lcms-wasm work. The bytes still ship.
   */
  it('warns when colorSpace is non-RGB', async () => {
    const el = makeElement('rectangle', { id: 'r1', name: 'Rect' });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc, { colorSpace: 'cmyk' });

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('non-rgb'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Phase 4.1'))).toBe(true);
  });

  /**
   * @description Requesting `bitDepth: 16` MUST surface a preflight
   * warning that names the unsupported depth and points at Phase 4.1.
   */
  it('warns when bitDepth is 16', async () => {
    const el = makeElement('rectangle', { id: 'r1', name: 'Rect' });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc, { bitDepth: 16 });

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('16-bit'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('Phase 4.1'))).toBe(true);
  });

  /**
   * @description Requesting `linkSmartObjects: false` MUST keep image
   * smart-object bytes embedded in the PSD package and MUST NOT emit
   * the old stale warning that claimed linked export was unavoidable.
   */
  it('embeds smart-object bytes without warning when linkSmartObjects is false', async () => {
    const el = makeElement('image', { id: 'i1', name: 'Embedded image', content: PIXEL_PNG });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc, { linkSmartObjects: false });
    const psd = readPsdDocument(result.bytes);
    const linkedFile = psd.linkedFiles?.[0];
    const layer = psd.children?.[0];

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('linksmartobjects'))).toBe(false);
    expect(linkedFile?.id).toBe(layer?.placedLayer?.id);
    expect(linkedFile?.data?.byteLength).toBeGreaterThan(0);
    expect(linkedFile?.linkedFile).toBeUndefined();
  });

  /**
   * @description Default options through the preflight entry MUST
   * NOT produce option-driven warnings (only the static document
   * warnings, which for an empty doc are zero).
   */
  it('produces no option warnings for default options', async () => {
    const el = makeElement('rectangle', { id: 'r1', name: 'Rect' });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc);

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.toLowerCase().includes('non-rgb'))).toBe(false);
    expect(result.warnings.some((w) => w.toLowerCase().includes('16-bit'))).toBe(false);
    expect(result.warnings.some((w) => w.toLowerCase().includes('linksmartobjects'))).toBe(false);
  });
});
