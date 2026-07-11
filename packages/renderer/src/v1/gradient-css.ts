import type { projectFormatV1 } from '@broadset/model';

import { concreteColorToCss, formatCssNumber, resolveConcreteColor } from './paint-css';

type Gradient = projectFormatV1.Gradient;
type GradientStop = projectFormatV1.GradientStop;
type Swatch = projectFormatV1.Swatch;
type Id = projectFormatV1.Id;

const PERCENT = 100;
const DEGREES_PER_TURN = 360;
const RADIANS_TO_DEGREES = 180 / Math.PI;

type Swatches = ReadonlyMap<Id, Swatch>;

/** A single CSS color stop: the stop's color (with its per-stop opacity folded into alpha) at `offset`. */
function stopToCss(stop: GradientStop, swatches: Swatches): string {
  const concrete = resolveConcreteColor(stop.color, swatches);
  const color =
    concrete === undefined ? 'transparent' : concreteColorToCss({ ...concrete, alpha: concrete.alpha * stop.opacity });

  return `${color} ${formatCssNumber(stop.offset * PERCENT)}%`;
}

/** Stops in ascending `offset` order — CSS clamps out-of-order stop positions, so ordering is required. */
function stopsToCss(stops: readonly GradientStop[], swatches: Swatches): string {
  return [...stops]
    .sort((left, right) => left.offset - right.offset)
    .map((stop) => stopToCss(stop, swatches))
    .join(', ');
}

/** A normalized (object-bounds) point as a CSS position percentage pair. */
function positionCss(point: readonly [number, number]): string {
  return `${formatCssNumber(point[0] * PERCENT)}% ${formatCssNumber(point[1] * PERCENT)}%`;
}

function ellipseSizeCss(radius: readonly [number, number]): string {
  return `${formatCssNumber(radius[0] * PERCENT)}% ${formatCssNumber(radius[1] * PERCENT)}%`;
}

/**
 * CSS gradient-line angle for a v1 linear gradient. CSS `0deg` points to the top and increases
 * clockwise; the v1 start→end vector lives in a y-down space, so the angle is `atan2(dx, -dy)`.
 */
function linearAngleDeg(start: readonly [number, number], end: readonly [number, number]): number {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const degrees = Math.atan2(deltaX, -deltaY) * RADIANS_TO_DEGREES;

  return ((degrees % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN;
}

function interpolationClause(interpolation: Gradient['interpolation']): string {
  switch (interpolation) {
    case 'srgb':
      return '';
    case 'linear-srgb':
      return ' in srgb-linear';
    case 'oklab':
      return ' in oklab';
  }
}

/** `repeat`/`reflect` map to CSS `repeating-*`; CSS has no true reflect, so it is approximated by repeat. */
function repeatingPrefix(spread: Gradient['spread']): string {
  return spread === 'pad' ? '' : 'repeating-';
}

/**
 * Map a v1 `Gradient` to a CSS gradient string for an element background. Positions are emitted as
 * object-bounds percentages; the gradient `transform`, radial `focalPoint`, and `user-space` coordinates
 * are not expressible in a bare CSS gradient and are omitted (approximations, not exact reproduction).
 * `diamond` (no CSS equivalent) approximates as a radial gradient; `producer-preserved` falls back to a
 * left-to-right linear gradient of its stops. A gradient with no stops fails closed to `'transparent'`.
 */
export function gradientToCss(gradient: Gradient, swatches: Swatches): string {
  if (gradient.stops.length === 0) return 'transparent';

  const stops = stopsToCss(gradient.stops, swatches);
  const prefix = repeatingPrefix(gradient.spread);
  const interpolation = interpolationClause(gradient.interpolation);

  switch (gradient.kind) {
    case 'linear': {
      const angle = linearAngleDeg(gradient.start, gradient.end);

      return `${prefix}linear-gradient(${formatCssNumber(angle)}deg${interpolation}, ${stops})`;
    }

    case 'radial':
    case 'diamond':
      return `${prefix}radial-gradient(${ellipseSizeCss(gradient.radius)} at ${positionCss(gradient.center)}${interpolation}, ${stops})`;
    case 'conic':
      return `${prefix}conic-gradient(from ${formatCssNumber(gradient.startAngle)}deg at ${positionCss(gradient.center)}${interpolation}, ${stops})`;
    case 'producer-preserved':
      return `linear-gradient(to right${interpolation}, ${stops})`;
  }
}
