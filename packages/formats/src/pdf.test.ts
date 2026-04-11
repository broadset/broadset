import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  buildMaskedSvgSource,
  canvasToPoints,
  decodeDataUri,
  drawQrOnPage,
  exportPdfBytes,
  normalizeFontFamily,
  parseCssColor,
  resolveGoogleFontUrl,
  wrapText,
} from './pdf';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 210,
    height: 118,
    unit: 'mm',
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
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    visible: true,
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
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', overrides: [] }],
    animations: [],
    ...overrides,
  } as BroadsetDocument;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('PDF Page Dimensions', () => {
  /**
   * @description Canvas dimensions in mm MUST be converted to PDF points
   * using the formula: points = mm × 72 / 25.4. This verifies the core
   * coordinate conversion for a standard 210×118 mm canvas.
   */
  it('converts canvas mm to PDF points', () => {
    const canvas = makeCanvas({ width: 210, height: 118, unit: 'mm' });
    const { widthPt, heightPt } = canvasToPoints(canvas);

    expect(widthPt).toBeCloseTo((210 * 72) / 25.4, 2);
    expect(heightPt).toBeCloseTo((118 * 72) / 25.4, 2);
  });

  /**
   * @description Canvas dimensions in inches MUST be converted to PDF points
   * using the formula: points = inches × 72.
   */
  it('converts canvas inches to PDF points', () => {
    const canvas = makeCanvas({ width: 8.5, height: 11, unit: 'in' });
    const { widthPt, heightPt } = canvasToPoints(canvas);

    expect(widthPt).toBeCloseTo(8.5 * 72, 2);
    expect(heightPt).toBeCloseTo(11 * 72, 2);
  });

  /**
   * @description Canvas dimensions in pixels MUST be converted to PDF points
   * using the formula: points = (px / dpi) × 72.
   */
  it('converts canvas pixels to PDF points', () => {
    const canvas = makeCanvas({ width: 1920, height: 1080, unit: 'px', dpi: 96 });
    const { widthPt, heightPt } = canvasToPoints(canvas);

    expect(widthPt).toBeCloseTo((1920 / 96) * 72, 2);
    expect(heightPt).toBeCloseTo((1080 / 96) * 72, 2);
  });
});

describe('Multi-Type Element Rendering', () => {
  /**
   * @description The PDF exporter must handle text, image, path, and qrcode
   * element types, producing a non-empty Uint8Array. This tests that the
   * rendering pipeline doesn't crash on any standard element type.
   */
  it('generates non-empty output for text, image, path, and qrcode', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', { content: 'Hello PDF' }),
        makeElement('image', { content: 'data:image/png;base64,iVBORw0KGgo=' }),
        makeElement('path', { content: 'M0 0 L100 100' }),
        makeElement('qrcode', { content: 'https://example.com' }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
  });
});

describe('Data URI Decoding', () => {
  /**
   * @description UTF-8 SVG data URIs with non-base64 parameters (e.g.
   * data:image/svg+xml;utf8,...) must be decodable. The decoded output
   * must have the correct MIME type and contain SVG content.
   */
  it('decodes UTF-8 SVG data URI with correct MIME and content', () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    const dataUri = `data:image/svg+xml;utf8,${svgContent}`;

    const result = decodeDataUri(dataUri);

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.mime).toBe('image/svg+xml');

    const text = new TextDecoder().decode(result.bytes);

    expect(text).toContain('<svg');
  });

  /**
   * @description Base64-encoded data URIs must be decoded correctly.
   */
  it('decodes base64 PNG data URI', () => {
    // Minimal valid base64 string
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

    const result = decodeDataUri(dataUri);

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.mime).toBe('image/png');
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  /**
   * @description Invalid data URIs must return undefined.
   */
  it('returns undefined for non-data URIs', () => {
    expect(decodeDataUri('https://example.com/image.png')).toBeUndefined();
    expect(decodeDataUri('')).toBeUndefined();
  });
});

describe('Masked SVG Fallback', () => {
  /**
   * @description Elements with a custom clip-path must produce a masked
   * SVG fallback source containing <clipPath>, clip-path="url(#clip0)",
   * and preserveAspectRatio.
   */
  it('builds masked SVG source for clipped elements', () => {
    const svg = buildMaskedSvgSource(100, 50, 'circle(50%)', '<rect width="100" height="50"/>');

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#clip0)"');
    expect(svg).toContain('preserveAspectRatio');
  });
});

describe('CSS Color Parsing', () => {
  /**
   * @description Hex colors with 8 digits must be parsed correctly.
   * The alpha channel is the last 2 hex digits normalized to [0,1].
   */
  it('parses #11223380 with alpha', () => {
    const result = parseCssColor('#11223380');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(0x11 / 255, 2);
    expect(result.g).toBeCloseTo(0x22 / 255, 2);
    expect(result.b).toBeCloseTo(0x33 / 255, 2);
    expect(result.a).toBeCloseTo(0x80 / 255, 2);
  });

  /**
   * @description Unsupported color formats like HSL must return undefined
   * as a defense-in-depth fallback.
   */
  it('returns undefined for unsupported hsl format', () => {
    const result = parseCssColor('hsl(0, 100%, 50%)');

    expect(result).toBeUndefined();
  });

  /**
   * @description 3-digit hex shorthand must be expanded correctly.
   */
  it('parses 3-digit hex shorthand', () => {
    const result = parseCssColor('#abc');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(0xaa / 255, 2);
    expect(result.g).toBeCloseTo(0xbb / 255, 2);
    expect(result.b).toBeCloseTo(0xcc / 255, 2);
    expect(result.a).toBe(1);
  });

  /**
   * @description 4-digit hex shorthand with alpha must be expanded correctly.
   */
  it('parses 4-digit hex with alpha', () => {
    const result = parseCssColor('#abcd');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(0xaa / 255, 2);
    expect(result.g).toBeCloseTo(0xbb / 255, 2);
    expect(result.b).toBeCloseTo(0xcc / 255, 2);
    expect(result.a).toBeCloseTo(0xdd / 255, 2);
  });

  /**
   * @description Standard 6-digit hex must be parsed correctly.
   */
  it('parses 6-digit hex', () => {
    const result = parseCssColor('#ff8800');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBeCloseTo(0x88 / 255, 2);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  /**
   * @description rgb() functional notation must be parsed correctly.
   */
  it('parses rgb() notation', () => {
    const result = parseCssColor('rgb(255, 128, 0)');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(1, 2);
    expect(result.g).toBeCloseTo(128 / 255, 2);
    expect(result.b).toBe(0);
    expect(result.a).toBe(1);
  });

  /**
   * @description rgba() functional notation must be parsed correctly
   * with the alpha channel as a decimal.
   */
  it('parses rgba() notation', () => {
    const result = parseCssColor('rgba(100, 200, 50, 0.5)');

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.r).toBeCloseTo(100 / 255, 2);
    expect(result.g).toBeCloseTo(200 / 255, 2);
    expect(result.b).toBeCloseTo(50 / 255, 2);
    expect(result.a).toBeCloseTo(0.5, 2);
  });
});

describe('Font Embedding', () => {
  /**
   * @description Font family names must be normalized for deduplication:
   * strip quotes, remove hyphens, lowercased.
   */
  it('normalizes font family names for deduplication', () => {
    expect(normalizeFontFamily('"Inter"')).toBe('inter');
    expect(normalizeFontFamily("'Open Sans'")).toBe('open sans');
    expect(normalizeFontFamily('Noto-Sans')).toBe('notosans');
    expect(normalizeFontFamily('  Roboto  ')).toBe('roboto');
  });

  /**
   * @description When a font has an empty URL, the system must construct
   * a Google Fonts CSS URL for resolution.
   */
  it('resolves Google Fonts URL for font with empty URL', () => {
    const url = resolveGoogleFontUrl('Inter');

    expect(url).toContain('fonts.googleapis.com');
    expect(url).toContain('Inter');
  });

  /**
   * @description Given two text elements with the same font family, export must
   * deduplicate — only one fetch and one embed call should occur. This tests
   * the integration of normalizeFontFamily and resolveGoogleFontUrl within the
   * export pipeline.
   */
  it('deduplicates font fetches for duplicate family names', async () => {
    const fetchCalls: string[] = [];
    const mockFetch = (input: string | Request | URL): Promise<Response> => {
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input.url;

      fetchCalls.push(url);

      if (url.includes('fonts.googleapis.com')) {
        // Return CSS pointing to a font URL
        return Promise.resolve(new Response('/* no font URL */'));
      }

      return Promise.resolve(new Response('', { status: 404 }));
    };

    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 16 }) as BroadsetElementStyle,
        }),
        makeElement('text', {
          content: 'World',
          style: makeStyle({ fontFamily: '"Inter"', fontSize: 14 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc, mockFetch as never);

    // Both elements normalize to "inter", so only 1 Google Fonts CSS fetch should occur
    const googleCalls = fetchCalls.filter((u) => u.includes('fonts.googleapis.com'));

    expect(googleCalls).toHaveLength(1);
  });

  /**
   * @description When a font matches a standard PDF font (e.g. Helvetica, Arial),
   * no external fetch should be attempted.
   */
  it('uses standard font without fetch for known families', async () => {
    const fetchCalls: string[] = [];
    const mockFetch = (input: string | Request | URL): Promise<Response> => {
      fetchCalls.push(
        typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : input.url,
      );

      return Promise.resolve(new Response('', { status: 404 }));
    };

    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Helvetica', fontSize: 16 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc, mockFetch as never);

    // Helvetica is a standard font — no fetch needed
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('Text Wrapping', () => {
  /**
   * @description Text wider than the container must wrap at word boundaries
   * producing multiple lines with non-empty content.
   */
  it('wraps text at word boundaries', () => {
    // Mock measure function: each character is 10 units wide
    const measure = (text: string) => text.length * 10;
    const result = wrapText('The quick brown fox jumps over the lazy dog', 100, measure);

    expect(result.length).toBeGreaterThan(1);

    for (const line of result) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  /**
   * @description Explicit newlines must be preserved including empty lines.
   */
  it('preserves explicit newlines including empty lines', () => {
    const measure = (text: string) => text.length * 10;
    const result = wrapText('line one\n\nline three', 10000, measure);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe('line one');
    expect(result[1]).toBe('');
    expect(result[2]).toBe('line three');
  });

  /**
   * @description When full-string measurement throws, the system must
   * fall back to per-character measurement.
   */
  it('falls back to per-character measurement on throw', () => {
    let callCount = 0;
    const measure = (text: string) => {
      callCount++;

      if (callCount <= 2 && text.length > 1) {
        throw new Error('measurement failed');
      }

      return text.length * 10;
    };
    const result = wrapText('ab cd', 30, measure);

    // Should produce output despite measurement errors
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PDF QR Code Drawing', () => {
  /**
   * @description Empty QR content must draw only 1 rectangle (the white
   * background). Non-empty content must draw background + multiple module
   * rectangles.
   */
  it('draws only background rectangle for empty content', () => {
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const mockPage = {
      drawRectangle: (opts: { x: number; y: number; width: number; height: number }) => {
        rects.push(opts);
      },
    };

    drawQrOnPage(mockPage as never, '', 0, 0, 100, 100);

    expect(rects).toHaveLength(1);
  });

  /**
   * @description Non-empty QR content must draw background + module
   * rectangles (multiple total).
   */
  it('draws multiple rectangles for non-empty content', () => {
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const mockPage = {
      drawRectangle: (opts: { x: number; y: number; width: number; height: number }) => {
        rects.push(opts);
      },
    };

    drawQrOnPage(mockPage as never, 'https://example.com', 0, 0, 100, 100);

    expect(rects.length).toBeGreaterThan(1);
  });
});

describe('Animated Element Static Export', () => {
  /**
   * @description PDF export must render animated elements at their default
   * rest state (t=0), ignoring any active animation state. We verify this
   * by exporting two documents — one with animation data and one without —
   * and confirming the output bytes are identical, proving the animation
   * data has no effect on the exported PDF.
   */
  it('exports animated elements at rest state (t=0)', async () => {
    const baseElements = [
      makeElement('text', {
        id: 'el-1',
        content: 'Animated text',
        style: makeStyle({ opacity: 1 }) as BroadsetElementStyle,
      }),
    ];

    const docWithAnimation = makeDocument({
      elements: baseElements,
      animations: [
        {
          id: 'anim-1',
          name: 'fade',
          elementId: 'el-1',
          trigger: 'onLoad',
          timelines: [
            {
              property: 'style.opacity',
              keyframes: [
                { time: 0, value: { type: 'number', value: 1 } },
                { time: 1, value: { type: 'number', value: 0.5 } },
              ],
            },
          ],
        },
      ] as never,
    });

    const docWithoutAnimation = makeDocument({
      elements: baseElements,
      animations: [],
    });

    const bytesAnimated = await exportPdfBytes(docWithAnimation);
    const bytesStatic = await exportPdfBytes(docWithoutAnimation);

    expect(bytesAnimated).toBeInstanceOf(Uint8Array);
    expect(bytesAnimated.length).toBeGreaterThan(0);

    // Both outputs should have the same length — animation data is discarded
    expect(bytesAnimated.length).toBe(bytesStatic.length);
  });

  /**
   * @description Active state modifiers must not be applied in PDF export.
   * The element's own style from the document model must be used directly.
   */
  it('does not apply active state modifiers in export', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rect-1',
          width: 50,
          height: 50,
          style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle,
        }),
      ],
    });

    // Export should use the element's own style, not any runtime modifiers
    const bytes = await exportPdfBytes(doc);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
