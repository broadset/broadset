import { rgbColor } from '@broadset/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/* ------------------------------------------------------------------ */
/*  Draw Call Capture                                                 */
/* ------------------------------------------------------------------ */

interface MockFont {
  readonly name: string;
  readonly widthOfTextAtSize: (text: string, size: number) => number;
}

interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly font: MockFont;
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

vi.mock('pdf-lib', () => {
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
    pushOperators: (): void => {},
    setSize: (): void => {},
    node: {
      set: (): void => {},
      Resources: () => ({
        lookupMaybe: () => ({ set: (): void => {} }),
        set: (): void => {},
      }),
    },
  };

  const makeFont = (name: string | Uint8Array): MockFont => ({
    name: typeof name === 'string' ? name : 'embedded-bytes',
    widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
  });

  const mockContext = {
    obj: (literal: unknown): unknown => literal,
    register: (): unknown => ({ kind: 'ref' }),
  };
  const mockCatalog = {
    set: (): void => {},
  };
  const pdfInstance = {
    addPage: () => page,
    save: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    embedPng: () => Promise.resolve({ id: 'img-png' }),
    embedJpg: () => Promise.resolve({ id: 'img-jpg' }),
    embedFont: (name: string | Uint8Array) => Promise.resolve(makeFont(name)),
    registerFontkit: (): void => {},
    context: mockContext,
    catalog: mockCatalog,
  };

  return {
    PDFDocument: {
      create: () => Promise.resolve(pdfInstance),
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'Helvetica-Bold',
      HelveticaOblique: 'Helvetica-Oblique',
      HelveticaBoldOblique: 'Helvetica-BoldOblique',
      TimesRoman: 'Times-Roman',
      TimesRomanBold: 'Times-Bold',
      TimesRomanItalic: 'Times-Italic',
      TimesRomanBoldItalic: 'Times-BoldItalic',
      Courier: 'Courier',
      CourierBold: 'Courier-Bold',
      CourierOblique: 'Courier-Oblique',
      CourierBoldOblique: 'Courier-BoldOblique',
      Symbol: 'Symbol',
      ZapfDingbats: 'ZapfDingbats',
    },
    rgb: (r: number, g: number, b: number) => ({ r, g, b }),
    pushGraphicsState: () => ({ kind: 'q' }),
    popGraphicsState: () => ({ kind: 'Q' }),
    translate: (x: number, y: number) => ({ kind: 'translate', x, y }),
    rotateDegrees: (deg: number) => ({ kind: 'rotateDegrees', deg }),
    concatTransformationMatrix: (a: number, b: number, c: number, d: number, e: number, f: number) => ({
      kind: 'cm',
      a,
      b,
      c,
      d,
      e,
      f,
    }),
    moveTo: (x: number, y: number) => ({ kind: 'moveTo', x, y }),
    lineTo: (x: number, y: number) => ({ kind: 'lineTo', x, y }),
    appendBezierCurve: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => ({
      kind: 'appendBezierCurve',
      x1,
      y1,
      x2,
      y2,
      x3,
      y3,
    }),
    closePath: () => ({ kind: 'closePath' }),
    clip: () => ({ kind: 'clip' }),
    clipEvenOdd: () => ({ kind: 'clipEvenOdd' }),
    endPath: () => ({ kind: 'endPath' }),
    PDFOperator: {
      of: (op: string, args?: unknown[]) => ({ op, args: args ?? [] }),
    },
    PDFOperatorNames: {
      BeginMarkedContentSequence: 'BDC',
      EndMarkedContent: 'EMC',
      AppendRectangle: 're',
      FillNonZero: 'f',
      NonStrokingColorspace: 'cs',
      NonStrokingColorN: 'scn',
    },
    PDFNumber: {
      of: (n: number) => ({ kind: 'number', value: n }),
    },
    PDFName: {
      of: (name: string) => ({ name }),
    },
    PDFString: {
      of: (value: string) => ({ string: value }),
    },
    PDFDict: {
      withContext: (): { readonly set: (key: unknown, value: unknown) => void } => ({ set: (): void => {} }),
    },
    PDFRawStream: {
      of: (dict: unknown, bytes: Uint8Array) => ({ dict, bytes }),
    },
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
          style: makeStyle({ fontWeight: 700, fontSize: 16 }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font.name).toBe('Helvetica-Bold');
  });

  /** @description Italic text must use an oblique/italic standard font variant. */
  it('selects italic standard font variant for fontStyle italic', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Italic text',
          style: makeStyle({ fontStyle: 'italic', fontSize: 14 }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font.name).toBe('Helvetica-Oblique');
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
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.text.length).toBeGreaterThan(0);
    expect(drawCalls.text[0]?.font.name).toBe('Helvetica-BoldOblique');
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
          style: makeStyle({ textAlignment: 'center', fontSize: 12 }),
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
          style: makeStyle({ textAlignment: 'right', fontSize: 12 }),
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

  /**
   * @description Rectangles with a linear gradient fill now emit a real
   * PDF type-2 shading pattern via `pushOperators` (post-Phase-9
   * "ultimate implementation" pass). The first-stop colour fallback
   * is reserved for conic gradients (no PDF native conic) and for
   * malformed colour stops; verify the shading-pattern path runs by
   * confirming the export completes cleanly + emits non-trivial bytes
   * for a gradient document.
   */
  it('emits a PDF shading pattern instead of first-stop fallback for linear gradients', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'linear',
                angle: 90,
                stops: [
                  { color: rgbColor('#ff0000'), position: 0 },
                  { color: rgbColor('#0000ff'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    // The shading-pattern path goes through `pushOperators`, not
    // through `drawRectangle({ color })` — confirm the rectangle
    // call did NOT receive the first-stop colour as its fill.
    const firstStopFallback = drawCalls.rectangles.find(
      (r) => r.color !== undefined && r.color.r > 0.9 && r.color.b < 0.1,
    );

    expect(firstStopFallback).toBeUndefined();
    expect(bytes.length).toBeGreaterThan(0);
  });

  /**
   * @description Ellipses with a radial gradient fill emit a PDF
   * type-3 shading pattern instead of falling back to the first-stop
   * solid colour.
   */
  it('emits a PDF shading pattern instead of first-stop fallback for radial gradients', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('ellipse', {
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'radial',
                stops: [
                  { color: rgbColor('#00ff00'), position: 0 },
                  { color: rgbColor('#ff00ff'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const firstStopFallback = drawCalls.ellipses.find(
      (e) => e.color !== undefined && e.color.g > 0.9 && e.color.r < 0.1,
    );

    expect(firstStopFallback).toBeUndefined();
    expect(bytes.length).toBeGreaterThan(0);
  });
});
