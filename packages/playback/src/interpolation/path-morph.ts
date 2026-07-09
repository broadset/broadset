import { interpolate as flubberInterpolate } from 'flubber';

import { clampUnitInterval } from './number';

export interface InterpolatePathDOptions {
  readonly fromD: string;
  readonly toD: string;
  readonly progress: number;
}

/**
 * Morphs between two SVG path d-strings whose command structures need not
 * match. Delegates to flubber, which resamples both paths into a common
 * topology and interpolates per-vertex.
 *
 * For same-topology morphs (identical commands + lengths), prefer
 * `interpolatePath` from `tuple-path.ts` — it avoids flubber's resampling
 * overhead.
 */
export function interpolatePathD(options: InterpolatePathDOptions): string {
  const interpolator = flubberInterpolate(options.fromD, options.toD);

  return interpolator(clampUnitInterval(options.progress));
}

const SVG_PATH_LEADING_MOVETO = /^\s*[Mm][\s,+\-.0-9]/u;

/**
 * Conservative check for SVG path d-strings. Requires the string to start
 * with a moveto command followed by a separator or number — enough to avoid
 * misidentifying ordinary strings that begin with the letter M.
 */
export function isSvgPathD(value: string): boolean {
  return SVG_PATH_LEADING_MOVETO.test(value);
}
