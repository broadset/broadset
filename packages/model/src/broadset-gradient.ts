import { z } from 'zod';

import { type BroadsetColor, broadsetColorSchema, type ColorMods, colorModsSchema } from './broadset-color';

/**
 * Structured gradient stop used by `BroadsetGradient`. The `color` field
 * carries a full {@link BroadsetColor} (theme references and non-sRGB
 * spaces round-trip per IO-D-05). `mods` apply PowerPoint-style tonal
 * tweaks on top of `color` at render/export time.
 */
export interface BroadsetGradientStop {
  readonly color: BroadsetColor;
  readonly position: number;
  /**
   * Per-stop PowerPoint-style color modifiers. Applied on top of `color`
   * at render/export time via `_shared/color/applyMods` (Phase 2). Enables
   * theme-driven gradients where every stop inherits from the same slot
   * and varies by `lumMod` / `lumOff` / `tint` / `shade` / `alpha`.
   */
  readonly mods?: ColorMods | undefined;
}

/**
 * Structured gradient consumed by {@link BroadsetFill} and by
 * exporters. The `type` discriminator picks the CSS gradient family;
 * `angle`, `center`, and `startAngle` cover the superset of CSS linear /
 * radial / conic knobs needed for PPTX / PSD / PDF / SVG round-trip.
 */
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

export const broadsetGradientSchema = z
  .object({
    type: z.enum(['linear', 'radial', 'conic']),
    stops: z
      .array(
        z.object({
          color: broadsetColorSchema,
          position: z.number().min(0).max(100),
          mods: colorModsSchema.optional(),
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
