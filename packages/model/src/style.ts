import { z } from 'zod';

import {
  type BroadsetColor,
  broadsetColorSchema,
  type ColorResolutionContext,
  colorToCss,
} from './broadset-color';
import { migrateLegacyColor } from './migrations/migrate-legacy-color';

export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';
export type FillRule = 'nonzero' | 'evenodd';
export type ArrowEndShape = 'triangle' | 'stealth' | 'diamond' | 'oval' | 'none';
export type ArrowEndSize = 'sm' | 'md' | 'lg';
export type TextAnchor = 'start' | 'middle' | 'end';
export type LengthAdjust = 'spacing' | 'spacingAndGlyphs';

export interface ArrowEnd {
  readonly shape: ArrowEndShape;
  readonly width?: ArrowEndSize | undefined;
  readonly length?: ArrowEndSize | undefined;
}
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
  readonly color: BroadsetColor;
  readonly position: number;
}

export interface BroadsetGradient {
  readonly type: 'linear' | 'radial' | 'conic';
  readonly stops: readonly BroadsetGradientStop[];
  readonly angle?: number | undefined;
  readonly center?: readonly [number, number] | undefined;
  /**
   * Conic-gradient-only starting angle in degrees, measured clockwise from
   * the positive x-axis (CSS `conic-gradient(from <angle>, …)`). Ignored on
   * linear and radial gradients. Range 0-360 inclusive; wrap-around past
   * 360° is applied by the renderer, not the validator.
   */
  readonly startAngle?: number | undefined;
}

export type BackgroundGradientValue = string | BroadsetGradient | undefined;

export interface BroadsetElementStyle {
  readonly opacity: number;
  readonly fontFamily?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly fontColor?: BroadsetColor | undefined;
  readonly fontWeight?: FontWeight | undefined;
  readonly fontStyle?: FontStyle | undefined;
  readonly textAlignment?: TextAlignment | undefined;
  readonly textAnchor?: TextAnchor | undefined;
  readonly textDecoration?: string | undefined;
  readonly textLength?: number | undefined;
  readonly lengthAdjust?: LengthAdjust | undefined;
  readonly textTransform?: string | undefined;
  readonly letterSpacing?: number | undefined;
  readonly lineHeight?: number | string | undefined;
  readonly wordSpacing?: number | undefined;
  readonly textStroke?: string | undefined;
  readonly textShadow?: string | undefined;
  readonly backgroundColor?: BroadsetColor | undefined;
  readonly backgroundGradient?: BackgroundGradientValue;
  readonly borderWidth?: number | undefined;
  readonly borderColor?: BroadsetColor | undefined;
  readonly borderRadius?: BorderRadiusTuple | undefined;
  readonly borderStyle?: BorderStyle | undefined;
  readonly boxShadow?: string | undefined;
  readonly filter?: string | undefined;
  readonly backdropFilter?: string | undefined;
  readonly mixBlendMode?: MixBlendMode | undefined;
  readonly isolation?: Isolation | undefined;
  readonly padding?: PaddingTuple | undefined;
  readonly objectFit?: ObjectFit | undefined;
  readonly stroke?: BroadsetColor | undefined;
  readonly strokeWidth?: number | undefined;
  readonly strokeDasharray?: string | undefined;
  readonly strokeDashoffset?: number | undefined;
  readonly strokeLinecap?: StrokeLinecap | undefined;
  readonly strokeLinejoin?: StrokeLinejoin | undefined;
  readonly strokeMiterlimit?: number | undefined;
  readonly strokeOpacity?: number | undefined;
  readonly strokeHeadEnd?: ArrowEnd | undefined;
  readonly strokeTailEnd?: ArrowEnd | undefined;
  readonly fill?: BroadsetColor | undefined;
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

/**
 * Input-side style shape accepted by `styleSchema`: color-valued
 * fields may be either a canonical `BroadsetColor` or a legacy CSS
 * color string (hex / rgb / hsl / named / Color Level 4). The schema
 * preprocessor normalizes strings through `migrateLegacyColor` at
 * parse time so the persisted `BroadsetElementStyle` only ever
 * contains `BroadsetColor`. Construction-time callers (importers,
 * fixtures, test helpers) use this type so migration remains a
 * one-site concern.
 */
export type BroadsetElementStyleInput = Omit<
  BroadsetElementStyle,
  'fontColor' | 'backgroundColor' | 'borderColor' | 'stroke' | 'fill'
> & {
  readonly fontColor?: BroadsetColor | string | undefined;
  readonly backgroundColor?: BroadsetColor | string | undefined;
  readonly borderColor?: BroadsetColor | string | undefined;
  readonly stroke?: BroadsetColor | string | undefined;
  readonly fill?: BroadsetColor | string | undefined;
};

/**
 * Resolves an optional `BroadsetColor` to its CSS-string view for
 * renderer, editor, formats, and demo consumers that still assign the
 * result directly onto DOM `style` properties or CSS export strings.
 *
 * Returns `undefined` when the color is absent so callers can preserve
 * the "unset" shape through `?? ''` or nullish fallbacks. Theme colors
 * require a `ColorResolutionContext` with a palette — passing
 * `{ resolveTheme: false }` returns the approximation `hex` instead of
 * throwing so non-theme-aware consumers (e.g. generic CSS writers)
 * stay functional when the palette isn't wired yet.
 */
export function resolveStyleColor(
  color: BroadsetColor | undefined,
  ctx?: ColorResolutionContext & { readonly resolveTheme?: boolean },
): string | undefined {
  if (color === undefined) return undefined;

  if (color.kind === 'rgb') {
    return color.originalColor ?? color.hex;
  }

  if (ctx?.resolveTheme === false) {
    return undefined;
  }

  return colorToCss(color, ctx);
}

/**
 * Accepts either a `BroadsetColor` or a legacy string (hex, rgb, hsl,
 * named color, Color Level 4 literal) and returns a canonical
 * `BroadsetColor`. Unrecognized strings fall back to the legacy
 * `normalizeColor` output wrapped in an `rgb` color so importer round-
 * trip never silently drops a value — schema validation happens
 * separately through `broadsetColorSchema`.
 */
function coerceBroadsetColor(value: unknown): BroadsetColor | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'string') {
    return migrateLegacyColor(value);
  }

  if (typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as BroadsetColor;
  }

  return undefined;
}

function normalizeBackgroundGradient(value: BackgroundGradientValue): BackgroundGradientValue {
  if (typeof value === 'string') return value;
  if (value === undefined) return undefined;

  return {
    ...value,
    stops: value.stops.map((stop) => ({
      color: coerceBroadsetColor(stop.color) ?? stop.color,
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

/**
 * Zod preprocessor that accepts either a `BroadsetColor` discriminated
 * union or any legacy CSS color string (hex / rgb / hsl / named / Color
 * Level 4) and normalizes it into a canonical `BroadsetColor` at the
 * model boundary. Unparseable strings (`'none'`, `'currentColor'`, …)
 * are collapsed to `undefined` so callers treat them as "unset" rather
 * than failing validation; the downstream `.optional()` schema accepts
 * that outcome.
 */
function coerceStringToColorInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return migrateLegacyColor(value);
  } catch {
    return undefined;
  }
}

/** Gradient stop color: required, preprocesses strings → BroadsetColor (unparseable strings fail). */
const broadsetColorOrRequiredLegacyStringSchema = z.preprocess(coerceStringToColorInput, broadsetColorSchema);

/** Optional style color: preprocesses strings, unparseable / absent values collapse to undefined. */
const broadsetColorOrOptionalLegacyStringSchema = z.preprocess(
  coerceStringToColorInput,
  broadsetColorSchema.optional(),
);

const broadsetGradientSchema = z
  .object({
    type: z.enum(['linear', 'radial', 'conic']),
    stops: z
      .array(
        z.object({
          color: broadsetColorOrRequiredLegacyStringSchema,
          position: z.number().min(0).max(100),
        }),
      )
      .min(2),
    angle: z.number().min(0).max(360).optional(),
    center: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
    startAngle: z.number().min(0).max(360).optional(),
  })
  .refine((value) => hasAscendingGradientStops(value.stops), {
    message: 'Gradient stop positions must be in ascending order',
  });

const ARROW_END_SHAPE_VALUES = ['triangle', 'stealth', 'diamond', 'oval', 'none'] as const;
const ARROW_END_SIZE_VALUES = ['sm', 'md', 'lg'] as const;

const arrowEndSchema: z.ZodType<ArrowEnd> = z.object({
  shape: z.enum(ARROW_END_SHAPE_VALUES),
  width: z.enum(ARROW_END_SIZE_VALUES).optional(),
  length: z.enum(ARROW_END_SIZE_VALUES).optional(),
});

export const styleSchema: z.ZodType<BroadsetElementStyle> = z
  .object({
    opacity: z.number().min(0).max(1),
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontColor: broadsetColorOrOptionalLegacyStringSchema,
    fontWeight: z.number().int().optional(),
    fontStyle: z.enum(['normal', 'italic', 'oblique']).optional(),
    textAlignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
    textAnchor: z.enum(['start', 'middle', 'end']).optional(),
    textDecoration: z.string().optional(),
    textLength: z.number().nonnegative().optional(),
    lengthAdjust: z.enum(['spacing', 'spacingAndGlyphs']).optional(),
    textTransform: z.string().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.union([z.number(), z.string()]).optional(),
    wordSpacing: z.number().optional(),
    textStroke: z.string().optional(),
    textShadow: z.string().optional(),
    backgroundColor: broadsetColorOrOptionalLegacyStringSchema,
    backgroundGradient: z.union([z.string(), broadsetGradientSchema]).optional(),
    borderWidth: z.number().nonnegative().optional(),
    borderColor: broadsetColorOrOptionalLegacyStringSchema,
    borderRadius: borderRadiusSchema.optional(),
    borderStyle: z.enum(BORDER_STYLE_VALUES).optional(),
    boxShadow: z.string().optional(),
    filter: z.string().optional(),
    backdropFilter: z.string().optional(),
    mixBlendMode: z.enum(BLEND_MODE_VALUES).optional(),
    isolation: z.enum(['auto', 'isolate']).optional(),
    padding: paddingSchema.optional(),
    objectFit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']).optional(),
    stroke: broadsetColorOrOptionalLegacyStringSchema,
    strokeWidth: z.number().nonnegative().optional(),
    strokeDasharray: z.string().optional(),
    strokeDashoffset: z.number().optional(),
    strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
    strokeLinejoin: z.enum(['miter', 'round', 'bevel']).optional(),
    strokeMiterlimit: z.number().min(1).optional(),
    strokeOpacity: z.number().min(0).max(1).optional(),
    strokeHeadEnd: arrowEndSchema.optional(),
    strokeTailEnd: arrowEndSchema.optional(),
    fill: broadsetColorOrOptionalLegacyStringSchema,
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
      fontColor: coerceBroadsetColor(value.fontColor),
      fontWeight: normalizeFontWeight(value.fontWeight),
      fontStyle: value.fontStyle,
      textAlignment: value.textAlignment,
      textAnchor: value.textAnchor,
      textDecoration: value.textDecoration,
      textLength: value.textLength,
      lengthAdjust: value.lengthAdjust,
      textTransform: value.textTransform,
      letterSpacing: normalizeSpacing(value.letterSpacing),
      lineHeight: value.lineHeight,
      wordSpacing: normalizeSpacing(value.wordSpacing),
      textStroke: value.textStroke,
      textShadow: value.textShadow,
      backgroundColor: coerceBroadsetColor(value.backgroundColor),
      ...(normalizedBackgroundGradient === undefined ? {} : { backgroundGradient: normalizedBackgroundGradient }),
      borderWidth: value.borderWidth,
      borderColor: coerceBroadsetColor(value.borderColor),
      borderRadius: value.borderRadius === undefined ? undefined : normalizeBorderRadius(value.borderRadius),
      borderStyle: value.borderStyle,
      boxShadow: value.boxShadow,
      filter: value.filter,
      backdropFilter: value.backdropFilter,
      mixBlendMode: value.mixBlendMode,
      isolation: value.isolation,
      padding: normalizePadding(value.padding) ?? [0, 0, 0, 0],
      objectFit: value.objectFit,
      stroke: coerceBroadsetColor(value.stroke),
      strokeWidth: value.strokeWidth,
      strokeDasharray: value.strokeDasharray,
      strokeDashoffset: value.strokeDashoffset,
      strokeLinecap: value.strokeLinecap,
      strokeLinejoin: value.strokeLinejoin,
      strokeMiterlimit: value.strokeMiterlimit,
      strokeOpacity: value.strokeOpacity,
      strokeHeadEnd: value.strokeHeadEnd,
      strokeTailEnd: value.strokeTailEnd,
      fill: coerceBroadsetColor(value.fill),
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
