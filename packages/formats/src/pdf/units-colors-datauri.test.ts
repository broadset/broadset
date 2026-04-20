import type { BroadsetElementStyle } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { buildMaskedSvgSource, canvasToPoints, decodeDataUri, exportPdfBytes, parseCssColor } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

describe('PDF Page Dimensions', () => {
  /**
   * @description Canvas dimensions in mm MUST be converted to PDF points
   * using the formula: points = mm x 72 / 25.4. This verifies the core
   * coordinate conversion for a standard 210x118 mm canvas.
   */
  it('converts canvas mm to PDF points', () => {
    const canvas = makeCanvas({ width: 210, height: 118, unit: 'mm' });
    const { widthPt, heightPt } = canvasToPoints(canvas);

    expect(widthPt).toBeCloseTo((210 * 72) / 25.4, 2);
    expect(heightPt).toBeCloseTo((118 * 72) / 25.4, 2);
  });

  /**
   * @description Canvas dimensions in inches MUST be converted to PDF points
   * using the formula: points = inches x 72.
   */
  it('converts canvas inches to PDF points', () => {
    const canvas = makeCanvas({ width: 8.5, height: 11, unit: 'in' });
    const { widthPt, heightPt } = canvasToPoints(canvas);

    expect(widthPt).toBeCloseTo(8.5 * 72, 2);
    expect(heightPt).toBeCloseTo(11 * 72, 2);
  });

  /**
   * @description Canvas dimensions in pixels MUST be converted to PDF points
   * using the formula: points = (px / dpi) x 72.
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

  /** @description Base64-encoded data URIs must be decoded correctly. */
  it('decodes base64 PNG data URI', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';

    const result = decodeDataUri(dataUri);

    if (!result) {
      throw new Error('Expected a defined result');
    }

    expect(result.mime).toBe('image/png');
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  /** @description Invalid data URIs must return undefined. */
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

  /** @description 3-digit hex shorthand must be expanded correctly. */
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

  /** @description 4-digit hex shorthand with alpha must be expanded correctly. */
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

  /** @description Standard 6-digit hex must be parsed correctly. */
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

  /** @description rgb() functional notation must be parsed correctly. */
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

  /** @description Style helper supports custom values used by rendering tests. */
  it('builds style helper objects with overrides', () => {
    const style = makeStyle({ fontSize: 12 }) as BroadsetElementStyle;

    expect(style.opacity).toBe(1);
    expect(style.fontSize).toBe(12);
  });
});
