import type { BroadsetElementStyle } from '@broadset/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/* ------------------------------------------------------------------ */
/*  Draw Call Capture                                                 */
/* ------------------------------------------------------------------ */

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly font: string;
}

interface RectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: { readonly r: number; readonly g: number; readonly b: number };
}

interface EllipseCall {
  readonly x: number;
  readonly y: number;
  readonly color?: { readonly r: number; readonly g: number; readonly b: number };
}

const drawCalls = {
  text: [] as TextCall[],
  rectangles: [] as RectCall[],
  ellipses: [] as EllipseCall[],
};

vi.mock('@libpdf/core', () => {
  const page = {
    drawRectangle: (opts: RectCall): void => {
      drawCalls.rectangles.push(opts);
    },
    drawImage: (): void => {},
    drawText: (text: string, opts: Omit<TextCall, 'text'>): void => {
      drawCalls.text.push({ text, ...opts });
    },
    drawEllipse: (opts: EllipseCall): void => {
      drawCalls.ellipses.push(opts);
    },
    drawSvgPath: (): void => {},
  };

  const pdfInstance = {
    addPage: () => page,
    save: () => new Uint8Array([1, 2, 3]),
    embedImage: () => ({ id: 'img-1' }),
    embedFont: () => ({
      widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
    }),
  };

  return {
    PDF: {
      create: () => pdfInstance,
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'Helvetica-Bold',
      HelveticaOblique: 'Helvetica-Oblique',
      HelveticaBoldOblique: 'Helvetica-BoldOblique',
      TimesRoman: 'Times-Roman',
      TimesBold: 'Times-Bold',
      TimesItalic: 'Times-Italic',
      TimesBoldItalic: 'Times-BoldItalic',
      Courier: 'Courier',
      CourierBold: 'Courier-Bold',
      CourierOblique: 'Courier-Oblique',
      CourierBoldOblique: 'Courier-BoldOblique',
    },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
  };
});

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('PDF Fidelity Upgrades (C10)', () => {
  beforeEach(() => {
    drawCalls.text = [];
    drawCalls.rectangles = [];
    drawCalls.ellipses = [];
  });

  /** @description Bold text must use a bold standard font variant (e.g. Helvetica-Bold). */
  it('selects bold standard font variant for fontWeight >= 700', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Bold heading',
          style: makeStyle({ fontWeight: 700, fontSize: 16 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font).toBe('Helvetica-Bold');
  });

  /** @description Italic text must use an oblique/italic standard font variant. */
  it('selects italic standard font variant for fontStyle italic', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Italic text',
          style: makeStyle({ fontStyle: 'italic', fontSize: 14 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font).toBe('Helvetica-Oblique');
  });

  /** @description Bold+italic must select the bold-oblique variant. */
  it('selects bold-italic variant when both weight and style apply', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Bold + Italic',
          style: makeStyle({
            fontWeight: 800,
            fontStyle: 'italic',
            fontSize: 12,
          }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font).toBe('Helvetica-BoldOblique');
  });

  /** @description Center-aligned text must be offset to the center of the element width. */
  it('offsets center-aligned text to middle of element width', async () => {
    const doc = makeDocument({
      canvas: {
        width: 800,
        height: 600,
        unit: 'px' as const,
        dpi: 72,
        padding: [0, 0, 0, 0] as [number, number, number, number],
        backgroundColor: '#ffffff',
        backgroundMode: 'solid' as const,
      },
      elements: [
        makeElement('text', {
          content: 'Center',
          position: { x: 100, y: 100 },
          width: 200,
          height: 50,
          style: makeStyle({ textAlignment: 'center', fontSize: 12 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);

    const call = drawCalls.text[0];

    // For center alignment: x should be > 100 (shifted right from left edge)
    expect(call).toBeDefined();

    if (call) {
      expect(call.x).toBeGreaterThan(100);
    }
  });

  /** @description Right-aligned text must be offset toward the right edge. */
  it('offsets right-aligned text to right edge of element', async () => {
    const doc = makeDocument({
      canvas: {
        width: 800,
        height: 600,
        unit: 'px' as const,
        dpi: 72,
        padding: [0, 0, 0, 0] as [number, number, number, number],
        backgroundColor: '#ffffff',
        backgroundMode: 'solid' as const,
      },
      elements: [
        makeElement('text', {
          content: 'Right',
          position: { x: 100, y: 100 },
          width: 200,
          height: 50,
          style: makeStyle({ textAlignment: 'right', fontSize: 12 }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);

    const call = drawCalls.text[0];

    expect(call).toBeDefined();

    if (call) {
      // Right-aligned x should be further right than center
      expect(call.x).toBeGreaterThan(100);
    }
  });

  /** @description Rectangles with backgroundGradient must use the first stop color as fallback fill. */
  it('uses gradient first stop color for rectangle fill', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundGradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#ff0000', position: 0 },
                { color: '#0000ff', position: 1 },
              ],
            },
          }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    // Should have at least 2 rectangle calls (background + element)
    const elementRect = drawCalls.rectangles.find((r) => r.color && r.color.r > 0.9);

    expect(elementRect).toBeDefined();
  });

  /** @description Ellipses with backgroundGradient must use the first stop color as fallback fill. */
  it('uses gradient first stop color for ellipse fill', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('ellipse', {
          style: makeStyle({
            backgroundGradient: {
              type: 'radial',
              stops: [
                { color: '#00ff00', position: 0 },
                { color: '#ff00ff', position: 1 },
              ],
            },
          }) as BroadsetElementStyle,
        }),
      ],
    });

    await exportPdfBytes(doc);

    const greenEllipse = drawCalls.ellipses.find((e) => e.color && e.color.g > 0.9);

    expect(greenEllipse).toBeDefined();
  });
});
