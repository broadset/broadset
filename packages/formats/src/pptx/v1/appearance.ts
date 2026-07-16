import { projectFormatV1 } from '@broadset/model';

import { parseCssColor } from '../../pdf/color';
import type { PptxSourceColor, PptxSourceStyle } from '../project-model';

function colorValue(color: PptxSourceColor | undefined): projectFormatV1.ColorValue | undefined {
  if (color?.kind !== 'rgb') return undefined;

  const parsed = parseCssColor(color.originalColor ?? color.hex);

  if (parsed === undefined) return undefined;

  return { kind: 'color', space: 'srgb', channels: [parsed.r, parsed.g, parsed.b], alpha: parsed.a };
}

function opacity(value: number | undefined, fallback = 1): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.min(1, Math.max(0, value));
}

function gradientPaint(input: {
  readonly style: PptxSourceStyle;
  readonly elementId: projectFormatV1.Id;
}): projectFormatV1.Paint | undefined {
  if (input.style.fill.kind !== 'gradient') return undefined;

  const source = input.style.fill.gradient;
  const stops: projectFormatV1.GradientStop[] = source.stops.map((stop, index) => ({
    id: projectFormatV1.idSchema.parse(`${input.elementId}-gradient-stop-${String(index + 1)}`),
    color: colorValue(stop.color) ?? projectFormatV1.createBlackColorValue(),
    opacity: 1,
    offset: stop.position / 100,
  }));
  const common: {
    readonly stops: readonly projectFormatV1.GradientStop[];
    readonly coordinateSpace: 'object-bounds';
    readonly transform: projectFormatV1.Affine2D;
    readonly spread: 'pad';
    readonly interpolation: 'srgb';
  } = {
    stops,
    coordinateSpace: 'object-bounds',
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
    spread: 'pad',
    interpolation: 'srgb',
  };

  if (source.type === 'radial') {
    const center = source.center ?? [50, 50];

    return {
      kind: 'gradient',
      gradient: { ...common, kind: 'radial', center: [center[0] / 100, center[1] / 100], radius: [0.5, 0.5] },
    };
  }

  if (source.type === 'conic') {
    const center = source.center ?? [50, 50];

    return {
      kind: 'gradient',
      gradient: {
        ...common,
        kind: 'conic',
        center: [center[0] / 100, center[1] / 100],
        startAngle: source.startAngle ?? 0,
      },
    };
  }

  const radians = ((source.angle ?? 0) * Math.PI) / 180;
  const x = Math.cos(radians) / 2;
  const y = Math.sin(radians) / 2;

  return {
    kind: 'gradient',
    gradient: { ...common, kind: 'linear', start: [0.5 - x, 0.5 - y], end: [0.5 + x, 0.5 + y] },
  };
}

function fillPaint(input: {
  readonly style: PptxSourceStyle;
  readonly elementId: projectFormatV1.Id;
}): projectFormatV1.Paint | undefined {
  if (input.style.fill.kind === 'solid') {
    const color = colorValue(input.style.fill.color);

    return color === undefined ? undefined : { kind: 'solid', color };
  }

  return gradientPaint(input);
}

function arrow(source: PptxSourceStyle['strokeHeadEnd']): projectFormatV1.ArrowEnding | undefined {
  if (source === undefined || source.shape === 'none') return undefined;

  const kind = source.shape === 'oval' ? 'circle' : source.shape;
  const sizes = { sm: 0.75, md: 1, lg: 1.5 };

  return {
    kind,
    ...(source.length === undefined ? {} : { length: sizes[source.length] }),
    ...(source.width === undefined ? {} : { width: sizes[source.width] }),
  };
}

function dash(value: string | undefined): readonly number[] {
  if (value === undefined || value === 'none') return [];

  return value
    .split(/[ ,]+/u)
    .map(Number)
    .filter((part) => Number.isFinite(part) && part >= 0);
}

export function pptxAppearanceWarningsV1(style: PptxSourceStyle): readonly projectFormatV1.InteropDiagnostic[] {
  const warnings: projectFormatV1.InteropDiagnostic[] = [];
  const colors = [
    style.fontColor,
    style.stroke,
    style.borderColor,
    ...(style.fill.kind === 'solid' ? [style.fill.color] : []),
    ...(style.fill.kind === 'gradient' ? style.fill.gradient.stops.map(({ color }) => color) : []),
  ];

  if (colors.some((color) => color?.kind === 'theme')) {
    warnings.push({
      code: 'pptx.theme-color-preserved',
      severity: 'warning',
      message: 'PPTX theme color identity remains in the preserved source while v1 uses a safe concrete fallback.',
      dimension: 'appearance',
      pointer: '/',
    });
  }

  if (style.boxShadow !== undefined || style.filter !== undefined || style.backdropFilter !== undefined) {
    warnings.push({
      code: 'pptx.effects-partial',
      severity: 'warning',
      message: 'PPTX effects remain in the preserved source and are not independently editable.',
      dimension: 'appearance',
      pointer: '/',
    });
  }

  return warnings;
}

export function mapPptxAppearanceV1(input: {
  readonly style: PptxSourceStyle;
  readonly elementId: projectFormatV1.Id;
}): projectFormatV1.Appearance {
  const fill = fillPaint(input);
  const stroke = colorValue(input.style.stroke ?? input.style.borderColor);
  const startArrow = arrow(input.style.strokeTailEnd);
  const endArrow = arrow(input.style.strokeHeadEnd);
  const fills: readonly projectFormatV1.FillLayer[] =
    fill === undefined ?
      []
    : [
        {
          id: projectFormatV1.idSchema.parse(`${input.elementId}-fill`),
          enabled: true,
          opacity: opacity(input.style.fillOpacity),
          blendMode: 'normal',
          paint: fill,
        },
      ];
  const strokes: readonly projectFormatV1.StrokeLayer[] =
    stroke === undefined ?
      []
    : [
        {
          id: projectFormatV1.idSchema.parse(`${input.elementId}-stroke`),
          enabled: true,
          opacity: opacity(input.style.strokeOpacity),
          blendMode: 'normal',
          paint: { kind: 'solid', color: stroke },
          width: Math.max(0, input.style.strokeWidth ?? input.style.borderWidth ?? 1),
          alignment: 'center',
          cap: input.style.strokeLinecap ?? 'butt',
          join: input.style.strokeLinejoin ?? 'miter',
          miterLimit: Math.max(0, input.style.strokeMiterlimit ?? 4),
          dash: dash(input.style.strokeDasharray),
          dashOffset: input.style.strokeDashoffset ?? 0,
          ...(startArrow === undefined ? {} : { startArrow }),
          ...(endArrow === undefined ? {} : { endArrow }),
        },
      ];

  return {
    opacity: opacity(input.style.opacity),
    blendMode: input.style.mixBlendMode ?? 'normal',
    isolation: input.style.isolation === 'isolate',
    fills,
    strokes,
    effects: [],
  };
}
