import { rgbColor } from '@broadset/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/* ------------------------------------------------------------------ */
/*  Typed call capture                                                 */
/* ------------------------------------------------------------------ */

interface MockFont {
  readonly name: string;
  readonly widthOfTextAtSize: (text: string, size: number) => number;
}

interface RectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: { readonly r: number; readonly g: number; readonly b: number };
  readonly borderColor?: unknown;
}

interface SvgPathCall {
  readonly path: string;
  readonly x?: number;
  readonly y?: number;
  readonly color?: { readonly r: number; readonly g: number; readonly b: number };
  readonly borderColor?: unknown;
}

interface Op {
  readonly kind: string;
  readonly x?: number;
  readonly y?: number;
  readonly deg?: number;
  readonly a?: number;
  readonly b?: number;
  readonly c?: number;
  readonly d?: number;
  readonly e?: number;
  readonly f?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly x3?: number;
  readonly y3?: number;
}

const drawCalls = {
  rectangles: [] as RectCall[],
  svgPaths: [] as SvgPathCall[],
  operators: [] as Op[],
  textCount: 0,
};

vi.mock('pdf-lib', () => {
  const page = {
    drawRectangle: (opts: RectCall): void => {
      drawCalls.rectangles.push(opts);
    },
    drawImage: (): void => {},
    drawText: (): void => {
      drawCalls.textCount += 1;
    },
    drawEllipse: (): void => {},
    drawSvgPath: (path: string, opts: Omit<SvgPathCall, 'path'>): void => {
      drawCalls.svgPaths.push({ path, ...opts });
    },
    pushOperators: (...ops: Op[]): void => {
      drawCalls.operators.push(...ops);
    },
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
    save: () => Promise.resolve(new Uint8Array([1])),
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
    pushGraphicsState: (): Op => ({ kind: 'pushGraphicsState' }),
    popGraphicsState: (): Op => ({ kind: 'popGraphicsState' }),
    translate: (x: number, y: number): Op => ({ kind: 'translate', x, y }),
    rotateDegrees: (deg: number): Op => ({ kind: 'rotateDegrees', deg }),
    concatTransformationMatrix: (a: number, b: number, c: number, d: number, e: number, f: number): Op => ({
      kind: 'concatTransformationMatrix',
      a,
      b,
      c,
      d,
      e,
      f,
    }),
    moveTo: (x: number, y: number): Op => ({ kind: 'moveTo', x, y }),
    lineTo: (x: number, y: number): Op => ({ kind: 'lineTo', x, y }),
    appendBezierCurve: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): Op => ({
      kind: 'appendBezierCurve',
      x1,
      y1,
      x2,
      y2,
      x3,
      y3,
    }),
    closePath: (): Op => ({ kind: 'closePath' }),
    clip: (): Op => ({ kind: 'clip' }),
    clipEvenOdd: (): Op => ({ kind: 'clipEvenOdd' }),
    endPath: (): Op => ({ kind: 'endPath' }),
    PDFOperator: {
      of: (op: string): Op => ({ kind: op }),
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resetCalls(): void {
  drawCalls.rectangles = [];
  drawCalls.svgPaths = [];
  drawCalls.operators = [];
  drawCalls.textCount = 0;
}

function operatorKinds(): readonly string[] {
  return drawCalls.operators.map((op) => op.kind);
}

/* ------------------------------------------------------------------ */
/*  P6.2 — Parent-child translation composition                        */
/* ------------------------------------------------------------------ */

describe('P6.2 Parent-child translation composition', () => {
  beforeEach(resetCalls);

  /**
   * @description A child element inside a group MUST render at its canvas-absolute
   * position (group.position + child.position). Broadset's renderer documents that
   * "Parented elements use model-space coordinates relative to their parent's top-left"
   * (renderer/src/dom/layout.ts). The PDF exporter previously ignored this and drew
   * children at their raw position.x / position.y, which was the dom-compositor
   * parity bug called out in pdf-support-plan.md §Current state.
   */
  it('positions a child rectangle at the parent-offset canvas-absolute coordinates', async () => {
    const doc = makeDocument({
      canvas: {
        width: 210,
        height: 118,
        unit: 'mm' as const,
        dpi: 72,
        padding: [0, 0, 0, 0] as [number, number, number, number],
        backgroundMode: 'solid' as const,
      },
      elements: [
        makeElement('group', {
          id: 'parent-grp',
          position: { x: 100, y: 50 },
          width: 80,
          height: 60,
        }),
        makeElement('rectangle', {
          id: 'child-rect',
          parentId: 'parent-grp',
          position: { x: 10, y: 5 },
          width: 40,
          height: 30,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#00aa00') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    // The child rectangle's fill should be green.
    const childRect = drawCalls.rectangles.find((r) => r.color !== undefined && r.color.g > 0.5 && r.color.r < 0.1);

    expect(childRect).toBeDefined();

    const MM_TO_PT = 72 / 25.4;
    const expectedXPt = (100 + 10) * MM_TO_PT;

    // Canvas-absolute x must be parent.x + child.x, not child.x alone.
    if (childRect !== undefined) {
      expect(childRect.x).toBeCloseTo(expectedXPt, 2);
    }
  });

  /**
   * @description Grandchildren (nested group → group → rectangle) compose
   * positions through the entire parent chain.
   */
  it('composes position through a two-level parent chain', async () => {
    const doc = makeDocument({
      canvas: {
        width: 210,
        height: 118,
        unit: 'mm' as const,
        dpi: 72,
        padding: [0, 0, 0, 0] as [number, number, number, number],
        backgroundMode: 'solid' as const,
      },
      elements: [
        makeElement('group', { id: 'outer', position: { x: 50, y: 50 }, width: 100, height: 100 }),
        makeElement('group', { id: 'inner', parentId: 'outer', position: { x: 10, y: 10 }, width: 40, height: 40 }),
        makeElement('rectangle', {
          id: 'leaf',
          parentId: 'inner',
          position: { x: 5, y: 5 },
          width: 20,
          height: 20,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#0000ff') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const leafRect = drawCalls.rectangles.find((r) => r.color !== undefined && r.color.b > 0.9);

    expect(leafRect).toBeDefined();

    const MM_TO_PT = 72 / 25.4;
    const expectedXPt = (50 + 10 + 5) * MM_TO_PT;

    if (leafRect !== undefined) {
      expect(leafRect.x).toBeCloseTo(expectedXPt, 2);
    }
  });

  /**
   * @description Top-level elements (parentId null) retain their absolute
   * position — no parent offset applied.
   */
  it('leaves a top-level element at its own position when parentId is null', async () => {
    const doc = makeDocument({
      canvas: {
        width: 210,
        height: 118,
        unit: 'mm' as const,
        dpi: 72,
        padding: [0, 0, 0, 0] as [number, number, number, number],
        backgroundMode: 'solid' as const,
      },
      elements: [
        makeElement('rectangle', {
          id: 'top',
          position: { x: 80, y: 40 },
          width: 40,
          height: 40,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#ff0000') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const topRect = drawCalls.rectangles.find((r) => r.color !== undefined && r.color.r > 0.9);

    expect(topRect).toBeDefined();

    const MM_TO_PT = 72 / 25.4;
    const expectedXPt = 80 * MM_TO_PT;

    if (topRect !== undefined) {
      expect(topRect.x).toBeCloseTo(expectedXPt, 2);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  P6.2 — Rotation composition                                        */
/* ------------------------------------------------------------------ */

describe('P6.2 Element self-rotation', () => {
  beforeEach(resetCalls);

  /**
   * @description An element with a non-zero `rotation` MUST emit PDF CTM
   * operators bracketing its drawing sequence: `q` (pushGraphicsState)
   * followed by translate-to-centre + rotate + translate-back, then after
   * drawing, `Q` (popGraphicsState). Negation of the angle accounts for
   * PDF's Y-up coordinate system vs. Broadset's CSS Y-down convention.
   */
  it('emits pushGraphicsState, rotate, and popGraphicsState operators for a rotated element', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rotated',
          position: { x: 50, y: 50 },
          width: 100,
          height: 100,
          rotation: 45,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#0000ff') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const kinds = operatorKinds();

    expect(kinds).toContain('pushGraphicsState');
    expect(kinds).toContain('popGraphicsState');
    expect(kinds).toContain('rotateDegrees');

    const rotateOp = drawCalls.operators.find((op) => op.kind === 'rotateDegrees');

    // PDF Y-up inverts the CSS rotation direction — 45° CW in Broadset is -45° CCW in PDF.
    expect(rotateOp?.deg).toBe(-45);
  });

  /**
   * @description Elements with rotation === 0 MUST NOT emit rotation CTM
   * operators — graphics state only grows when it has to.
   */
  it('does not emit rotateDegrees when rotation is 0', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          rotation: 0,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#ff00ff') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(operatorKinds().filter((k) => k === 'rotateDegrees')).toHaveLength(0);
  });

  /**
   * @description Rotation brackets are pushed BEFORE the drawing call and
   * popped AFTER. A rectangle rotated by 30° must emit its drawRectangle
   * call in between one `pushGraphicsState` and one `popGraphicsState`.
   */
  it('brackets the drawing call with push/pop graphics state', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'bracketed',
          position: { x: 0, y: 0 },
          width: 50,
          height: 50,
          rotation: 30,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#00ffff') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const kinds = operatorKinds();
    const firstPush = kinds.indexOf('pushGraphicsState');
    const lastPop = kinds.lastIndexOf('popGraphicsState');

    expect(firstPush).toBeGreaterThanOrEqual(0);
    expect(lastPop).toBeGreaterThan(firstPush);
  });
});

/* ------------------------------------------------------------------ */
/*  P6.2 — Per-corner border radii                                     */
/* ------------------------------------------------------------------ */

describe('P6.2 Per-corner border radii', () => {
  beforeEach(resetCalls);

  /**
   * @description A rectangle with non-uniform per-corner radii MUST emit a
   * composed SVG path (rounded-rect knots for each corner) rather than
   * falling back to `drawRectangle` with no corner info.
   */
  it('emits an SVG rounded-rect path for non-uniform per-corner radii', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#00ff00') },
            borderRadius: [10, 20, 30, 40],
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    // Background draws first rectangle; element with per-corner radii uses drawSvgPath.
    expect(drawCalls.svgPaths.length).toBeGreaterThan(0);

    const path = drawCalls.svgPaths[0];

    expect(path).toBeDefined();

    if (path !== undefined) {
      expect(path.path).toMatch(/^M/); // starts with a MoveTo
      // Four corners ⇒ four cubic-Bezier commands (each "C ... ... ...")
      expect(path.path.split(/\bC\b/).length - 1).toBe(4);
      // Closed path
      expect(path.path).toMatch(/\bZ\b$/);
    }
  });

  /**
   * @description Uniform non-zero radii also render via SVG path — the
   * chosen output is the composed-knot path regardless of symmetry, so the
   * single code path exercised is the native rounded-rect one.
   */
  it('emits an SVG rounded-rect path for uniform non-zero radii', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 80,
          height: 60,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#888888') },
            borderRadius: [12, 12, 12, 12],
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.svgPaths.length).toBeGreaterThan(0);
  });

  /**
   * @description A rectangle without declared border radius continues to
   * use `drawRectangle` — no unnecessary path synthesis.
   */
  it('uses drawRectangle for a rectangle with no declared border radius', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#123456') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.svgPaths).toHaveLength(0);
    // drawCalls.rectangles has ≥1 entry (canvas background + element)
    expect(drawCalls.rectangles.length).toBeGreaterThan(0);
  });

  /**
   * @description A rectangle with all-zero border radius also uses
   * drawRectangle — no path synthesis for the zero edge case.
   */
  it('uses drawRectangle for a rectangle with all-zero border radius', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#654321') },
            borderRadius: [0, 0, 0, 0],
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(drawCalls.svgPaths).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  P6.2 — Clip-path fidelity                                          */
/* ------------------------------------------------------------------ */

describe('P6.2 Clip-path fidelity', () => {
  beforeEach(resetCalls);

  /**
   * @description A CSS `inset()` clip-path MUST emit native PDF clipping
   * operators: `q` (push state) + rectangle path operators + `W` (clip) +
   * `n` (end path without painting) + [element drawing] + `Q` (pop state).
   */
  it('emits clip operators for inset() clip-path', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#ff00ff') },
            maskType: 'custom',
            customClipPath: 'inset(10px 20px 30px 40px)',
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const kinds = operatorKinds();

    expect(kinds).toContain('clip');
    expect(kinds).toContain('endPath');
    expect(kinds).toContain('pushGraphicsState');
    expect(kinds).toContain('popGraphicsState');
  });

  /**
   * @description `circle()` clip-path emits a composed Bézier circle +
   * native clip operators.
   */
  it('emits clip operators for circle() clip-path', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#112233') },
            maskType: 'custom',
            customClipPath: 'circle(50%)',
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const kinds = operatorKinds();

    expect(kinds).toContain('clip');
    expect(kinds).toContain('appendBezierCurve'); // four cubic segments approximating the circle
  });

  /**
   * @description `polygon()` clip-path emits line-segment operators plus
   * native clipping.
   */
  it('emits clip operators for polygon() clip-path', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#445566') },
            maskType: 'custom',
            customClipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
          }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    const kinds = operatorKinds();

    expect(kinds).toContain('clip');
    expect(kinds).toContain('moveTo');
    expect(kinds).toContain('lineTo');
  });

  /**
   * @description Elements without a customClipPath MUST NOT emit clipping
   * operators.
   */
  it('does not emit clip operators for elements without a clip-path', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          position: { x: 0, y: 0 },
          width: 100,
          height: 100,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#aabbcc') } }),
        }),
      ],
    });

    await exportPdfBytes(doc);

    expect(operatorKinds()).not.toContain('clip');
    expect(operatorKinds()).not.toContain('endPath');
  });
});
