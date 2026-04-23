import { z } from 'zod';

import { type BroadsetColor,broadsetColorSchema } from './broadset-color';
import { type BroadsetGradient } from './style';

/**
 * Phase 1 unit #8 — `BroadsetFill` is the discriminated union that
 * will replace the flat `fill`, `backgroundColor`, and
 * `backgroundGradient` fields on `BroadsetElementStyle`. Every fill
 * source a format can emit — solid color, gradient, SVG `<pattern>` /
 * PPTX pattern / PDF tiling pattern, and picture (PPTX `<a:blipFill>`,
 * SVG `<image>`-in-pattern, PDF image XObject) — lands in one closed
 * set.
 *
 * This module is additive in its first sub-commit (8a): it defines
 * the types, Zod schema, factories, and type guards. The field-type
 * flip on `BroadsetElementStyle` ships in a later sub-commit once
 * renderer / editor / formats consumers are migrated.
 */

/** Flat 2x3 affine matrix `[a, b, c, d, e, f]` applied to a pattern tile before repeat. */
export type AffineMatrix = readonly [number, number, number, number, number, number];

export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';

export type PictureFillMode = 'stretch' | 'tile';

export type PicturePreserveAspectRatio = 'none' | 'meet' | 'slice';

export interface TileInfo {
  readonly scaleX?: number | undefined;
  readonly scaleY?: number | undefined;
  readonly offsetX?: number | undefined;
  readonly offsetY?: number | undefined;
}

export type FillKind = 'none' | 'solid' | 'gradient' | 'pattern' | 'picture';

export interface NoneFill {
  readonly kind: 'none';
}

export interface SolidFill {
  readonly kind: 'solid';
  readonly color: BroadsetColor;
}

export interface GradientFill {
  readonly kind: 'gradient';
  readonly gradient: BroadsetGradient;
}

export interface PatternFill {
  readonly kind: 'pattern';
  readonly assetId: string;
  readonly repeat?: PatternRepeat | undefined;
  readonly transform?: AffineMatrix | undefined;
}

export interface PictureFill {
  readonly kind: 'picture';
  readonly assetId: string;
  readonly mode: PictureFillMode;
  readonly preserveAspectRatio?: PicturePreserveAspectRatio | undefined;
  readonly tile?: TileInfo | undefined;
}

export type BroadsetFill = NoneFill | SolidFill | GradientFill | PatternFill | PictureFill;

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const affineMatrixSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]);

const patternRepeatSchema = z.enum(['repeat', 'repeat-x', 'repeat-y', 'no-repeat']);

const pictureFillModeSchema = z.enum(['stretch', 'tile']);

const picturePreserveAspectRatioSchema = z.enum(['none', 'meet', 'slice']);

const tileInfoSchema = z.object({
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
});

const gradientFillGradientSchema = z.object({
  type: z.enum(['linear', 'radial', 'conic']),
  stops: z
    .array(
      z.object({
        color: broadsetColorSchema,
        position: z.number().min(0).max(100),
      }),
    )
    .min(2),
  angle: z.number().min(0).max(360).optional(),
  center: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]).optional(),
  startAngle: z.number().min(0).max(360).optional(),
});

const noneFillSchema = z.object({ kind: z.literal('none') });

const solidFillSchema = z.object({
  kind: z.literal('solid'),
  color: broadsetColorSchema,
});

const gradientFillSchema = z.object({
  kind: z.literal('gradient'),
  gradient: gradientFillGradientSchema,
});

const patternFillSchema = z.object({
  kind: z.literal('pattern'),
  assetId: z.string().min(1),
  repeat: patternRepeatSchema.optional(),
  transform: affineMatrixSchema.optional(),
});

const pictureFillSchema = z.object({
  kind: z.literal('picture'),
  assetId: z.string().min(1),
  mode: pictureFillModeSchema,
  preserveAspectRatio: picturePreserveAspectRatioSchema.optional(),
  tile: tileInfoSchema.optional(),
});

export const broadsetFillSchema: z.ZodType<BroadsetFill> = z.discriminatedUnion('kind', [
  noneFillSchema,
  solidFillSchema,
  gradientFillSchema,
  patternFillSchema,
  pictureFillSchema,
]);

// ────────────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────────────

export function noneFill(): NoneFill {
  return { kind: 'none' };
}

export function solidFill(color: BroadsetColor): SolidFill {
  return { kind: 'solid', color };
}

export function gradientFill(gradient: BroadsetGradient): GradientFill {
  return { kind: 'gradient', gradient };
}

export interface PatternFillOptions {
  readonly assetId: string;
  readonly repeat?: PatternRepeat | undefined;
  readonly transform?: AffineMatrix | undefined;
}

export function patternFill(options: PatternFillOptions): PatternFill {
  return {
    kind: 'pattern',
    assetId: options.assetId,
    ...(options.repeat === undefined ? {} : { repeat: options.repeat }),
    ...(options.transform === undefined ? {} : { transform: options.transform }),
  };
}

export interface PictureFillOptions {
  readonly assetId: string;
  readonly mode: PictureFillMode;
  readonly preserveAspectRatio?: PicturePreserveAspectRatio | undefined;
  readonly tile?: TileInfo | undefined;
}

export function pictureFill(options: PictureFillOptions): PictureFill {
  return {
    kind: 'picture',
    assetId: options.assetId,
    mode: options.mode,
    ...(options.preserveAspectRatio === undefined ? {} : { preserveAspectRatio: options.preserveAspectRatio }),
    ...(options.tile === undefined ? {} : { tile: options.tile }),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Type guards
// ────────────────────────────────────────────────────────────────────────────

export function isNoneFill(fill: BroadsetFill): fill is NoneFill {
  return fill.kind === 'none';
}

export function isSolidFill(fill: BroadsetFill): fill is SolidFill {
  return fill.kind === 'solid';
}

export function isGradientFill(fill: BroadsetFill): fill is GradientFill {
  return fill.kind === 'gradient';
}

export function isPatternFill(fill: BroadsetFill): fill is PatternFill {
  return fill.kind === 'pattern';
}

export function isPictureFill(fill: BroadsetFill): fill is PictureFill {
  return fill.kind === 'picture';
}
