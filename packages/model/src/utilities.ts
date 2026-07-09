import svgpath from 'svgpath';

export type AnchorX = 'left' | 'right';
export type AnchorY = 'top' | 'bottom';

const MILLIMETRES_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const DEFAULT_DPI = 96;
const PATH_SCALE_PRECISION = 2;
const MIN_CLIP_DIMENSION = 1;

export interface ElementRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasDimensions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

/** Converts pixels to millimetres using the provided DPI (defaults to 96). */
export function pxToMm(px: number, dpi: number = DEFAULT_DPI): number {
  return (px * MILLIMETRES_PER_INCH) / dpi;
}

/** Converts millimetres to pixels using the provided DPI (defaults to 96). */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return (mm * dpi) / MILLIMETRES_PER_INCH;
}

/** Converts pixels to PostScript points using the provided DPI (defaults to 96). */
export function pxToPt(px: number, dpi: number = DEFAULT_DPI): number {
  return (px * POINTS_PER_INCH) / dpi;
}

/** Converts PostScript points to pixels using the provided DPI (defaults to 96). */
export function ptToPx(pt: number, dpi: number = DEFAULT_DPI): number {
  return (pt * dpi) / POINTS_PER_INCH;
}

/** Converts inches to millimetres using the canonical 25.4 constant. */
export function inToMm(inches: number): number {
  return inches * MILLIMETRES_PER_INCH;
}

/** Converts millimetres to inches using the canonical 25.4 constant. */
export function mmToIn(mm: number): number {
  return mm / MILLIMETRES_PER_INCH;
}

/** Converts an em value to pixels against a base font size expressed in pixels. */
export function emToPx(em: number, fontSizePx: number): number {
  return em * fontSizePx;
}

export type LengthUnit = 'px' | 'mm' | 'in' | 'pt' | 'em';

export interface ParsedLength {
  readonly value: number;
  readonly unit: LengthUnit;
}

/**
 * Matches an optional sign, a non-overlapping numeric literal (integer,
 * fractional, or leading-dot), and one of the five supported length units.
 * Worst-case is linear in the input length — the numeric alternation has no
 * shared prefixes and the unit group is anchored.
 */
const LENGTH_INPUT_RE = /^([+-]?(?:\d+\.\d+|\d+|\.\d+))\s*(px|mm|in|pt|em)$/i;

function isLengthUnit(candidate: string): candidate is LengthUnit {
  return (
    candidate === 'px' || candidate === 'mm' || candidate === 'in' || candidate === 'pt' || candidate === 'em'
  );
}

/**
 * Parses a CSS-style length string like `"24px"`, `"2mm"`, `"0.5in"`,
 * `"12pt"`, or `"1.5em"`. Returns `null` for any input that does not match
 * the supported grammar — never silently coerces. Surrounding whitespace and
 * uppercase unit suffixes are tolerated so the parser can consume typed user
 * input directly.
 */
export function parseLength(input: string): ParsedLength | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  if (trimmed === '') {
    return null;
  }

  const match = LENGTH_INPUT_RE.exec(trimmed);

  if (match === null) {
    return null;
  }

  const rawValue = match[1];
  const rawUnit = match[2];

  if (rawValue === undefined || rawUnit === undefined) {
    return null;
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const normalizedUnit = rawUnit.toLowerCase();

  if (!isLengthUnit(normalizedUnit)) {
    return null;
  }

  return {
    value: numericValue,
    unit: normalizedUnit,
  };
}

/** Produces a fully independent structural clone of the provided value. */
export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

const PATH_CLIP_RE = /^path\(\s*(?:["']([^"']*)["']|([^)]+))\s*\)$/;

/** Extracts raw SVG path data from a CSS `path(...)` clip-path string. */
export function parseClipPathData(clipPath: string): string | null {
  const match = PATH_CLIP_RE.exec(clipPath.trim());

  if (match === null) {
    return null;
  }

  const rawPathData = (match[1] ?? match[2] ?? '').trim();

  return rawPathData === '' ? null : rawPathData;
}

/** Serializes raw SVG path data into a CSS `path("...")` value. */
export function serializeClipPath(pathData: string): string {
  const escapedPathData = pathData.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `path("${escapedPathData}")`;
}

/**
 * Scales numeric coordinates inside an SVG path string by `zoom`, delegating
 * to svgpath so arc radii scale while arc rotation and flags are preserved.
 */
export function scalePathData(pathData: string, zoom: number): string {
  return svgpath(pathData).scale(zoom).round(PATH_SCALE_PRECISION).toString();
}

/** Generates a rectangle clip-path with a minimum non-zero size. */
export function generateDefaultClipPath(width: number, height: number): string {
  const safeWidth = Math.max(width, MIN_CLIP_DIMENSION);
  const safeHeight = Math.max(height, MIN_CLIP_DIMENSION);

  return `M 0 0 L ${String(safeWidth)} 0 L ${String(safeWidth)} ${String(safeHeight)} L 0 ${String(safeHeight)} Z`;
}

/**
 * Infers runtime edge anchors from an element's center point relative to the
 * canvas center. Ties intentionally resolve to right/bottom.
 */
export function computeEdgeAnchors(
  element: ElementRect,
  canvas: CanvasDimensions,
): { readonly anchorX: AnchorX; readonly anchorY: AnchorY } {
  const elementCenterX = element.x + element.width / 2;
  const elementCenterY = element.y + element.height / 2;
  const canvasCenterX = canvas.canvasWidth / 2;
  const canvasCenterY = canvas.canvasHeight / 2;

  const anchorX: AnchorX = elementCenterX < canvasCenterX ? 'left' : 'right';
  const anchorY: AnchorY = elementCenterY < canvasCenterY ? 'top' : 'bottom';

  return { anchorX, anchorY };
}
