import type { AnchorX, AnchorY } from './screen';

// ---------------------------------------------------------------------------
// Deep clone
// ---------------------------------------------------------------------------

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

export function scalePathData(pathData: string, zoom: number): string {
  return pathData.replace(/-?\d+(?:\.\d+)?/g, (token) => {
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
