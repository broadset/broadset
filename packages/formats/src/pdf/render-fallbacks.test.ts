import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

const drawCalls = {
  rectangles: 0,
  images: 0,
  text: [] as string[],
};

vi.mock('pdf-lib', () => {
  const page = {
    drawRectangle: (): void => {
      drawCalls.rectangles += 1;
    },
    drawImage: (): void => {
      drawCalls.images += 1;
    },
    drawText: (text: string): void => {
      drawCalls.text.push(text);
    },
    drawEllipse: (): void => {},
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
    embedFont: (name: string | Uint8Array) =>
      Promise.resolve({
        name: typeof name === 'string' ? name : 'embedded-bytes',
        widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
      }),
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

describe('PDF Render Fallback Upgrades', () => {
  beforeEach(() => {
    drawCalls.rectangles = 0;
    drawCalls.images = 0;
    drawCalls.text = [];
  });

  /** @description URL images should be fetched and embedded instead of immediately falling back to placeholders. */
  it('embeds fetched URL images during export', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const mockFetch = (): Promise<Response> =>
      Promise.resolve({
        ok: true,
        headers: {
          get: () => 'image/png',
        },
        arrayBuffer: () => Promise.resolve(pngBytes.buffer),
      } as unknown as Response);

    const doc = makeDocument({
      elements: [
        makeElement('image', {
          content: 'https://example.com/photo.png',
          style: makeStyle(),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc, mockFetch as never);

    expect(bytes.length).toBeGreaterThan(0);
    expect(drawCalls.images).toBeGreaterThan(0);
  });

  /** @description Clock and ticker elements should render deterministic text snapshots instead of generic rectangle placeholders only. */
  it('renders text snapshots for clock and ticker elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('clock', {
          content: '12:34',
          style: makeStyle({ backgroundColor: '#ffffff' }),
        }),
        makeElement('ticker', {
          content: 'Breaking News',
          style: makeStyle({ backgroundColor: '#ffffff' }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);

    expect(bytes.length).toBeGreaterThan(0);
    expect(drawCalls.text).toContain('12:34');
    expect(drawCalls.text).toContain('Breaking News');
  });
});
