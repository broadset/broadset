import type { BroadsetGradient, BroadsetGradientStop } from '@broadset/model';
import { colorToCss } from '@broadset/model';
import {
  type PDFContext,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';

import { parseCssColor } from '../color';

const PATTERN_KEY = PDFName.of('Pattern');
const PATTERN_COLORSPACE = PDFName.of('Pattern');
const RESOURCES_KEY = PDFName.of('Resources');

/**
 * Per-document pattern counter. Module-global state would leak the
 * counter across export passes in the same Node process, breaking
 * deterministic byte output (`BSPat_1`, `BSPat_2`, ...) — so the
 * counter is keyed on the `PDFDocument` and resets when a fresh
 * document is created.
 */
const patternCountersByDoc = new WeakMap<PDFDocument, number>();

function nextPatternIndex(pdf: PDFDocument): number {
  const next = (patternCountersByDoc.get(pdf) ?? 0) + 1;

  patternCountersByDoc.set(pdf, next);

  return next;
}

/**
 * Result of registering a gradient as a PDF shading pattern.
 *
 * `applyOperators` are the raw operators callers push around their
 * fill operator (`f`) so the pattern resolves as the non-stroking
 * colour. The shape itself (rectangle, ellipse, path) is emitted by
 * the caller — the shading pattern only sources the colour, not the
 * geometry.
 */
interface RegisteredShadingPattern {
  readonly patternName: PDFName;
  readonly setPatternFillOperators: readonly PDFOperator[];
}

/**
 * Geometry hint passed to the shading-pattern builder. Either a
 * rectangle box (used by `rectangle` / `ellipse` / `image` element
 * renderers) or a 2D centre + extent (used by `path` and `text` fills
 * that don't have a tight bounding box). PDF points throughout — the
 * caller is responsible for converting from canvas units.
 */
export interface ShadingGeometry {
  readonly xPt: number;
  readonly yPt: number;
  readonly wPt: number;
  readonly hPt: number;
}

/**
 * Build and register a PDF shading pattern for a Broadset gradient,
 * returning the pattern name + the operators that set the page's
 * non-stroking colour to that pattern. Linear gradients become PDF
 * axial (type-2) shadings; radial gradients become PDF radial
 * (type-3) shadings. Conic gradients are not natively expressible in
 * PDF — callers fall back to the first-stop colour and surface a
 * warning per IO-D-18 ("no silent drops").
 *
 * Stops with non-RGB colour spaces or theme references are resolved
 * via the existing `colorToCss` + `parseCssColor` boundary so the
 * shading-pattern emitter inherits the same colour-resolution path
 * as the rest of the exporter.
 */
export function registerLinearOrRadialShading(
  pdf: PDFDocument,
  page: PDFPage,
  gradient: BroadsetGradient,
  geometry: ShadingGeometry,
): RegisteredShadingPattern | null {
  if (gradient.type === 'conic') return null;
  if (gradient.stops.length < 2) return null;

  const resolvedStops = resolveStops(gradient.stops);

  if (resolvedStops === null) return null;

  const stitchedFunction = buildStitchedFunction(pdf.context, resolvedStops);
  const shadingDict =
    gradient.type === 'linear' ?
      buildLinearShading(pdf.context, gradient, geometry, stitchedFunction)
    : buildRadialShading(pdf.context, gradient, geometry, stitchedFunction);

  const patternDict = pdf.context.obj({
    Type: 'Pattern',
    PatternType: 2,
    Shading: shadingDict,
  });
  const patternRef = pdf.context.register(patternDict);

  const patternName = PDFName.of(`BSPat_${String(nextPatternIndex(pdf))}`);

  registerPagePattern(pdf, page, patternName, patternRef);

  // Sequence the caller pushes inside `q` … `Q`:
  //   /Pattern cs           — set non-stroking colour space to Pattern
  //   /BSPat_N scn          — bind to the named pattern
  //   <draw geometry + f>   — caller emits this
  const setPatternFillOperators: readonly PDFOperator[] = [
    PDFOperator.of(PDFOperatorNames.NonStrokingColorspace, [PATTERN_COLORSPACE]),
    PDFOperator.of(PDFOperatorNames.NonStrokingColorN, [patternName]),
  ];

  return { patternName, setPatternFillOperators };
}

/**
 * Resolve every gradient stop into normalised position (0..1) +
 * RGB triple. Returns `null` when any stop's colour cannot be parsed
 * — caller falls through to the first-stop fallback.
 */
function resolveStops(
  stops: readonly BroadsetGradientStop[],
): readonly { readonly position: number; readonly r: number; readonly g: number; readonly b: number }[] | null {
  const out: { readonly position: number; readonly r: number; readonly g: number; readonly b: number }[] = [];

  for (const stop of stops) {
    const parsed = parseCssColor(colorToCss(stop.color));

    if (parsed === undefined) return null;

    out.push({
      position: clamp01(stop.position / 100),
      r: parsed.r,
      g: parsed.g,
      b: parsed.b,
    });
  }

  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Build a PDF type-3 (stitching) function that interpolates colour
 * across the gradient stops. Each adjacent stop pair becomes a
 * type-2 (exponential) sub-function with linear interpolation
 * (`/N 1`), and the type-3 wrapper bounds them at the stop positions.
 */
function buildStitchedFunction(
  context: PDFContext,
  stops: readonly { readonly position: number; readonly r: number; readonly g: number; readonly b: number }[],
): PDFDict {
  const subFunctions: PDFDict[] = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    if (a === undefined || b === undefined) continue;

    subFunctions.push(
      context.obj({
        FunctionType: 2,
        Domain: [0, 1],
        C0: [a.r, a.g, a.b],
        C1: [b.r, b.g, b.b],
        N: 1,
      }),
    );
  }

  if (subFunctions.length === 1) {
    // Single sub-function — no need for a stitching wrapper.
    return subFunctions[0] ?? context.obj({});
  }

  const bounds: number[] = [];

  for (let i = 1; i < stops.length - 1; i++) {
    const stop = stops[i];

    if (stop === undefined) continue;

    bounds.push(stop.position);
  }

  const encode: number[] = [];

  for (let i = 0; i < subFunctions.length; i++) {
    encode.push(0, 1);
  }

  return context.obj({
    FunctionType: 3,
    Domain: [0, 1],
    Functions: subFunctions,
    Bounds: bounds,
    Encode: encode,
  });
}

/**
 * Build the PDF type-2 axial shading dict for a CSS linear gradient.
 *
 * CSS angle 0° points "up" (toward the top of the box). The gradient
 * line passes through the box centre along that direction; the
 * `/Coords` endpoints are the projections of the box corners onto the
 * line (so the gradient fills the tightest enclosing band).
 */
function buildLinearShading(
  context: PDFContext,
  gradient: BroadsetGradient,
  geometry: ShadingGeometry,
  fn: PDFDict,
): PDFDict {
  const angleDeg = gradient.angle ?? 180;
  const radians = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = Math.cos(radians);

  const cxPt = geometry.xPt + geometry.wPt / 2;
  const cyPt = geometry.yPt + geometry.hPt / 2;
  const halfProjection = (geometry.wPt * Math.abs(dx) + geometry.hPt * Math.abs(dy)) / 2;

  const x0 = cxPt - dx * halfProjection;
  const y0 = cyPt - dy * halfProjection;
  const x1 = cxPt + dx * halfProjection;
  const y1 = cyPt + dy * halfProjection;

  return context.obj({
    ShadingType: 2,
    ColorSpace: 'DeviceRGB',
    Coords: [x0, y0, x1, y1],
    Function: fn,
    Extend: [true, true],
  });
}

/**
 * Build the PDF type-3 radial shading dict for a CSS radial gradient.
 *
 * Centre defaults to the element's geometric centre; gradient.center
 * (a `[xPercent, yPercent]` tuple) overrides. Inner radius is 0 (CSS
 * radial-gradient always starts from a point); outer radius is the
 * Euclidean distance from the centre to the farthest of the four
 * element corners — CSS `farthest-corner` semantics for an arbitrary
 * (possibly off-centre) gradient origin.
 */
function buildRadialShading(
  context: PDFContext,
  gradient: BroadsetGradient,
  geometry: ShadingGeometry,
  fn: PDFDict,
): PDFDict {
  const center = gradient.center ?? [50, 50];
  const cxPt = geometry.xPt + (geometry.wPt * center[0]) / 100;
  const cyPt = geometry.yPt + geometry.hPt - (geometry.hPt * center[1]) / 100;
  const radiusPt = farthestCornerDistance(cxPt, cyPt, geometry);

  return context.obj({
    ShadingType: 3,
    ColorSpace: 'DeviceRGB',
    Coords: [cxPt, cyPt, 0, cxPt, cyPt, radiusPt],
    Function: fn,
    Extend: [true, true],
  });
}

function farthestCornerDistance(cx: number, cy: number, geometry: ShadingGeometry): number {
  const left = geometry.xPt;
  const right = geometry.xPt + geometry.wPt;
  const bottom = geometry.yPt;
  const top = geometry.yPt + geometry.hPt;
  const dx = Math.max(Math.abs(cx - left), Math.abs(cx - right));
  const dy = Math.max(Math.abs(cy - bottom), Math.abs(cy - top));

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Insert the shading pattern reference into the page's
 * `/Resources /Pattern` dictionary so the content stream can
 * reference it by name.
 */
function registerPagePattern(pdf: PDFDocument, page: PDFPage, name: PDFName, ref: PDFRef): void {
  const resources = readOrCreateResourcesDict(pdf, page);
  const patterns = readOrCreatePatternDict(pdf, resources);

  patterns.set(name, ref);
}

function readOrCreateResourcesDict(pdf: PDFDocument, page: PDFPage): PDFDict {
  const existing = page.node.Resources();

  if (existing !== undefined) {
    return existing;
  }

  const created = PDFDict.withContext(pdf.context);

  page.node.set(RESOURCES_KEY, created);

  return created;
}

function readOrCreatePatternDict(pdf: PDFDocument, resources: PDFDict): PDFDict {
  const existing = resources.lookupMaybe(PATTERN_KEY, PDFDict);

  if (existing !== undefined) return existing;

  const created = PDFDict.withContext(pdf.context);

  resources.set(PATTERN_KEY, created);

  return created;
}

