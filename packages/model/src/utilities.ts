export type AnchorX = 'left' | 'right';
export type AnchorY = 'top' | 'bottom';

const MILLIMETRES_PER_INCH = 25.4;
const DEFAULT_DPI = 96;
const DEFAULT_SCALE_PRECISION = 100;
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

const SVG_PARAM_COUNTS: Readonly<Record<string, number>> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
  Z: 0,
  z: 0,
};

const ARC_NON_SCALED_PARAMETER_INDICES = new Set([2, 3, 4]);

/**
 * Scales numeric coordinates inside an SVG path string by `zoom`.
 * Arc rotation and arc flags are preserved unscaled.
 */
export function scalePathData(pathData: string, zoom: number): string {
  let currentCommand = '';
  let parameterIndex = 0;

  return pathData.replace(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?/g, (token) => {
    if (token.length === 1 && token in SVG_PARAM_COUNTS) {
      currentCommand = token;
      parameterIndex = 0;

      return token;
    }

    const isArcCommand = currentCommand === 'A' || currentCommand === 'a';
    const shouldScale = !(isArcCommand && ARC_NON_SCALED_PARAMETER_INDICES.has(parameterIndex));

    parameterIndex += 1;

    const parameterCount = SVG_PARAM_COUNTS[currentCommand];

    if (parameterCount !== undefined && parameterCount > 0 && parameterIndex >= parameterCount) {
      parameterIndex = 0;
    }

    if (!shouldScale) {
      return token;
    }

    const scaledValue = Number(token) * zoom;
    const roundedValue = Math.round(scaledValue * DEFAULT_SCALE_PRECISION) / DEFAULT_SCALE_PRECISION;

    return String(roundedValue);
  });
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
