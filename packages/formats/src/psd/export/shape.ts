import type { BroadsetElement } from '@broadset/model';
import { getGradientFillGradient, getSolidFillColor, resolveStyleColor } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { parseHexColor } from '../color-utils';
import { buildEllipseMask, buildRectangleMask } from '../vector-mask';

interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

interface GradientStop {
  readonly color: RgbaColor;
  readonly position: number;
}

type ShapePainter = (x: number, y: number) => RgbaColor | undefined;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function resolveColor(value: Parameters<typeof resolveStyleColor>[0]): RgbaColor | undefined {
  const css = resolveStyleColor(value, { resolveTheme: false });

  return css === undefined ? undefined : parseHexColor(css);
}

function gradientAxisPosition(el: BroadsetElement, angle: number, x: number, y: number): number {
  const localX = el.width <= 0 ? 0 : (x / el.width) * 100;
  const localY = el.height <= 0 ? 0 : (y / el.height) * 100;

  if (angle === 90) return localX;
  if (angle === 270) return 100 - localX;
  if (angle === 0) return 100 - localY;

  return localY;
}

function interpolateStops(stops: readonly GradientStop[], position: number): RgbaColor | undefined {
  const first = stops[0];
  const last = stops[stops.length - 1];

  if (first === undefined || last === undefined) return undefined;

  if (position <= first.position) return first.color;
  if (position >= last.position) return last.color;

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const next = stops[index];

    if (previous === undefined || next === undefined || position > next.position) continue;

    const span = next.position - previous.position;
    const t = span === 0 ? 0 : (position - previous.position) / span;

    return {
      r: previous.color.r + (next.color.r - previous.color.r) * t,
      g: previous.color.g + (next.color.g - previous.color.g) * t,
      b: previous.color.b + (next.color.b - previous.color.b) * t,
      a: previous.color.a + (next.color.a - previous.color.a) * t,
    };
  }

  return last.color;
}

function createShapePainter(el: BroadsetElement): ShapePainter {
  const solid = resolveColor(getSolidFillColor(el.style.fill));

  if (solid !== undefined) {
    return () => solid;
  }

  const gradient = getGradientFillGradient(el.style.fill);

  if (gradient === undefined) {
    return () => undefined;
  }

  const stops = gradient.stops
    .map((stop) => ({ color: resolveColor(stop.color), position: stop.position }))
    .filter((stop): stop is GradientStop => stop.color !== undefined)
    .sort((left, right) => left.position - right.position);
  const angle = (((gradient.angle ?? 180) % 360) + 360) % 360;

  return (x, y) => interpolateStops(stops, gradientAxisPosition(el, angle, x, y));
}

function createShapePixels(el: BroadsetElement): {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
} {
  const width = Math.max(1, Math.round(el.width));
  const height = Math.max(1, Math.round(el.height));
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = createShapePainter(el);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (el.type === 'ellipse') {
        const dx = (x + 0.5 - width / 2) / (width / 2);
        const dy = (y + 0.5 - height / 2) / (height / 2);

        if (dx * dx + dy * dy > 1) continue;
      }

      const color = paint(x + 0.5, y + 0.5);

      if (color === undefined) continue;

      const offset = (y * width + x) * 4;

      data[offset] = clampByte(color.r);
      data[offset + 1] = clampByte(color.g);
      data[offset + 2] = clampByte(color.b);
      data[offset + 3] = clampByte(color.a * 255);
    }
  }

  return { width, height, data };
}

export function applyShapeFill(layer: Layer, el: BroadsetElement): void {
  const backgroundColorCss = resolveStyleColor(getSolidFillColor(el.style.fill), { resolveTheme: false });
  const color = backgroundColorCss === undefined ? undefined : parseHexColor(backgroundColorCss);

  if (color !== undefined) {
    layer.vectorFill = { type: 'color', color };
  }

  // Stroke styling survives the fill — applyStroke may add vectorStroke
  // separately below.
  if (el.type === 'rectangle' && el.style.borderRadius === undefined) {
    layer.vectorMask = { paths: [buildRectangleMask(el.width, el.height)] };
  } else if (el.type === 'ellipse') {
    layer.vectorMask = { paths: [buildEllipseMask(el.width, el.height)] };
  }
  // Rounded rectangles flow through `applyVectorMasks` above, which
  // already emits the rounded-rect path via `buildRoundedRectMask`.

  layer.imageData = createShapePixels(el);
}
