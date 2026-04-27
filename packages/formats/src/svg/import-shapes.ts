/**
 * Importer-side native-shape readers. One function per SVG shape
 * (`<rect>`, `<path>`, `<ellipse>`, `<circle>`, `<polygon>`,
 * `<polyline>`, `<image>`) plus the bake helpers that fold
 * cumulative scale/skew into the resulting geometry. Each reader
 * is pure: it takes the source element + a `ShapeBakeContext`
 * carrying the cumulative transform / style / tag metadata, and
 * returns a single `ImportedElement`.
 *
 * Split out of `import.ts` in P7.7m to bring the orchestrator
 * back under the soft size limit.
 */
import {
  bakePathWithMatrix,
  type ImportedElement,
  type ShapeBakeContext,
  type TransformState,
} from './import-types';
import { ellipseAsPathD, polygonAsPathD, rectAsPathD } from './transform';

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}


/**
 * `true` when geometry MUST be baked into a `<path>` because the
 * cumulative transform (root → leaf, including own) carries a
 * non-trivial scale or skew. `ctx.transform` is the composed
 * matrix from `combineTransform`, so checking its `requiresBake`
 * flag covers both ancestor and own contributions.
 */
function requiresBake(ctx: ShapeBakeContext): boolean {
  return ctx.transform.requiresBake;
}

/**
 * `<image>` cannot bake to a `<path>`, but a pure scale+translate
 * cumulative transform CAN fold its scale factors into the
 * declared `width` / `height` so the visual result matches what
 * the source SVG showed. Skew / rotation embedded in the matrix
 * survives via `transform.rotation` (decomposed) — anything left
 * over (true skew) emits a warning so the gap is visible.
 */
function bakeImageDimensions(
  transform: TransformState,
  rawWidth: number,
  rawHeight: number,
  warnings: string[],
): { readonly width: number; readonly height: number } {
  if (!transform.requiresBake) {
    return { width: rawWidth, height: rawHeight };
  }

  // The cumulative matrix has shape { a, b, c, d, e, f }. After
  // decomposeTSR factors out rotation, a pure scale+translate would
  // satisfy b ≈ 0 and c ≈ 0; the magnitudes |a| and |d| are then
  // the X / Y scale factors. Mixed skew leaves residual b / c that
  // we can't represent on a native `<image>`.
  const m = transform.matrix;
  const cosTheta = Math.cos((transform.rotation * Math.PI) / 180);
  const sinTheta = Math.sin((transform.rotation * Math.PI) / 180);
  const sx = m.a * cosTheta + m.b * sinTheta;
  const sy = -m.c * sinTheta + m.d * cosTheta;
  const skewX = m.a * -sinTheta + m.b * cosTheta;
  const skewY = m.c * cosTheta + m.d * sinTheta;
  const skewMagnitude = Math.max(Math.abs(skewX), Math.abs(skewY));

  if (skewMagnitude > 1e-3) {
    warnings.push(
      `Skew on an <image> element was dropped on import (Broadset has no element-level image skew per IO-D-02).`,
    );
  }

  return { width: rawWidth * Math.abs(sx), height: rawHeight * Math.abs(sy) };
}

function bakedPathElement(d: string, ctx: ShapeBakeContext): ImportedElement {
  // `ctx.transform.matrix` is the FULL cumulative matrix from root
  // through this element's own transform — `combineTransform`
  // already composed it. The previous code re-composed
  // `ctx.transform.matrix × ctx.ownTransform.matrix`, double-
  // applying the leaf's own transform on every bake (P7 review
  // finding). The bake just needs the cumulative matrix as-is.
  return {
    type: 'path',
    content: bakePathWithMatrix(d, ctx.transform.matrix),
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
    rotation: 0,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

export function importRectElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const x = getNumAttr(el, 'x', 0);
  const y = getNumAttr(el, 'y', 0);
  const w = getNumAttr(el, 'width', 0);
  const h = getNumAttr(el, 'height', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(rectAsPathD(x, y, w, h), ctx);
  }

  return {
    type: 'rectangle',
    content: '',
    position: { x: ctx.transform.x + x, y: ctx.transform.y + y },
    width: w,
    height: h,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

export function importPathElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const dRaw = getAttr(el, 'd') ?? '';

  if (requiresBake(ctx)) {
    return bakedPathElement(dRaw, ctx);
  }

  return {
    type: 'path',
    content: dRaw,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

export function importEllipseElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const cx = getNumAttr(el, 'cx', 0);
  const cy = getNumAttr(el, 'cy', 0);
  const rx = getNumAttr(el, 'rx', 0);
  const ry = getNumAttr(el, 'ry', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(ellipseAsPathD(cx, cy, rx, ry), ctx);
  }

  return {
    type: 'ellipse',
    content: '',
    position: { x: ctx.transform.x + cx - rx, y: ctx.transform.y + cy - ry },
    width: rx * 2,
    height: ry * 2,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

export function importCircleElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const cx = getNumAttr(el, 'cx', 0);
  const cy = getNumAttr(el, 'cy', 0);
  const r = getNumAttr(el, 'r', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(ellipseAsPathD(cx, cy, r, r), ctx);
  }

  return {
    type: 'ellipse',
    content: '',
    position: { x: ctx.transform.x + cx - r, y: ctx.transform.y + cy - r },
    width: r * 2,
    height: r * 2,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

export function importPolygonElement(el: Element, ctx: ShapeBakeContext, closed: boolean): ImportedElement {
  const pointsAttr = getAttr(el, 'points') ?? '';
  const dRaw = polygonAsPathD(pointsAttr, closed);

  if (requiresBake(ctx)) {
    return bakedPathElement(dRaw, ctx);
  }

  return {
    type: 'path',
    content: dRaw,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}


/**
 * Import an `<image>` element. Cumulative scale folds into width /
 * height via `bakeImageDimensions`; cumulative skew emits a
 * warning (no native representation per IO-D-02).
 */
export function importImageElement(el: Element, ctx: ShapeBakeContext, warnings: string[]): ImportedElement {
  const rawWidth = getNumAttr(el, 'width', 0);
  const rawHeight = getNumAttr(el, 'height', 0);
  const baked = bakeImageDimensions(ctx.transform, rawWidth, rawHeight, warnings);

  return {
    type: 'image',
    content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: baked.width,
    height: baked.height,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}
