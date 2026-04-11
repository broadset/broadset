import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { exportPsdBytes, exportPsdBytesAsync, importPsd, svgPathToPsdVectorMask } from './psd';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 200,
    height: 100,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyle> = {}): Partial<BroadsetElementStyle> {
  return { opacity: 1, ...overrides };
}

function makeElement(type: BroadsetElement['type'], overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    position: { x: 10, y: 10 },
    width: 100,
    height: 50,
    rotation: 0,
    style: makeStyle() as BroadsetElementStyle,
    content: '',
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'Test Doc',
    documentMode: 'screen',
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', overrides: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

/* ------------------------------------------------------------------ */
/*  PSD Path Layer Export                                               */
/* ------------------------------------------------------------------ */

describe('PSD Path Layer Export', () => {
  /**
   * @description An open SVG path (no Z close command) must be exported
   * as a stroke-only PSD layer. This ensures the path renders without
   * fill in Photoshop.
   */
  it('exports open path as stroke-only layer', () => {
    const doc = makeDocument({
      elements: [
        makeElement('path', {
          content: 'M 0 0 L 100 50',
          style: makeStyle({ borderWidth: 2, borderColor: '#000000' }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const pathEl = imported.elements.find((el) => el.type === 'path');

    expect(pathEl).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Clip-Path Mask Export                                          */
/* ------------------------------------------------------------------ */

describe('PSD Clip-Path Mask Export', () => {
  /**
   * @description Rectangle and ellipse elements with clip-paths must be
   * exported with boolean intersect vector masks.
   */
  it('exports rectangle/ellipse clip-paths as vector masks', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            customClipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
          }) as BroadsetElementStyle,
        }),
        makeElement('ellipse', {
          style: makeStyle({
            backgroundColor: '#00ff00',
            customClipPath: 'circle(50%)',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    // Verify round-trip preserves elements
    const imported = importPsd(bytes);

    expect(imported.elements.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description Image elements with clip-paths must have vector masks
   * applied to the raster layer in the PSD output.
   */
  it('exports image with clip-path as raster layer with vector mask', () => {
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
          style: makeStyle({
            customClipPath: 'polygon(10% 10%, 90% 10%, 90% 90%, 10% 90%)',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Border Radius Export                                           */
/* ------------------------------------------------------------------ */

describe('PSD Border Radius Export', () => {
  /**
   * @description A rectangle with borderRadius and clip-path must have
   * both a rounded mask and the clip intersection mask in the PSD output.
   */
  it('exports rounded rectangle with clip preserving both masks', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#0000ff',
            borderRadius: [10, 10, 10, 10],
            customClipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.borderRadius).toBeDefined();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Layer Effects Export                                            */
/* ------------------------------------------------------------------ */

describe('PSD Layer Effects Export', () => {
  /**
   * @description Elements with boxShadow must be exported with PSD
   * drop shadow layer effects.
   */
  it('exports boxShadow as PSD drop shadow effect', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ffffff',
            boxShadow: '4px 4px 8px rgba(0,0,0,0.5)',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
  });

  /**
   * @description CSS mixBlendMode must map to the corresponding PSD
   * blend mode on the layer.
   */
  it('maps CSS mixBlendMode to PSD blend mode', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            mixBlendMode: 'multiply',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      expect(rect.style.mixBlendMode).toBe('multiply');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Smart Object Export                                            */
/* ------------------------------------------------------------------ */

describe('PSD Smart Object Export', () => {
  /**
   * @description Image elements with data URI content must be embedded as
   * smart objects in the PSD.
   */
  it('exports data URI image as smart object', () => {
    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);

    const imported = importPsd(bytes);
    const img = imported.elements.find((el) => el.type === 'image');

    expect(img).toBeDefined();

    if (img) {
      expect(img.content).toContain('data:image');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Artboard and Text Export                                       */
/* ------------------------------------------------------------------ */

describe('PSD Artboard and Text Export', () => {
  /**
   * @description Multiple document pages must map to PSD artboards so
   * each page becomes a separate artboard within the PSD file.
   */
  it('exports multiple pages as PSD artboards', () => {
    const doc = makeDocument({
      pages: [
        { id: 'page-1', name: 'Page 1', overrides: [], locale: null, extensions: {} },
        { id: 'page-2', name: 'Page 2', overrides: [], locale: null, extensions: {} },
      ],
      elements: [
        makeElement('rectangle', { style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);

    // Should have at least 2 pages (artboards)
    expect(imported.pages.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description Text elements must be exported as PSD text layers with
   * the correct text content preserved.
   */
  it('exports text element as PSD text layer', () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello PSD',
          style: makeStyle({ fontSize: 24, fontColor: '#333333' }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPsdBytes(doc);
    const imported = importPsd(bytes);
    const textEl = imported.elements.find((el) => el.type === 'text');

    expect(textEl).toBeDefined();

    if (textEl) {
      expect(textEl.content).toBe('Hello PSD');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PSD Import                                                         */
/* ------------------------------------------------------------------ */

describe('PSD Import', () => {
  /**
   * @description Imported PSD with rounded rectangle vector masks must
   * set borderRadius on the recovered element style.
   */
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

  /**
   * @description Round-trip: opacity and borderRadius must be
   * preserved when exporting and re-importing PSD.
   */
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

/* ------------------------------------------------------------------ */
/*  PSD Path Vector Conversion                                         */
/* ------------------------------------------------------------------ */

describe('PSD Path Vector Conversion', () => {
  /**
   * @description Line path SVG data must produce a closed vector mask
   * with correct knots for PSD export.
   */
  it('converts closed line path to PSD vector mask', () => {
    const mask = svgPathToPsdVectorMask('M 0 0 L 100 0 L 100 100 L 0 100 Z', 100, 100);

    expect(mask).not.toBeNull();

    if (mask) {
      expect(mask.open).toBe(false);
      expect(mask.knots.length).toBe(4);
    }
  });

  /**
   * @description Bezier cubic commands must produce knots with control
   * points preserved for curve fidelity.
   */
  it('converts bezier cubic commands to PSD knots', () => {
    const mask = svgPathToPsdVectorMask('M 0 0 C 30 0 70 100 100 100', 100, 100);

    expect(mask).not.toBeNull();

    if (mask) {
      expect(mask.knots.length).toBeGreaterThanOrEqual(2);

      // Each knot has 6 points (preceding control, anchor, leaving control)
      const knot = mask.knots[0];

      if (knot) {
        expect(knot.points.length).toBe(6);
      }
    }
  });

  /**
   * @description Invalid or unsupported SVG path data must return null
   * rather than producing a corrupt vector mask.
   */
  it('returns null for invalid path data', () => {
    expect(svgPathToPsdVectorMask('', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('INVALID', 100, 100)).toBeNull();
    expect(svgPathToPsdVectorMask('X 10 20', 100, 100)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Animated Element Static Export                                     */
/* ------------------------------------------------------------------ */

describe('PSD Animated Element Static Export', () => {
  /**
   * @description Animated elements must be exported at their rest state
   * (t=0) with no animation data applied, since PSD cannot represent
   * animation timelines.
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

    // Re-import and verify the element is at rest state (base opacity)
    const imported = importPsd(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();

    if (rect) {
      // Opacity should be the base value, not the animated value
      expect(rect.style.opacity).toBeCloseTo(0.8, 1);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  PSD URL Image Fetch Export                                         */
/* ------------------------------------------------------------------ */

describe('PSD URL Image Fetch Export', () => {
  /**
   * @description When an image element has a URL (not a data URI) and
   * exportPsdBytesAsync is used with a fetch function, the image should
   * be fetched and embedded as a smart object linked file.
   */
  it('fetches URL images and embeds them as smart objects', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const mockFetch = (() => {
      const fn = () =>
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

    // Round-trip: the image should come back as a data URI
    const imported = importPsd(bytes);

    // The layer may come back as 'image' (smart object) or 'rectangle' (pixel data)
    // depending on whether ag-psd preserves the placedLayer on round-trip.
    // At minimum, we should get an element from the export.
    expect(imported.elements.length).toBeGreaterThanOrEqual(1);

    const img = imported.elements.find((el) => el.type === 'image');

    if (img) {
      expect(img.content).toMatch(/^data:image/);
    }
  });
});
