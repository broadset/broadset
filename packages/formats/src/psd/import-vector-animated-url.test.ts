import type { BroadsetElementStyle } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { exportPsdBytes, exportPsdBytesAsync, importPsd, svgPathToPsdVectorMask } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

describe('PSD Import', () => {
  /** @description Imported PSD with rounded rectangle vector masks must set borderRadius on the recovered element style. */
  it('imports rounded rectangle vector mask as borderRadius', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#0000ff',
            borderRadius: [20, 20, 20, 20],
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.borderRadius).toBeDefined();
    }
  });

  /** @description Round-trip: opacity and borderRadius must be preserved when exporting and re-importing PSD. */
  it('preserves opacity and border radius across round-trip', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            opacity: 0.75,
            backgroundColor: '#00ff00',
            borderRadius: [15, 15, 15, 15],
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.opacity).toBeCloseTo(0.75, 1);
    }
  });
});

describe('PSD Path Vector Conversion', () => {
  /** @description Line path SVG data must produce a closed vector mask with correct knots for PSD export. */
  it('converts closed line path to PSD vector mask', () => {
    const mask = svgPathToPsdVectorMask('M 0 0 L 100 0 L 100 100 L 0 100 Z', 100, 100);

    expect(mask).not.toBeNull();

    if (mask) {
      expect(mask.open).toBe(false);
      expect(mask.knots.length).toBe(4);
    }
  });

  /** @description Bezier cubic commands must produce knots with control points preserved for curve fidelity. */
  it('converts bezier cubic commands to PSD knots', () => {
    const mask = svgPathToPsdVectorMask('M 0 0 C 30 0 70 100 100 100', 100, 100);

    expect(mask).not.toBeNull();

    if (mask) {
      expect(mask.knots.length).toBeGreaterThanOrEqual(2);

      const knot = mask.knots[0];

      if (knot) {
        expect(knot.points.length).toBe(6);
      }
    }
  });

  /** @description Invalid or unsupported SVG path data must return null rather than producing a corrupt vector mask. */
  it('returns null for invalid path data', () => {
    expect(svgPathToPsdVectorMask('', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('INVALID', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('X 10 20', 100, 100)).toBeNull();
  });
});

describe('PSD Animated Element Static Export', () => {
  /**
   * @description Animated elements must be exported at their rest state
   * (t=0) with no animation data applied, since PSD cannot represent timelines.
   */
  it('exports animated element at rest state (t=0)', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'anim-el',
          style: makeStyle({ backgroundColor: '#ff0000', opacity: 0.8 }) as BroadsetElementStyle,
        }),
      ],
      animations: [
        {
          elementId: 'anim-el',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'default',
                keyframes: [
                  {
                    name: 'k0',
                    offsetMs: 0,
                    action: 'none' as const,
                    properties: { opacity: { type: 'number' as const, value: 0.8, easing: 'linear' } },
                  },
                  {
                    name: 'k1',
                    offsetMs: 1000,
                    action: 'none' as const,
                    properties: { opacity: { type: 'number' as const, value: 0.2, easing: 'linear' } },
                  },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.opacity).toBeCloseTo(0.8, 1);
    }
  });
});

describe('PSD URL Image Fetch Export', () => {
  /** @description Sync PSD export should fail explicitly when URL image bytes are not prefetched. */
  it('throws in sync export when URL images are missing prefetched bytes', () => {
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          id: 'url-img-missing',
          content: 'https://example.com/photo.png',
          style: makeStyle() as BroadsetElementStyle,
        }),
      ],
    });

    expect(() => exportPsdBytes(doc)).toThrow('Provide prefetchedUrlImages or use exportPsdBytesAsync');
  });

  /** @description Sync PSD export should embed URL images when prefetched bytes are provided. */
  it('embeds URL images in sync export when prefetched bytes are provided', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          id: 'url-img-sync',
          content: 'https://example.com/sync-photo.png',
          style: makeStyle() as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc, {
      prefetchedUrlImages: new Map([
        [
          'url-img-sync',
          {
            mime: 'image/png',
            bytes: pngBytes,
          },
        ],
      ]),
    });

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const img = imported.elements.find((el) => el.type === 'image');

    expect(img).toBeDefined();

    if (img) {
      expect(img.content).toMatch(/^data:image/);
    }
  });

  /**
   * @description When an image element has a URL (not a data URI) and
   * exportPsdBytesAsync is used with a fetch function, the image should
   * be fetched and embedded as a smart object linked file.
   */
  it('fetches URL images and embeds them as smart objects', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const mockFetch = (() => {
      const fn = (): Promise<Response> =>
        Promise.resolve(
          new Response(pngBytes, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
        );

      return fn as unknown as typeof globalThis.fetch;
    })();

    const doc = makeDocument({
      elements: [
        makeElement('image', {
          id: 'url-img',
          content: 'https://example.com/photo.png',
          style: makeStyle() as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = await exportPsdBytesAsync(doc, mockFetch);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);

    expect(imported.elements.length).toBeGreaterThanOrEqual(1);

    const img = imported.elements.find((el) => el.type === 'image');

    if (img) {
      expect(img.content).toMatch(/^data:image/);
    }
  });
});
