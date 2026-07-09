import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { elementToLayer } from './export-layer';
import { makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5 unit P5.3c — linked smart objects preserve a stable GUID
 * across round-trips so Photoshop's "Update linked file" command
 * continues to resolve the referenced asset after re-export. When
 * the element carries `extensions.psd.smartObject.guid` (hydrated on
 * import or set explicitly), the exporter reuses it instead of
 * synthesising a fresh GUID.
 */

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

describe('PSD export — linked smart object GUID preservation', () => {
  /**
   * @description When an image element carries
   * `extensions.psd.smartObject.guid`, the exported layer's
   * `placedLayer.id` MUST match that GUID verbatim. This is the
   * round-trip identity contract that keeps "Update linked file"
   * working after Broadset edits.
   */
  it('reuses the preserved GUID on placedLayer', () => {
    const el = makeElement('image', {
      id: 'img',
      width: 100,
      height: 50,
      content: PIXEL_PNG,
      style: makeStyle({ opacity: 1 }),
      extensions: {
        psd: {
          dirty: false,
          smartObject: { guid: 'abcdef01-2345-6789-abcd-ef0123456789', mime: 'image/png' },
        },
      },
    });
    const layer = elementToLayer(el);

    expect(layer.placedLayer?.id).toBe('abcdef01-2345-6789-abcd-ef0123456789');
  });

  /**
   * @description Elements without a preserved GUID still synthesize a
   * stable-per-session id so the existing happy path keeps working.
   * The key property is that the id is non-empty.
   */
  it('synthesizes a GUID when no preserved id is carried', () => {
    const el = makeElement('image', {
      id: 'img-synth',
      width: 100,
      height: 50,
      content: PIXEL_PNG,
      style: makeStyle({ opacity: 1 }),
    });
    const layer = elementToLayer(el);

    expect(typeof layer.placedLayer?.id).toBe('string');
    expect((layer.placedLayer?.id ?? '').length).toBeGreaterThan(0);
  });

  /**
   * @description The preserved GUID field is optional — an image
   * element with an empty `extensions.psd.smartObject` does not
   * force the use of a preserved GUID; the exporter falls back to
   * synthesis.
   */
  it('falls back to synthesis when the preserved guid is missing', () => {
    const el = makeElement('image', {
      id: 'img-empty',
      width: 100,
      height: 50,
      content: PIXEL_PNG,
      style: makeStyle({ opacity: 1 }),
      extensions: { psd: { dirty: false } },
    });
    const layer = elementToLayer(el);

    expect((layer.placedLayer?.id ?? '').length).toBeGreaterThan(0);
  });
});
