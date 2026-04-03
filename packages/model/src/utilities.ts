import type { AnchorX, AnchorY } from './screen';

// ---------------------------------------------------------------------------
// Unit conversion — 96 DPI standard web convention
// ---------------------------------------------------------------------------

const MM_PER_INCH = 25.4;
const PX_PER_INCH = 96;

export function pxToMm(px: number): number {
  return (px * MM_PER_INCH) / PX_PER_INCH;
}

export function mmToPx(mm: number): number {
  return (mm * PX_PER_INCH) / MM_PER_INCH;
}

// ---------------------------------------------------------------------------
// Deep clone
// ---------------------------------------------------------------------------

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

// ---------------------------------------------------------------------------
// Clip-path parsing / serialization
// ---------------------------------------------------------------------------

const PATH_RE = /^path\(\s*(?:["']([^"']*)["']|([^)]+))\s*\)$/;

export function parseClipPathData(clipPath: string): string | null {
  const match = PATH_RE.exec(clipPath.trim());

  if (!match) {
    return null;
  }

  return (match[1] ?? match[2] ?? '').trim() || null;
}

export function serializeClipPath(pathData: string): string {
  return `path("${pathData}")`;
}

// ---------------------------------------------------------------------------
// Path zoom scaling
// ---------------------------------------------------------------------------

/** Parameter counts per SVG path command. */
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

/** Arc parameter indices that must NOT be scaled (x-rotation, large-arc-flag, sweep-flag). */
const ARC_NO_SCALE_INDICES = new Set([2, 3, 4]);

/**
 * Scales coordinate values in an SVG path data string by `zoom`.
 * Arc command flags and rotation angle are preserved unscaled.
 */
export function scalePathData(pathData: string, zoom: number): string {
  let currentCmd = '';
  let paramIndex = 0;

  return pathData.replace(/[MmLlHhVvCcSsQqTtAaZz]|-?\d+(?:\.\d+)?/g, (token) => {
    // SVG command letter
    if (token.length === 1 && token in SVG_PARAM_COUNTS) {
      currentCmd = token;
      paramIndex = 0;

      return token;
    }

    // Number token — decide whether to scale
    const isArc = currentCmd === 'A' || currentCmd === 'a';
    const shouldScale = !(isArc && ARC_NO_SCALE_INDICES.has(paramIndex));

    paramIndex++;

    const count = SVG_PARAM_COUNTS[currentCmd];

    if (count !== undefined && count > 0 && paramIndex >= count) {
      paramIndex = 0;
    }

    if (!shouldScale) {
      return token;
    }

    const scaled = Number(token) * zoom;
    const rounded = Math.round(scaled * 100) / 100;

    return String(rounded);
  });
}

// ---------------------------------------------------------------------------
// Default clip path
// ---------------------------------------------------------------------------

const MIN_DIMENSION = 1;

export function generateDefaultClipPath(width: number, height: number): string {
  const w = Math.max(width, MIN_DIMENSION);
  const h = Math.max(height, MIN_DIMENSION);

  return `M 0 0 L ${String(w)} 0 L ${String(w)} ${String(h)} L 0 ${String(h)} Z`;
}

// ---------------------------------------------------------------------------
// Edge anchor inference
// ---------------------------------------------------------------------------

interface ElementRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface CanvasDimensions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export function computeEdgeAnchors(
  element: ElementRect,
  canvas: CanvasDimensions,
): { anchorX: AnchorX; anchorY: AnchorY } {
  const elementCenterX = element.x + element.width / 2;
  const elementCenterY = element.y + element.height / 2;
  const canvasCenterX = canvas.canvasWidth / 2;
  const canvasCenterY = canvas.canvasHeight / 2;

  const anchorX: AnchorX = elementCenterX < canvasCenterX ? 'left' : 'right';
  const anchorY: AnchorY = elementCenterY < canvasCenterY ? 'top' : 'bottom';

  return { anchorX, anchorY };
}
