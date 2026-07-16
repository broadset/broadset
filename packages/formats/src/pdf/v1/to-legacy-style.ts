import type { BroadsetElementStyleInput, BroadsetGradient, projectFormatV1 } from '@broadset/model';
import { parseColor } from '@broadset/model';

interface LegacyStyleResultV1 {
  readonly style: BroadsetElementStyleInput;
  readonly warnings: readonly string[];
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function concreteColor(input: {
  readonly color: projectFormatV1.ColorValue;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): projectFormatV1.ConcreteColorValue | undefined {
  const color = input.color;

  if (color.kind === 'color') return color;

  const swatch = input.project.resources.swatches.find(({ id }) => id === color.swatchId);

  if (swatch === undefined) return undefined;

  return swatch.kind === 'process' ? swatch.color : swatch.alternateColor;
}

export function toLegacyCssColorV1(input: {
  readonly color: projectFormatV1.ColorValue;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): string | undefined {
  const color = concreteColor(input);

  if (color === undefined) return undefined;

  const alpha = clamp(color.alpha);

  if (color.space === 'gray') {
    const gray = Math.round(clamp(color.channels[0] ?? 0) * 255);

    return `rgba(${String(gray)}, ${String(gray)}, ${String(gray)}, ${String(alpha)})`;
  }

  if (color.space !== 'srgb' && color.space !== 'display-p3' && color.space !== 'rec2020') return undefined;

  const red = Math.round(clamp(color.channels[0] ?? 0) * 255);
  const green = Math.round(clamp(color.channels[1] ?? 0) * 255);
  const blue = Math.round(clamp(color.channels[2] ?? 0) * 255);

  return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(alpha)})`;
}

function legacyColor(input: {
  readonly color: projectFormatV1.ColorValue;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): ReturnType<typeof parseColor> | undefined {
  const css = toLegacyCssColorV1(input);

  if (css === undefined) return undefined;

  try {
    return parseColor(css);
  } catch {
    return undefined;
  }
}

function legacyGradient(input: {
  readonly gradient: projectFormatV1.Gradient;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): BroadsetGradient {
  const stops = input.gradient.stops.map((stop) => ({
    color: legacyColor({ color: stop.color, project: input.project }) ?? parseColor('#000000'),
    position: clamp(stop.offset) * 100,
  }));
  const center: readonly [number, number] | undefined =
    'center' in input.gradient ? [input.gradient.center[0] * 100, input.gradient.center[1] * 100] : undefined;
  const type = input.gradient.kind === 'producer-preserved' ? 'linear' : input.gradient.kind;
  const angle =
    input.gradient.kind === 'linear' ?
      (Math.atan2(input.gradient.end[1] - input.gradient.start[1], input.gradient.end[0] - input.gradient.start[0]) *
        180) /
      Math.PI
    : undefined;
  const startAngle = input.gradient.kind === 'conic' ? input.gradient.startAngle : undefined;

  return {
    type: type === 'diamond' ? 'radial' : type,
    stops,
    ...(angle === undefined ? {} : { angle: angle < 0 ? angle + 360 : angle }),
    ...(center === undefined ? {} : { center }),
    ...(startAngle === undefined ? {} : { startAngle }),
  };
}

function gradientFill(input: {
  readonly gradient: projectFormatV1.Gradient;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): BroadsetElementStyleInput['fill'] {
  return { kind: 'gradient', gradient: legacyGradient(input) };
}

export function toLegacyBackgroundV1(input: {
  readonly paint: projectFormatV1.Paint;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): {
  readonly backgroundMode: 'transparent' | 'solid' | 'gradient';
  readonly backgroundColor?: string;
  readonly backgroundGradient?: BroadsetGradient;
  readonly warnings: readonly string[];
} {
  if (input.paint.kind === 'solid') {
    const backgroundColor = toLegacyCssColorV1({ color: input.paint.color, project: input.project });
    const concrete = concreteColor({ color: input.paint.color, project: input.project });
    const warnings =
      concrete !== undefined && !['srgb', 'gray'].includes(concrete.space) ?
        ['PDF v1 export: a non-sRGB surface color used a diagnosed channel fallback.']
      : [];

    return backgroundColor === undefined ?
        {
          backgroundMode: 'transparent',
          warnings: ['PDF v1 export: the surface color space used a transparent fallback.'],
        }
      : { backgroundMode: 'solid', backgroundColor, warnings };
  }

  if (input.paint.kind === 'gradient') {
    return {
      backgroundMode: 'gradient',
      backgroundGradient: legacyGradient({ gradient: input.paint.gradient, project: input.project }),
      warnings: [],
    };
  }

  if (input.paint.kind === 'none') return { backgroundMode: 'transparent', warnings: [] };

  return {
    backgroundMode: 'transparent',
    warnings: ['PDF v1 export: pattern or picture surface paint used a transparent fallback.'],
  };
}

function fill(input: {
  readonly appearance: projectFormatV1.Appearance;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): BroadsetElementStyleInput['fill'] {
  const layer = input.appearance.fills.find(({ enabled }) => enabled);

  if (layer === undefined || layer.paint.kind === 'none') return { kind: 'none' };

  if (layer.paint.kind === 'solid') {
    const color = legacyColor({ color: layer.paint.color, project: input.project });

    return color === undefined ? { kind: 'none' } : { kind: 'solid', color };
  }

  if (layer.paint.kind === 'gradient') {
    return gradientFill({ gradient: layer.paint.gradient, project: input.project });
  }

  return { kind: 'none' };
}

function unsupportedWarnings(appearance: projectFormatV1.Appearance): readonly string[] {
  const warnings: string[] = [];

  if (appearance.fills.some(({ paint }) => paint.kind === 'pattern' || paint.kind === 'picture')) {
    warnings.push('PDF v1 export: pattern or picture paint used a safe no-fill fallback.');
  }

  if (appearance.effects.length > 0) {
    warnings.push('PDF v1 export: unsupported effects remain in the v1 source and were omitted.');
  }

  const colorValues = [
    ...appearance.fills.flatMap(({ paint }) => {
      if (paint.kind === 'solid') return [paint.color];
      if (paint.kind === 'gradient') return paint.gradient.stops.map(({ color }) => color);

      return [];
    }),
    ...appearance.strokes.flatMap(({ paint }) => (paint.kind === 'solid' ? [paint.color] : [])),
  ];

  if (colorValues.some((color) => color.kind === 'color' && !['srgb', 'gray'].includes(color.space))) {
    warnings.push('PDF v1 export: a non-sRGB color used a diagnosed channel fallback.');
  }

  if (colorValues.some((color) => color.kind === 'swatch')) {
    warnings.push('PDF v1 export: swatch identity remains in v1 while the resolved color was emitted.');
  }

  return warnings;
}

export function toLegacyStyleV1(input: {
  readonly appearance: projectFormatV1.Appearance;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): LegacyStyleResultV1 {
  const stroke = input.appearance.strokes.find(({ enabled, paint }) => enabled && paint.kind === 'solid');
  const strokeColor =
    stroke?.paint.kind === 'solid' ? legacyColor({ color: stroke.paint.color, project: input.project }) : undefined;
  const fillLayer = input.appearance.fills.find(({ enabled }) => enabled);

  return {
    style: {
      opacity: clamp(input.appearance.opacity),
      fill: fill(input),
      ...(fillLayer === undefined ? {} : { fillOpacity: clamp(fillLayer.opacity) }),
      ...(strokeColor === undefined ? {} : { stroke: strokeColor, borderColor: strokeColor }),
      ...(stroke === undefined ?
        {}
      : {
          strokeWidth: Math.max(0, stroke.width),
          borderWidth: Math.max(0, stroke.width),
          strokeLinecap: stroke.cap,
          strokeLinejoin: stroke.join,
          strokeMiterlimit: stroke.miterLimit,
          strokeDasharray: stroke.dash.join(' '),
          strokeDashoffset: stroke.dashOffset,
          strokeOpacity: clamp(stroke.opacity),
        }),
      mixBlendMode: input.appearance.blendMode,
      isolation: input.appearance.isolation ? 'isolate' : 'auto',
    },
    warnings: unsupportedWarnings(input.appearance),
  };
}
