import {
  type BroadsetColor,
  type BroadsetElementStyleInput,
  colorToCss,
  projectFormatV1,
} from '@broadset/model';

import { mapCssColorV1 } from './paint-color';
import type { SvgSourceDetailsV1 } from './types';

const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_MITER_LIMIT = 4;

function clampOpacity(value: number | undefined, fallback = 1): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.min(1, Math.max(0, value));
}

function colorValue(color: string): projectFormatV1.ColorValue {
  return mapCssColorV1(color);
}

function broadsetColorValue(color: BroadsetColor): projectFormatV1.ColorValue {
  try {
    return colorValue(colorToCss(color));
  } catch {
    return colorValue('#00000000');
  }
}

function mapStrokeColor(stroke: BroadsetElementStyleInput['stroke']): projectFormatV1.ColorValue | undefined {
  if (stroke === undefined || stroke === 'none') return undefined;

  return typeof stroke === 'string' ? colorValue(stroke) : broadsetColorValue(stroke);
}

function fillColor(style: Partial<BroadsetElementStyleInput>): {
  readonly color: projectFormatV1.ColorValue | undefined;
  readonly fallback: boolean;
} {
  const fill = style.fill;

  if (fill === undefined && typeof style.backgroundGradient === 'object') {
    const first = style.backgroundGradient.stops[0];

    return { color: first === undefined ? colorValue('#00000000') : broadsetColorValue(first.color), fallback: true };
  }

  if (fill === undefined || fill === 'none') return { color: undefined, fallback: false };
  if (typeof fill === 'string') return { color: colorValue(fill), fallback: fill.startsWith('url(') };
  if (fill.kind === 'none') return { color: undefined, fallback: false };
  if (fill.kind === 'solid') return { color: broadsetColorValue(fill.color), fallback: false };

  if (fill.kind === 'gradient') {
    const first = fill.gradient.stops[0];

    return { color: first === undefined ? colorValue('#00000000') : broadsetColorValue(first.color), fallback: true };
  }

  return { color: colorValue('#00000000'), fallback: true };
}

function parseDash(value: string | undefined): readonly number[] {
  if (value === undefined || value === 'none') return [];

  return value
    .split(/[ ,]+/u)
    .map(Number)
    .filter((part) => Number.isFinite(part) && part >= 0);
}

export function mapAppearanceV1(input: {
  readonly style: Partial<BroadsetElementStyleInput>;
  readonly source: SvgSourceDetailsV1;
  readonly elementId: projectFormatV1.Id;
}): { readonly appearance: projectFormatV1.Appearance; readonly fallback: boolean } {
  const fill = fillColor(input.style);
  const fillOpacity = clampOpacity(input.source.fillOpacity ?? input.style.fillOpacity);
  const strokeOpacity = clampOpacity(input.source.strokeOpacity ?? input.style.strokeOpacity);
  const effectiveFillColor = fill.color ?? (input.source.hasPaintServer ? colorValue('#00000000') : undefined);
  const fills: projectFormatV1.FillLayer[] =
    effectiveFillColor === undefined ? [] : [{
      id: projectFormatV1.idSchema.parse(`${input.elementId}-fill`),
      enabled: true,
      opacity: fillOpacity,
      blendMode: 'normal',
      paint: { kind: 'solid', color: effectiveFillColor },
    }];
  const stroke = input.style.stroke;
  const strokeColor = mapStrokeColor(stroke);
  const strokes: projectFormatV1.StrokeLayer[] =
    strokeColor === undefined ? [] : [{
      id: projectFormatV1.idSchema.parse(`${input.elementId}-stroke`),
      enabled: true,
      opacity: strokeOpacity,
      blendMode: 'normal',
      paint: { kind: 'solid', color: strokeColor },
      width: Math.max(0, input.style.strokeWidth ?? DEFAULT_STROKE_WIDTH),
      alignment: 'center',
      cap: input.style.strokeLinecap ?? 'butt',
      join: input.style.strokeLinejoin ?? 'miter',
      miterLimit: Math.max(0, input.style.strokeMiterlimit ?? DEFAULT_MITER_LIMIT),
      dash: parseDash(input.style.strokeDasharray),
      dashOffset: input.style.strokeDashoffset ?? 0,
    }];
  const fallback = fill.fallback || input.source.hasPaintServer || input.source.hasFilter || input.source.hasClipPath || input.source.hasMask;

  return {
    appearance: {
      opacity: clampOpacity(input.source.opacity ?? input.style.opacity),
      blendMode: 'normal',
      isolation: input.style.isolation === 'isolate',
      fills,
      strokes,
      effects: [],
    },
    fallback,
  };
}
