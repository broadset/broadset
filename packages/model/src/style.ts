import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constrained enum values
// ---------------------------------------------------------------------------

export type StrokeLinecap = 'butt' | 'round' | 'square';
export type StrokeLinejoin = 'miter' | 'round' | 'bevel';
export type FillRule = 'nonzero' | 'evenodd';

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

/** CSS shorthand order: [topLeft, topRight, bottomRight, bottomLeft]. */
export type BorderRadiusTuple = readonly [number, number, number, number];

/**
 * Normalizes a border radius value to a 4-tuple.
 * A single number is expanded to four equal corners.
 */
export function normalizeBorderRadius(value: number | BorderRadiusTuple): BorderRadiusTuple {
  if (typeof value === 'number') {
    return [value, value, value, value];
  }

  return value;
}

/** Returns true when all four corner values are equal. */
export function isBorderRadiusUniform(radius: BorderRadiusTuple): boolean {
  return radius[0] === radius[1] && radius[1] === radius[2] && radius[2] === radius[3];
}

// ---------------------------------------------------------------------------
// BroadsetElementStyle interface
// ---------------------------------------------------------------------------

export interface BroadsetElementStyle {
  /** Required — opacity in the range [0, 1]. */
  readonly opacity: number;

  // Typography (all optional)
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontColor?: string;
  readonly fontWeight?: string;
  readonly fontStyle?: string;
  readonly textAlignment?: string;
  readonly textDecoration?: string;
  readonly textTransform?: string;
  readonly letterSpacing?: string;
  readonly lineHeight?: number | string;
  readonly wordSpacing?: string;

  // Text effects (optional)
  readonly textStroke?: string;
  readonly textShadow?: string;

  // Background (optional)
  readonly backgroundColor?: string;
  readonly backgroundGradient?: string;

  // Border (optional)
  readonly borderWidth?: number;
  readonly borderColor?: string;
  readonly borderRadius?: number | BorderRadiusTuple;
  readonly borderStyle?: string;

  // Visual effects (optional except opacity)
  readonly boxShadow?: string;
  readonly filter?: string;
  readonly backdropFilter?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;

  // Layout (optional)
  readonly padding?: string;
  readonly objectFit?: string;

  // SVG stroke/fill (optional)
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: string;
  readonly strokeDashoffset?: number;
  readonly strokeLinecap?: StrokeLinecap;
  readonly strokeLinejoin?: StrokeLinejoin;
  readonly strokeOpacity?: number;
  readonly fill?: string;
  readonly fillOpacity?: number;
  readonly fillRule?: FillRule;
}

// ---------------------------------------------------------------------------
// Padding validation helper
// ---------------------------------------------------------------------------

/**
 * Validates that a CSS padding shorthand contains only non-negative values.
 * Accepts numeric tokens (e.g. "10 20 10 20" or "0").
 */
function isNonNegativePadding(padding: string): boolean {
  const tokens = padding.trim().split(/\s+/);

  for (const token of tokens) {
    const num = Number(token);

    if (Number.isNaN(num) || num < 0) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const borderRadiusSchema = z.union([
  z.number().nonnegative(),
  z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
]);

export const styleSchema = z
  .object({
    opacity: z.number().min(0).max(1),

    // Typography
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    fontColor: z.string().optional(),
    fontWeight: z.string().optional(),
    fontStyle: z.string().optional(),
    textAlignment: z.string().optional(),
    textDecoration: z.string().optional(),
    textTransform: z.string().optional(),
    letterSpacing: z.string().optional(),
    lineHeight: z.union([z.number(), z.string()]).optional(),
    wordSpacing: z.string().optional(),

    // Text effects
    textStroke: z.string().optional(),
    textShadow: z.string().optional(),

    // Background
    backgroundColor: z.string().optional(),
    backgroundGradient: z.string().optional(),

    // Border
    borderWidth: z.number().optional(),
    borderColor: z.string().optional(),
    borderRadius: borderRadiusSchema.optional(),
    borderStyle: z.string().optional(),

    // Visual effects
    boxShadow: z.string().optional(),
    filter: z.string().optional(),
    backdropFilter: z.string().optional(),
    mixBlendMode: z.string().optional(),
    isolation: z.string().optional(),

    // Layout
    padding: z.string().optional(),
    objectFit: z.string().optional(),

    // SVG stroke/fill
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    strokeDasharray: z.string().optional(),
    strokeDashoffset: z.number().optional(),
    strokeLinecap: z.enum(['butt', 'round', 'square']).optional(),
    strokeLinejoin: z.enum(['miter', 'round', 'bevel']).optional(),
    strokeOpacity: z.number().min(0).max(1).optional(),
    fill: z.string().optional(),
    fillOpacity: z.number().min(0).max(1).optional(),
    fillRule: z.enum(['nonzero', 'evenodd']).optional(),
  })
  .refine(
    (val) => {
      if (val.padding !== undefined) {
        return isNonNegativePadding(val.padding);
      }

      return true;
    },
    { message: 'Padding values must be non-negative' },
  );

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Creates a default BroadsetElementStyle with only the required opacity field. */
export function createDefaultStyle(): BroadsetElementStyle {
  return { opacity: 1 };
}
