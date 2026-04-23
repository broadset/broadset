import { z } from 'zod';

import {
  type BroadsetColor,
  broadsetColorSchema,
  type ColorResolutionContext,
  colorToCss,
} from './broadset-color';
import { type BroadsetFill, broadsetFillSchema } from './broadset-fill';
import type { BroadsetGradient, BroadsetGradientStop } from './broadset-gradient';
import { type FilterStack, filterStackSchema, filterStackToCss } from './filter-stack';
import { migrateLegacyColor } from './migrations/migrate-legacy-color';
import { migrateLegacyFill } from './migrations/migrate-legacy-fill';
import { migrateLegacyFilter } from './migrations/migrate-legacy-filter';

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

/** @deprecated Re-exported from `broadset-gradient.ts` for compatibility. */
export type { BroadsetGradient, BroadsetGradientStop };

/**
 * Legacy construction-time shape for `backgroundGradient` accepted by
 * `BroadsetElementStyleInput`. After Phase 1 unit #8c, the persisted
 * `BroadsetElementStyle` no longer carries a `backgroundGradient` field —
 * the schema preprocessor collapses it into the unified
 * `fill: BroadsetFill`. The type alias remains exported so importers and
 * legacy fixtures can still name the transitional input shape.
 */
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
  /**
   * Canonical fill for the element. Replaces the legacy `fill`
   * (SVG-paint), `backgroundColor` (CSS-container), and
   * `backgroundGradient` trio per Phase 1 unit #8 / IO-D-04. Always
   * present — defaults to `noneFill()` when the source had no paint.
   * Renderer and exporters dispatch on `fill.kind`; the SVG-paint and
   * CSS-background views share this single field.
   */
  readonly fill: BroadsetFill;
  readonly borderWidth?: number | undefined;
  readonly borderColor?: BroadsetColor | undefined;
  readonly borderRadius?: BorderRadiusTuple | undefined;
  readonly borderStyle?: BorderStyle | undefined;
  readonly boxShadow?: string | undefined;
  readonly filter?: FilterStack | undefined;
  readonly backdropFilter?: FilterStack | undefined;
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
 * Input-side style shape accepted by `styleSchema`.
 *
 * - Color-valued fields may be either a canonical `BroadsetColor` or a
 *   legacy CSS color string (hex / rgb / hsl / named / Color Level 4) —
 *   the schema preprocessor normalizes strings through
 *   `migrateLegacyColor` at parse time.
 * - Fill is the Phase 1 unit #8 unified paint. Construction-time callers
 *   may pass any of: a canonical `BroadsetFill`, a raw `BroadsetColor`
 *   (shorthand for solid), a CSS color string (shorthand for solid), OR
 *   the legacy trio `{ fill, backgroundColor, backgroundGradient }` as
 *   separate sibling fields. The schema preprocessor collapses every
 *   shape into a single `BroadsetFill` via `migrateLegacyFill`.
 * - Filter stacks accept the legacy CSS filter-function string form.
 *
 * Construction-time callers (importers, fixtures, test helpers) use this
 * type so migration remains a one-site concern; the persisted
 * `BroadsetElementStyle` only ever contains the canonical shapes.
 */
export type BroadsetElementStyleInput = Omit<
  BroadsetElementStyle,
  'fontColor' | 'borderColor' | 'stroke' | 'fill' | 'filter' | 'backdropFilter'
> & {
  readonly fontColor?: BroadsetColor | string | undefined;
  readonly borderColor?: BroadsetColor | string | undefined;
  readonly stroke?: BroadsetColor | string | undefined;
  readonly fill?: BroadsetFill | BroadsetColor | string | undefined;
  /** Legacy CSS-container background color. Folded into `fill` by the schema. */
  readonly backgroundColor?: BroadsetColor | string | undefined;
  /** Legacy CSS-container background gradient. Structured form folds into `fill`; strings are rejected. */
  readonly backgroundGradient?: BackgroundGradientValue;
  readonly filter?: FilterStack | string | undefined;
  readonly backdropFilter?: FilterStack | string | undefined;
};

/**
 * Serializes a structured {@link BroadsetGradient} to its canonical CSS
 * gradient-function string. Callers that emit `background-image` assign
 * the result directly. Mirrors the renderer's historical serializer so
 * the CSS view stays stable across the unit #8 field-type flip.
 */
export function gradientToCss(gradient: BroadsetGradient): string {
  const stops = gradient.stops.map((stop) => `${colorToCss(stop.color)} ${String(stop.position)}%`).join(', ');

  switch (gradient.type) {
    case 'linear': {
      const angle = gradient.angle ?? 180;

      return `linear-gradient(${String(angle)}deg, ${stops})`;
    }

    case 'radial': {
      const center = gradient.center ?? [50, 50];

      return `radial-gradient(circle at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }

    case 'conic': {
      const angle = gradient.startAngle ?? gradient.angle ?? 0;
      const center = gradient.center ?? [50, 50];

      return `conic-gradient(from ${String(angle)}deg at ${String(center[0])}% ${String(center[1])}%, ${stops})`;
    }
  }
}

/**
 * CSS-view projection of a `BroadsetFill` for consumers that emit HTML
 * backgrounds (rectangles, ellipses, groups, text containers). Each
 * field maps 1:1 to a `style.background*` DOM / CSS property. A field
 * that is `undefined` means "clear the corresponding DOM style".
 */
export interface ResolvedCssBackground {
  readonly backgroundColor?: string | undefined;
  readonly backgroundImage?: string | undefined;
}

/**
 * Projects a {@link BroadsetFill} into the CSS container-background view
 * used by the DOM renderer and HTML / SVG exporters. `solid` kinds emit
 * `backgroundColor`; `gradient` kinds emit `backgroundImage`. The
 * `pattern` / `picture` kinds currently project to `undefined` because
 * the shared asset-registry plumbing lands in Phase 4 — consumers that
 * receive `undefined` clear the DOM properties so preflight warnings
 * surface instead of rendering a broken URL. `none` clears every
 * property.
 */
export function resolveStyleFillToCssBackground(
  fill: BroadsetFill,
  ctx?: ColorResolutionContext,
): ResolvedCssBackground {
  switch (fill.kind) {
    case 'none':
      return {};

    case 'solid': {
      const css = colorToCss(fill.color, ctx);

      return { backgroundColor: css };
    }

    case 'gradient':
      return { backgroundImage: gradientToCss(fill.gradient) };

    case 'pattern':
    case 'picture':
      return {};
  }
}

/**
 * Projects a {@link BroadsetFill} into the SVG-paint view used by
 * renderers and exporters that emit `<path>` / `<rect>` / `<ellipse>`
 * `fill=` attributes. `solid` kinds emit the CSS color string;
 * `gradient` / `pattern` / `picture` kinds return a `url(#…)` reference
 * the caller must back with an SVG `<defs>` entry in the same document.
 * `none` emits `'none'` so the SVG-paint contract stays explicit.
 *
 * The `resolveTheme: false` opt-out mirrors {@link resolveStyleColor} —
 * it lets non-theme-aware CSS writers emit the approximation `hex`
 * rather than throwing while the palette plumbing catches up. `defsIdFor`
 * lets advanced callers back a gradient / pattern / picture with an
 * SVG `<defs>` reference instead of the default `none` fallback.
 */
function resolveFillReference(
  fill: BroadsetFill,
  defsIdFor?: (fill: BroadsetFill) => string,
): string {
  const id = defsIdFor?.(fill);

  return id === undefined ? 'none' : `url(#${id})`;
}

export function resolveStyleFillToSvgPaint(
  fill: BroadsetFill,
  ctx?: ColorResolutionContext & {
    readonly resolveTheme?: boolean;
    readonly defsIdFor?: (fill: BroadsetFill) => string;
  },
): string {
  switch (fill.kind) {
    case 'none':
      return 'none';

    case 'solid': {
      const resolved = resolveStyleColor(fill.color, ctx);

      return resolved ?? 'none';
    }

    case 'gradient':
    case 'pattern':
    case 'picture':
      return resolveFillReference(fill, ctx?.defsIdFor);
  }
}

/**
 * Convenience: returns the solid color if `fill` is `kind: 'solid'`,
 * otherwise `undefined`. Call sites that previously read
 * `style.backgroundColor` directly use this to recover the single-color
 * shorthand when the fill is plausibly solid; other kinds signal that
 * the consumer must switch on `fill.kind`.
 */
export function getSolidFillColor(fill: BroadsetFill): BroadsetColor | undefined {
  return fill.kind === 'solid' ? fill.color : undefined;
}

/**
 * Convenience: returns the structured gradient if `fill` is
 * `kind: 'gradient'`, otherwise `undefined`. Used by exporters that
 * previously read `style.backgroundGradient` directly.
 */
export function getGradientFillGradient(fill: BroadsetFill): BroadsetGradient | undefined {
  return fill.kind === 'gradient' ? fill.gradient : undefined;
}

/**
 * Resolves an optional `FilterStack` to the CSS filter-function string
 * view used by `style.filter` / `style.backdropFilter` in the DOM
 * renderer and HTML / SVG exporters. Returns `undefined` when the
 * stack is absent so callers preserve the "unset" shape.
 */
export function resolveStyleFilter(
  stack: FilterStack | undefined,
  ctx?: ColorResolutionContext & { readonly resolveTheme?: boolean },
): string | undefined {
  if (stack === undefined) {
    return undefined;
  }

  return filterStackToCss(stack, ctx);
}

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

/**
 * Narrows a partially-typed Zod input value to determine whether it has
 * a `BroadsetFill` discriminator (`kind: 'none' | 'solid' | ...`) vs a
 * `BroadsetColor` discriminator (`kind: 'rgb' | 'theme'`). Used by the
 * fill preprocessor so shorthand callers (`fill: color`) don't collide
 * with canonical-shape callers (`fill: { kind: 'solid', color }`).
 */
const FILL_KIND_VALUES: ReadonlySet<string> = new Set(['none', 'solid', 'gradient', 'pattern', 'picture']);

function isFillShaped(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const kind = (value as { readonly kind?: unknown }).kind;

  return typeof kind === 'string' && FILL_KIND_VALUES.has(kind);
}

function isColorShaped(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const kind = (value as { readonly kind?: unknown }).kind;

  return kind === 'rgb' || kind === 'theme';
}

/**
 * Optional filter stack: accepts either a structured `FilterStack` or a
 * legacy CSS filter function list string. Strings are parsed by
 * `migrateLegacyFilter`; unparseable content collapses to a single
 * `custom-svg` primitive that preserves the raw source per IO-D-18.
 */
const filterStackOrLegacyStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    try {
      return migrateLegacyFilter(value);
    } catch {
      return undefined;
    }
  }

  return value;
}, filterStackSchema.optional());

/**
 * Input-tolerant gradient schema used by the legacy `backgroundGradient`
 * field — stop colors may be legacy CSS strings, the preprocessor inside
 * `broadsetColorOrRequiredLegacyStringSchema` migrates them before the
 * outer `.transform()` hands the gradient to `migrateLegacyFill`.
 *
 * The canonical `broadsetGradientSchema` imported from
 * `./broadset-gradient` accepts only canonical `BroadsetColor` stops and
 * is used downstream (inside `broadsetFillSchema.gradient`).
 */
const legacyBroadsetGradientInputSchema = z
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
  });

const ARROW_END_SHAPE_VALUES = ['triangle', 'stealth', 'diamond', 'oval', 'none'] as const;
const ARROW_END_SIZE_VALUES = ['sm', 'md', 'lg'] as const;

const arrowEndSchema: z.ZodType<ArrowEnd> = z.object({
  shape: z.enum(ARROW_END_SHAPE_VALUES),
  width: z.enum(ARROW_END_SIZE_VALUES).optional(),
  length: z.enum(ARROW_END_SIZE_VALUES).optional(),
});

/**
 * Optional fill input. Accepts the canonical `BroadsetFill`, a raw
 * `BroadsetColor` (shorthand for solid), or a legacy CSS color string
 * (shorthand for solid via `migrateLegacyColor`). Every shape normalizes
 * to `BroadsetFill`; `undefined` falls through so the schema's
 * `.transform()` can combine `fill` with the legacy `backgroundColor` /
 * `backgroundGradient` siblings via `migrateLegacyFill`.
 */
const fillInputSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;

  if (isFillShaped(value)) return value;

  if (isColorShaped(value)) {
    return { kind: 'solid', color: value };
  }

  if (typeof value === 'string') {
    try {
      const migrated = migrateLegacyColor(value);

      return migrated === undefined ? undefined : { kind: 'solid', color: migrated };
    } catch {
      return undefined;
    }
  }

  return undefined;
}, broadsetFillSchema.optional());

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
    /** Legacy sibling folded into `fill` by the transform. */
    backgroundColor: broadsetColorOrOptionalLegacyStringSchema,
    /** Legacy sibling folded into `fill` by the transform. */
    backgroundGradient: z.union([z.string(), legacyBroadsetGradientInputSchema]).optional(),
    borderWidth: z.number().nonnegative().optional(),
    borderColor: broadsetColorOrOptionalLegacyStringSchema,
    borderRadius: borderRadiusSchema.optional(),
    borderStyle: z.enum(BORDER_STYLE_VALUES).optional(),
    boxShadow: z.string().optional(),
    filter: filterStackOrLegacyStringSchema,
    backdropFilter: filterStackOrLegacyStringSchema,
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
    fill: fillInputSchema,
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
    const fill = resolveFillFromInputs({
      fill: value.fill,
      backgroundColor: coerceBroadsetColor(value.backgroundColor),
      backgroundGradient: normalizeBackgroundGradient(value.backgroundGradient),
    });

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
      fill,
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

interface ResolveFillFromInputsArgs {
  readonly fill?: BroadsetFill | undefined;
  readonly backgroundColor?: BroadsetColor | undefined;
  readonly backgroundGradient?: BackgroundGradientValue;
}

/**
 * Combines the canonical `fill` input (if present) with the legacy
 * `backgroundColor` / `backgroundGradient` siblings into a single
 * `BroadsetFill`. `fill` wins when present — the legacy trio only
 * participates when `fill` is absent, matching the IO-D-04 migration
 * contract. `migrateLegacyFill` treats empty / whitespace `backgroundGradient`
 * strings as absent and throws on populated ones per IO-D-18; the
 * `.transform()` surfaces that throw as a schema error so callers see
 * the failure at parse time rather than at render time.
 */
function resolveFillFromInputs(inputs: ResolveFillFromInputsArgs): BroadsetFill {
  if (inputs.fill !== undefined) {
    return inputs.fill;
  }

  return migrateLegacyFill({
    fill: undefined,
    backgroundColor: inputs.backgroundColor,
    backgroundGradient: inputs.backgroundGradient,
  });
}

/** Creates the canonical default style for new elements. */
export function createDefaultStyle(): BroadsetElementStyle {
  return styleSchema.parse({ opacity: 1 });
}
