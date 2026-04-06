import type { ElementPosition } from '@broadset/model';

const PX_PER_MM = 96 / 25.4;
const PX_PER_INCH = 96;
const MIN_NICE_INTERVAL = 1;
const NICE_INTERVAL_TWO = 2;
const NICE_INTERVAL_FIVE = 5;
const NICE_INTERVAL_TEN = 10;

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

function snapToNiceInterval(rawInterval: number): number {
  if (rawInterval <= 0) {
    return MIN_NICE_INTERVAL;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
  const normalizedInterval = rawInterval / magnitude;

  if (normalizedInterval <= MIN_NICE_INTERVAL) {
    return magnitude;
  }

  if (normalizedInterval <= NICE_INTERVAL_TWO) {
    return NICE_INTERVAL_TWO * magnitude;
  }

  if (normalizedInterval <= NICE_INTERVAL_FIVE) {
    return NICE_INTERVAL_FIVE * magnitude;
  }

  return NICE_INTERVAL_TEN * magnitude;
}

/** Computes the ids of all elements whose bounds intersect the marquee rectangle. */
export function computeMarqueeSelection(elements: readonly MarqueeElement[], marquee: MarqueeRect): readonly string[] {
  if (marquee.width <= 0 || marquee.height <= 0) {
    return [];
  }

  const marqueeRight = marquee.x + marquee.width;
  const marqueeBottom = marquee.y + marquee.height;

  return elements
    .filter((element) => {
      const elementRight = element.position.x + element.width;
      const elementBottom = element.position.y + element.height;

      return (
        element.position.x < marqueeRight &&
        elementRight > marquee.x &&
        element.position.y < marqueeBottom &&
        elementBottom > marquee.y
      );
    })
    .map((element) => element.id);
}

/** Computes logical grid-line positions for the canvas overlay at the configured grid interval. */
export function computeGridLines(options: GridLineOptions): readonly GridLine[] {
  if (options.gridSize <= 0 || options.zoom <= 0) {
    return [];
  }

  const lines: GridLine[] = [];
  const maxX = options.canvasWidth / options.zoom;
  const maxY = options.canvasHeight / options.zoom;

  for (let x = options.gridSize; x < maxX; x += options.gridSize) {
    lines.push({ position: x, axis: 'v' });
  }

  for (let y = options.gridSize; y < maxY; y += options.gridSize) {
    lines.push({ position: y, axis: 'h' });
  }

  return lines;
}

/** Computes ruler tick positions and labels using a readable nice-step interval for the current zoom level. */
export function computeRulerTicks(options: RulerTickOptions): readonly RulerTick[] {
  if (options.zoom <= 0 || options.length <= 0) {
    return [];
  }

  const pixelsPerUnit =
    options.unit === 'mm' ? PX_PER_MM
    : options.unit === 'in' ? PX_PER_INCH
    : 1;
  const targetPixelGap = 80;
  const rawUnitGap = targetPixelGap / (pixelsPerUnit * options.zoom);
  const tickInterval = snapToNiceInterval(rawUnitGap);
  const logicalLength = options.length / options.zoom;
  const startUnit = Math.ceil(options.origin / pixelsPerUnit / tickInterval) * tickInterval;
  const endUnit = (options.origin + logicalLength) / pixelsPerUnit;
  const ticks: RulerTick[] = [];

  for (let unitValue = startUnit; unitValue <= endUnit; unitValue += tickInterval) {
    const position = (unitValue * pixelsPerUnit - options.origin) * options.zoom;

    if (position >= 0 && position <= options.length) {
      ticks.push({
        position,
        label: String(Math.round(unitValue * 100) / 100),
      });
    }
  }

  return ticks;
}

/** Computes the unsafe-zone overlay rectangles for broadcast/print safety boundaries. */
export function computeSafetyBoundaries(options: SafetyBoundaryOptions): readonly SafetyRect[] {
  if (options.viewMode === 'none') {
    return [];
  }

  const [top, right, bottom, left] = options.padding;

  return [
    { x: 0, y: 0, width: options.canvasWidth, height: top },
    { x: options.canvasWidth - right, y: 0, width: right, height: options.canvasHeight },
    { x: 0, y: options.canvasHeight - bottom, width: options.canvasWidth, height: bottom },
    { x: 0, y: 0, width: left, height: options.canvasHeight },
  ];
}

/** Converts a logical text-element rect into screen-space coordinates for the inline editing overlay. */
export function computeInlineEditOverlay(options: InlineEditOptions): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return {
    x: options.elementRect.x * options.zoom + options.panX,
    y: options.elementRect.y * options.zoom + options.panY,
    width: options.elementRect.width * options.zoom,
    height: options.elementRect.height * options.zoom,
  };
}
