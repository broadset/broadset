import { z } from 'zod';

import {
  type BroadsetColor,
  broadsetColorSchema,
  type ColorResolutionContext,
  colorToCss,
} from './broadset-color';

/**
 * Phase 1 unit #6 — the single-string `filter` and `backdropFilter`
 * style fields are being replaced with a structured `FilterStack`
 * discriminated union. The canonical representation is the primitive
 * array; the CSS-string view that the renderer consumes is derived
 * from it via `filterStackToCss`. PSD's ten layer effects, SVG
 * `<filter>` primitives, and PDF ExtGState blend chains map into this
 * union so importers can round-trip without flattening to an opaque
 * string.
 *
 * This first sub-commit (6a) is additive — it lands the primitive
 * types, Zod schema, factories, and resolver. A later sub-commit flips
 * `BroadsetElementStyle.filter` / `.backdropFilter` to consume
 * `FilterStack` once the renderer and editor consumers have caught
 * up.
 */

export type SimpleFilterKind =
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'hue-rotate'
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'opacity';

/** Amount-based primitive kinds — one numeric `amount` field, one CSS `fn(amount)` token. */
export const SIMPLE_FILTER_KINDS = [
  'brightness',
  'contrast',
  'saturate',
  'hue-rotate',
  'grayscale',
  'sepia',
  'invert',
  'opacity',
] as const satisfies readonly SimpleFilterKind[];

export type FilterPrimitiveKind = SimpleFilterKind | 'drop-shadow' | 'blur' | 'color-matrix' | 'custom-svg';

export interface DropShadowFilter {
  readonly kind: 'drop-shadow';
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly color: BroadsetColor;
}

export interface BlurFilter {
  readonly kind: 'blur';
  readonly stdDeviation: number;
}

export interface ColorMatrixFilter {
  readonly kind: 'color-matrix';
  /** 4x5 or 5x5 row-major matrix per SVG `feColorMatrix`. Not validated here — the caller's layout is preserved verbatim. */
  readonly matrix: readonly number[];
}

export interface SimpleAmountFilter {
  readonly kind: SimpleFilterKind;
  readonly amount: number;
}

export interface CustomSvgFilter {
  readonly kind: 'custom-svg';
  /** Raw SVG fragment for primitives that do not map to any other kind. Sanitized at the renderer boundary. */
  readonly svg: string;
}

export type FilterPrimitive = DropShadowFilter | BlurFilter | ColorMatrixFilter | SimpleAmountFilter | CustomSvgFilter;

export type FilterStack = readonly FilterPrimitive[];

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const dropShadowFilterSchema = z.object({
  kind: z.literal('drop-shadow'),
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number().nonnegative(),
  color: broadsetColorSchema,
});

const blurFilterSchema = z.object({
  kind: z.literal('blur'),
  stdDeviation: z.number().nonnegative(),
});

const colorMatrixFilterSchema = z.object({
  kind: z.literal('color-matrix'),
  matrix: z.array(z.number()),
});

const simpleAmountFilterSchema = z.object({
  kind: z.enum(SIMPLE_FILTER_KINDS),
  amount: z.number(),
});

const customSvgFilterSchema = z.object({
  kind: z.literal('custom-svg'),
  svg: z.string(),
});

export const filterPrimitiveSchema: z.ZodType<FilterPrimitive> = z.discriminatedUnion('kind', [
  dropShadowFilterSchema,
  blurFilterSchema,
  colorMatrixFilterSchema,
  simpleAmountFilterSchema,
  customSvgFilterSchema,
]);

export const filterStackSchema: z.ZodType<FilterStack> = z.array(filterPrimitiveSchema);

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

export function blurFilter(stdDeviation: number): BlurFilter {
  return { kind: 'blur', stdDeviation };
}

export interface DropShadowFilterOptions {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly color: BroadsetColor;
}

export function dropShadowFilter(options: DropShadowFilterOptions): DropShadowFilter {
  return {
    kind: 'drop-shadow',
    offsetX: options.offsetX,
    offsetY: options.offsetY,
    blur: options.blur,
    color: options.color,
  };
}

export function colorMatrixFilter(matrix: readonly number[]): ColorMatrixFilter {
  return { kind: 'color-matrix', matrix };
}

export function customSvgFilter(svg: string): CustomSvgFilter {
  return { kind: 'custom-svg', svg };
}

function simpleFilterFactory(kind: SimpleFilterKind): (amount: number) => SimpleAmountFilter {
  return (amount) => ({ kind, amount });
}

export const brightnessFilter = simpleFilterFactory('brightness');
export const contrastFilter = simpleFilterFactory('contrast');
export const saturateFilter = simpleFilterFactory('saturate');
export const hueRotateFilter = simpleFilterFactory('hue-rotate');
export const grayscaleFilter = simpleFilterFactory('grayscale');
export const sepiaFilter = simpleFilterFactory('sepia');
export const invertFilter = simpleFilterFactory('invert');
export const opacityFilter = simpleFilterFactory('opacity');

// ────────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────────

export function isSimpleAmountFilter(primitive: FilterPrimitive): primitive is SimpleAmountFilter {
  return (SIMPLE_FILTER_KINDS as readonly string[]).includes(primitive.kind);
}

// ────────────────────────────────────────────────────────────────────────────
// CSS resolver
// ────────────────────────────────────────────────────────────────────────────

/**
 * Renders a `FilterStack` to a CSS `filter` / `backdropFilter` string.
 *
 * Primitives that do not map to a CSS filter function (`color-matrix`,
 * `custom-svg`) are skipped — the renderer is responsible for routing
 * them through an SVG `<filter>` definition referenced via `url(…)`.
 * Dropping them here keeps the returned CSS string syntactically
 * valid; dropped primitives are recoverable from the source stack.
 *
 * A `ColorResolutionContext` must be supplied when any `drop-shadow`
 * primitive references a theme color; otherwise `colorToCss` throws
 * per IO-D-05 (no silent color downgrade).
 */
export function filterStackToCss(stack: FilterStack, ctx?: ColorResolutionContext): string {
  const tokens: string[] = [];

  for (const primitive of stack) {
    const token = filterPrimitiveToCss(primitive, ctx);

    if (token !== null) {
      tokens.push(token);
    }
  }

  return tokens.join(' ');
}

function filterPrimitiveToCss(primitive: FilterPrimitive, ctx: ColorResolutionContext | undefined): string | null {
  if (primitive.kind === 'drop-shadow') {
    const color = colorToCss(primitive.color, ctx);

    return `drop-shadow(${String(primitive.offsetX)}px ${String(primitive.offsetY)}px ${String(primitive.blur)}px ${color})`;
  }

  if (primitive.kind === 'blur') {
    return `blur(${String(primitive.stdDeviation)}px)`;
  }

  if (primitive.kind === 'color-matrix' || primitive.kind === 'custom-svg') {
    return null;
  }

  if (primitive.kind === 'hue-rotate') {
    return `hue-rotate(${String(primitive.amount)}deg)`;
  }

  return `${primitive.kind}(${String(primitive.amount)})`;
}
