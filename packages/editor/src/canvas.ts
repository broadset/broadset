import type { ElementPosition } from '@broadset/model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PX_PER_MM = 96 / 25.4;
const PX_PER_INCH = 96;

// ---------------------------------------------------------------------------
// Marquee Selection
// ---------------------------------------------------------------------------

interface MarqueeElement {
  readonly id: string;
  readonly position: ElementPosition;
  readonly width: number;
  readonly height: number;
}

interface MarqueeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Computes which elements' bounding boxes intersect the given marquee
 * rectangle. Returns the IDs of selected elements.
 */
export function computeMarqueeSelection(elements: readonly MarqueeElement[], marquee: MarqueeRect): readonly string[] {
  if (marquee.width <= 0 || marquee.height <= 0) return [];

  const mx2 = marquee.x + marquee.width;
  const my2 = marquee.y + marquee.height;

  return elements
    .filter((el) => {
      const ex2 = el.position.x + el.width;
      const ey2 = el.position.y + el.height;

      return el.position.x < mx2 && ex2 > marquee.x && el.position.y < my2 && ey2 > marquee.y;
    })
    .map((el) => el.id);
}

// ---------------------------------------------------------------------------
// Grid Line Computation
// ---------------------------------------------------------------------------

export interface GridLine {
  readonly position: number;
  readonly axis: 'h' | 'v';
}

interface GridLineOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly gridSize: number;
  readonly zoom: number;
}

/**
 * Computes grid line positions for the canvas overlay. Returns positions
 * in logical (unzoomed) coordinates at the configured grid interval.
 */
export function computeGridLines(options: GridLineOptions): readonly GridLine[] {
  const { canvasWidth, canvasHeight, gridSize, zoom } = options;

  if (gridSize <= 0 || zoom <= 0) return [];

  const lines: GridLine[] = [];

  // Vertical lines (along x-axis)
  const maxX = canvasWidth / zoom;

  for (let x = gridSize; x < maxX; x += gridSize) {
    lines.push({ position: x, axis: 'v' });
  }

  // Horizontal lines (along y-axis)
  const maxY = canvasHeight / zoom;

  for (let y = gridSize; y < maxY; y += gridSize) {
    lines.push({ position: y, axis: 'h' });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Ruler Tick Computation
// ---------------------------------------------------------------------------

export interface RulerTick {
  readonly position: number;
  readonly label: string;
}

interface RulerTickOptions {
  readonly length: number;
  readonly unit: 'px' | 'mm' | 'in';
  readonly zoom: number;
  readonly origin: number;
}

/**
 * Computes ruler tick positions and labels in the current unit system.
 * The origin offsets the label values so rulers align with the user's
 * configured origin point.
 */
export function computeRulerTicks(options: RulerTickOptions): readonly RulerTick[] {
  const { length, unit, zoom, origin } = options;

  if (zoom <= 0 || length <= 0) return [];

  const pxPerUnit =
    unit === 'mm' ? PX_PER_MM
    : unit === 'in' ? PX_PER_INCH
    : 1;

  // Determine a good tick interval in units (aiming for ~50-100px between ticks)
  const targetPxGap = 80;
  const unitGapRaw = targetPxGap / (pxPerUnit * zoom);
  const tickInterval = snapToNiceInterval(unitGapRaw);

  if (tickInterval <= 0) return [];

  const logicalLength = length / zoom;
  const ticks: RulerTick[] = [];

  const startUnit = Math.ceil(origin / pxPerUnit / tickInterval) * tickInterval;
  const endUnit = (origin + logicalLength) / pxPerUnit;

  for (let u = startUnit; u <= endUnit; u += tickInterval) {
    const pos = (u * pxPerUnit - origin) * zoom;

    if (pos >= 0 && pos <= length) {
      ticks.push({ position: pos, label: String(Math.round(u * 100) / 100) });
    }
  }

  return ticks;
}

/** Snaps a raw interval to a "nice" value (1, 2, 5, 10, 20, 50, …). */
function snapToNiceInterval(raw: number): number {
  if (raw <= 0) return 1;

  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;

  return 10 * magnitude;
}

// ---------------------------------------------------------------------------
// Safety Boundary Computation
// ---------------------------------------------------------------------------

export interface SafetyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface SafetyBoundaryOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly padding: readonly [number, number, number, number];
  readonly viewMode: 'broadcast' | 'print' | 'none';
}

/**
 * Computes safety boundary overlay rectangles. Returns four rectangles
 * (top, right, bottom, left) representing the unsafe zones, or an
 * empty array for 'none' mode.
 */
export function computeSafetyBoundaries(options: SafetyBoundaryOptions): readonly SafetyRect[] {
  const { canvasWidth, canvasHeight, padding, viewMode } = options;

  if (viewMode === 'none') return [];

  const [top, right, bottom, left] = padding;

  return [
    // Top
    { x: 0, y: 0, width: canvasWidth, height: top },
    // Right
    { x: canvasWidth - right, y: 0, width: right, height: canvasHeight },
    // Bottom
    { x: 0, y: canvasHeight - bottom, width: canvasWidth, height: bottom },
    // Left
    { x: 0, y: 0, width: left, height: canvasHeight },
  ];
}

// ---------------------------------------------------------------------------
// Inline Edit Overlay (Zoom Compensation)
// ---------------------------------------------------------------------------

interface InlineEditOptions {
  readonly elementRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/**
 * Converts an element's logical bounding box into screen-space coordinates,
 * accounting for zoom and pan. Used to position the contenteditable overlay
 * during inline text editing.
 */
export function computeInlineEditOverlay(options: InlineEditOptions): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const { elementRect, zoom, panX, panY } = options;

  return {
    x: elementRect.x * zoom + panX,
    y: elementRect.y * zoom + panY,
    width: elementRect.width * zoom,
    height: elementRect.height * zoom,
  };
}
