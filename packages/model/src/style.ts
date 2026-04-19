import { z } from 'zod';

import { normalizeColor } from './color';

export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';
export type FillRule = 'nonzero' | 'evenodd';
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';
export type FontStyle = 'normal' | 'italic' | 'oblique';
export type ObjectFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
export type MixBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';
export type Isolation = 'auto' | 'isolate';
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type MaskStyleType = 'none' | 'alpha' | 'luminance' | 'custom';
export type WritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

/** CSS shorthand order: [topLeft, topRight, bottomRight, bottomLeft]. */
export type BorderRadiusTuple = readonly [number, number, number, number];
/** Padding order: [top, right, bottom, left]. */
export type PaddingTuple = readonly [number, number, number, number];

export interface BroadsetGradientStop {
  readonly color: string;
  readonly position: number;
}

export interface BroadsetGradient {
  readonly type: 'linear' | 'radial' | 'conic';
  readonly stops: readonly BroadsetGradientStop[];
  readonly angle?: number | undefined;
  readonly center?: readonly [number, number] | undefined;
}

export type BackgroundGradientValue = string | BroadsetGradient | undefined;

export interface BroadsetElementStyle {
  readonly opacity: number;
  readonly fontFamily?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly fontColor?: string | undefined;
  readonly fontWeight?: FontWeight | undefined;
  readonly fontStyle?: FontStyle | undefined;
  readonly textAlignment?: TextAlignment | undefined;
  readonly textDecoration?: string | undefined;
  readonly textTransform?: string | undefined;
  readonly letterSpacing?: number | undefined;
  readonly lineHeight?: number | string | undefined;
  readonly wordSpacing?: number | undefined;
  readonly textStroke?: string | undefined;
  readonly textShadow?: string | undefined;
  readonly backgroundColor?: string | undefined;
  readonly backgroundGradient?: BackgroundGradientValue;
  readonly borderWidth?: number | undefined;
  readonly borderColor?: string | undefined;
  readonly borderRadius?: BorderRadiusTuple | undefined;
  readonly borderStyle?: BorderStyle | undefined;
  readonly boxShadow?: string | undefined;
  readonly filter?: string | undefined;
  readonly backdropFilter?: string | undefined;
  readonly mixBlendMode?: MixBlendMode | undefined;
  readonly isolation?: Isolation | undefined;
  readonly padding?: PaddingTuple | undefined;
  readonly objectFit?: ObjectFit | undefined;
  readonly stroke?: string | undefined;
  readonly strokeWidth?: number | undefined;
  readonly strokeDasharray?: string | undefined;
  readonly strokeDashoffset?: number | undefined;
  readonly strokeLinecap?: StrokeLinecap | undefined;
  readonly strokeLinejoin?: StrokeLinejoin | undefined;
  readonly strokeOpacity?: number | undefined;
  readonly fill?: string | undefined;
  readonly fillOpacity?: number | undefined;
  readonly fillRule?: FillRule | undefined;
  readonly maskType?: MaskStyleType | undefined;
  readonly customClipPath?: string | undefined;
  readonly clipChildren?: boolean | undefined;
  readonly rotateX?: number | undefined;
  readonly rotateY?: number | undefined;
  readonly rotateZ?: number | undefined;
  readonly translateZ?: number | undefined;
  readonly fontVariationSettings?: string | undefined;
  readonly writingMode?: WritingMode | undefined;
  readonly verticalAlignment?: VerticalAlignment | undefined;
  readonly trimStart?: number | undefined;
  readonly trimEnd?: number | undefined;
  readonly trimOffset?: number | undefined;
}

const FONT_WEIGHT_VALUES = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const BORDER_STYLE_VALUES = [
  'none',
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
] as const;
const BLEND_MODE_VALUES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

/**
 * Normalizes a border radius value to a 4-tuple.
 * A single numeric value expands to four equal corners.
 */
export function normalizeBorderRadius(value: number | BorderRadiusTuple): BorderRadiusTuple {
  return typeof value === 'number' ? [value, value, value, value] : value;
}

/** Returns true when all four border-radius corners are equal. */
export function isBorderRadiusUniform(radius: BorderRadiusTuple): boolean {
  return radius[0] === radius[1] && radius[1] === radius[2] && radius[2] === radius[3];
}

function maybeNormalizeColor(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return normalizeColor(value);
  } catch {
    return value;
  }
}

function normalizeBackgroundGradient(value: BackgroundGradientValue): BackgroundGradientValue {
  if (typeof value === 'string') return value;
  if (value === undefined) return undefined;

  return {
    ...value,
    stops: value.stops.map((stop) => ({
      color: maybeNormalizeColor(stop.color) ?? stop.color,
      position: stop.position,
    })),
  };
}

function normalizeFontWeight(value: number | undefined): FontWeight | undefined {
  if (value === undefined) {
    return undefined;
  }

  return FONT_WEIGHT_VALUES.includes(value as FontWeight) ? (value as FontWeight) : undefined;
}

function normalizeSpacing(value: number | undefined): number | undefined {
  return value;
}

function normalizePadding(value: PaddingTuple | undefined): PaddingTuple | undefined {
  return value;
}

function hasAscendingGradientStops(stops: readonly BroadsetGradientStop[]): boolean {
  let previousPosition = -1;

  for (const stop of stops) {
    if (stop.position < previousPosition) {
      return false;
    }

    previousPosition = stop.position;
  }

  return true;
}

/** CSS clip-path function prefixes accepted alongside SVG path data. */
const CLIP_PATH_FUNCTION_PREFIXES = ['polygon(', 'circle(', 'ellipse(', 'inset(', 'path('] as const;

function isValidClipPathValue(value: string): boolean {
  if (value.trim() === '') {
    return true;
  }

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.startsWith('M') || trimmed.startsWith('m')) {
    return true;
  }

  return CLIP_PATH_FUNCTION_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

const borderRadiusSchema = z.union([
  z.number().nonnegative(),
  z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
]);

const paddingSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
]);

const broadsetGradientSchema = z
  .object({
    type: z.enum(['linear', 'radial', 'conic']),
    stops: z
      .array(
        z.object({
          color: z.string(),
          position: z.number().min(0).max(100),
        }),
      )
      .min(2),
    angle: z.number().min(0).max(360).optional(),
    center: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
  })
  .refine((value) => hasAscendingGradientStops(value.stops), {
    message: 'Gradient stop positions must be in ascending order',
  });

export const styleSchema: z.ZodType<BroadsetElementStyle> = z
  .object({
    opacity: z.number().min(0).max(1),
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontColor: z.string().optional(),
    fontWeight: z.number().int().optional(),
    fontStyle: z.enum(['normal', 'italic', 'oblique']).optional(),
    textAlignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
    textDecoration: z.string().optional(),
    textTransform: z.string().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.union([z.number(), z.string()]).optional(),
    wordSpacing: z.number().optional(),
    textStroke: z.string().optional(),
    textShadow: z.string().optional(),
    backgroundColor: z.string().optional(),
    backgroundGradient: z.union([z.string(), broadsetGradientSchema]).optional(),
    borderWidth: z.number().nonnegative().optional(),
    borderColor: z.string().optional(),
    borderRadius: borderRadiusSchema.optional(),
    borderStyle: z.enum(BORDER_STYLE_VALUES).optional(),
    boxShadow: z.string().optional(),
    filter: z.string().optional(),
    backdropFilter: z.string().optional(),
    mixBlendMode: z.enum(BLEND_MODE_VALUES).optional(),
    isolation: z.enum(['auto', 'isolate']).optional(),
    padding: paddingSchema.optional(),
    objectFit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']).optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().nonnegative().optional(),
    strokeDasharray: z.string().optional(),
    strokeDashoffset: z.number().optional(),
    strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
    strokeLinejoin: z.enum(['miter', 'round', 'bevel']).optional(),
    strokeOpacity: z.number().min(0).max(1).optional(),
    fill: z.string().optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    fillRule: z.enum(['nonzero', 'evenodd']).optional(),
    maskType: z.enum(['none', 'alpha', 'luminance', 'custom']).optional(),
    customClipPath: z.string().optional(),
    clipChildren: z.boolean().optional(),
    rotateX: z.number().optional(),
    rotateY: z.number().optional(),
    rotateZ: z.number().optional(),
    translateZ: z.number().optional(),
    fontVariationSettings: z.string().optional(),
    writingMode: z.enum(['horizontal-tb', 'vertical-rl', 'vertical-lr']).optional(),
    verticalAlignment: z.enum(['top', 'middle', 'bottom']).optional(),
    trimStart: z.number().min(0).max(1).optional(),
    trimEnd: z.number().min(0).max(1).optional(),
    trimOffset: z.number().min(0).max(1).optional(),
  })
  .superRefine((value, context) => {
    if (normalizeFontWeight(value.fontWeight) === undefined && value.fontWeight !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'fontWeight must resolve to a numeric value in the range 100–900',
        path: ['fontWeight'],
      });
    }

    if (value.padding !== undefined && normalizePadding(value.padding) === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Padding values must be non-negative',
        path: ['padding'],
      });
    }

    if (value.customClipPath !== undefined && !isValidClipPathValue(value.customClipPath)) {
      context.addIssue({
        code: 'custom',
        message: 'customClipPath must be valid SVG path data or CSS clip-path function',
        path: ['customClipPath'],
      });
    }
  })
  .transform((value): BroadsetElementStyle => {
    const normalizedBackgroundGradient = normalizeBackgroundGradient(value.backgroundGradient);

    return {
      opacity: value.opacity,
      fontFamily: value.fontFamily,
      fontSize: value.fontSize,
      fontColor: maybeNormalizeColor(value.fontColor),
      fontWeight: normalizeFontWeight(value.fontWeight),
      fontStyle: value.fontStyle,
      textAlignment: value.textAlignment,
      textDecoration: value.textDecoration,
      textTransform: value.textTransform,
      letterSpacing: normalizeSpacing(value.letterSpacing),
      lineHeight: value.lineHeight,
      wordSpacing: normalizeSpacing(value.wordSpacing),
      textStroke: value.textStroke,
      textShadow: value.textShadow,
      backgroundColor: maybeNormalizeColor(value.backgroundColor),
      ...(normalizedBackgroundGradient === undefined ? {} : { backgroundGradient: normalizedBackgroundGradient }),
      borderWidth: value.borderWidth,
      borderColor: maybeNormalizeColor(value.borderColor),
      borderRadius: value.borderRadius === undefined ? undefined : normalizeBorderRadius(value.borderRadius),
      borderStyle: value.borderStyle,
      boxShadow: value.boxShadow,
      filter: value.filter,
      backdropFilter: value.backdropFilter,
      mixBlendMode: value.mixBlendMode,
      isolation: value.isolation,
      padding: normalizePadding(value.padding) ?? [0, 0, 0, 0],
      objectFit: value.objectFit,
      stroke: maybeNormalizeColor(value.stroke),
      strokeWidth: value.strokeWidth,
      strokeDasharray: value.strokeDasharray,
      strokeDashoffset: value.strokeDashoffset,
      strokeLinecap: value.strokeLinecap,
      strokeLinejoin: value.strokeLinejoin,
      strokeOpacity: value.strokeOpacity,
      fill: maybeNormalizeColor(value.fill),
      fillOpacity: value.fillOpacity,
      fillRule: value.fillRule,
      maskType: value.maskType ?? 'none',
      customClipPath: value.customClipPath ?? '',
      clipChildren: value.clipChildren ?? false,
      rotateX: value.rotateX ?? 0,
      rotateY: value.rotateY ?? 0,
      rotateZ: value.rotateZ ?? 0,
      translateZ: value.translateZ ?? 0,
      fontVariationSettings: value.fontVariationSettings,
      writingMode: value.writingMode,
      verticalAlignment: value.verticalAlignment,
      trimStart: value.trimStart ?? 0,
      trimEnd: value.trimEnd ?? 1,
      trimOffset: value.trimOffset ?? 0,
    };
  });

/** Creates the canonical default style for new elements. */
export function createDefaultStyle(): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1 });
}
