import type { projectFormatV1 } from '@broadset/model';

import { gradientToCss } from './gradient-css';
import { colorValueToCss, formatCssNumber } from './paint-css';

type Appearance = projectFormatV1.Appearance;
type Paint = projectFormatV1.Paint;
type Effect = projectFormatV1.Effect;
type Swatch = projectFormatV1.Swatch;
type Id = projectFormatV1.Id;

type Swatches = ReadonlyMap<Id, Swatch>;

/** The appearance-derived CSS for a rendered node. Only the properties that apply are present. */
export interface AppearanceStyle {
  readonly opacity?: string;
  readonly mixBlendMode?: string;
  readonly isolation?: string;
  readonly backgroundImage?: string;
  readonly filter?: string;
  readonly backdropFilter?: string;
}

const OPAQUE = 1;
const NORMAL_BLEND = 'normal';

/**
 * A single CSS background-image layer for a paint. `solid` becomes a same-color `linear-gradient` so it
 * can layer with other fills; `pattern`/`picture` need runtime asset-URL resolution and are handled by
 * the element renderer, not this pure resolver.
 */
function paintToBackgroundLayer(paint: Paint, swatches: Swatches): string | undefined {
  switch (paint.kind) {
    case 'none':
    case 'pattern':
    case 'picture':
      return undefined;

    case 'solid': {
      const color = colorValueToCss(paint.color, swatches);

      return `linear-gradient(${color}, ${color})`;
    }

    case 'gradient':
      return gradientToCss(paint.gradient, swatches);
  }
}

/** Enabled fills as a CSS `background-image` layer list. v1 fills paint bottom-to-top; CSS layers paint
 * top-first, so the enabled layers are reversed. */
function fillsToBackgroundImage(appearance: Appearance, swatches: Swatches): string | undefined {
  const layers = appearance.fills
    .filter((fill) => fill.enabled)
    .map((fill) => paintToBackgroundLayer(fill.paint, swatches))
    .filter((layer): layer is string => layer !== undefined);

  if (layers.length === 0) return undefined;

  return [...layers].reverse().join(', ');
}

/** CSS `filter` function for an effect, or `undefined` when it needs an SVG filter (color-matrix, bevel,
 * displacement, inner-shadow) or a different property (backdrop-blur). */
function effectToFilter(effect: Effect, swatches: Swatches): string | undefined {
  switch (effect.kind) {
    case 'blur':
      return `blur(${formatCssNumber(effect.radius)}px)`;

    case 'drop-shadow': {
      const [offsetX, offsetY] = effect.offset;

      return `drop-shadow(${formatCssNumber(offsetX)}px ${formatCssNumber(offsetY)}px ${formatCssNumber(effect.radius)}px ${colorValueToCss(effect.color, swatches)})`;
    }

    case 'glow':
      return `drop-shadow(0 0 ${formatCssNumber(effect.radius)}px ${colorValueToCss(effect.color, swatches)})`;
    case 'opacity':
      return `opacity(${formatCssNumber(effect.amount)})`;
    case 'inner-shadow':
    case 'color-matrix':
    case 'bevel':
    case 'displacement':
    case 'backdrop-blur':
      return undefined;
  }
}

function collectFilters(appearance: Appearance, swatches: Swatches): { readonly filter?: string; readonly backdropFilter?: string } {
  const enabled = appearance.effects.filter((effect) => effect.enabled);
  const filters = enabled.map((effect) => effectToFilter(effect, swatches)).filter((value): value is string => value !== undefined);
  const backdrop = enabled.flatMap((effect) =>
    effect.kind === 'backdrop-blur' ? [`blur(${formatCssNumber(effect.radius)}px)`] : [],
  );

  return {
    ...(filters.length > 0 ? { filter: filters.join(' ') } : {}),
    ...(backdrop.length > 0 ? { backdropFilter: backdrop.join(' ') } : {}),
  };
}

/**
 * Map a v1 `Appearance` to CSS style properties. Covers opacity, blend mode, isolation, fills
 * (solid/gradient as layered backgrounds), and CSS-expressible effects (blur, drop-shadow, glow,
 * opacity, backdrop-blur). Strokes, clip/mask, pattern/picture fills, and SVG-only effects (color-matrix,
 * bevel, displacement, inner-shadow) are resolved elsewhere and omitted here.
 */
export function appearanceToStyle(appearance: Appearance, swatches: Swatches): AppearanceStyle {
  const backgroundImage = fillsToBackgroundImage(appearance, swatches);
  const { filter, backdropFilter } = collectFilters(appearance, swatches);

  return {
    ...(appearance.opacity !== OPAQUE ? { opacity: formatCssNumber(appearance.opacity) } : {}),
    ...(appearance.blendMode !== NORMAL_BLEND ? { mixBlendMode: appearance.blendMode } : {}),
    ...(appearance.isolation ? { isolation: 'isolate' } : {}),
    ...(backgroundImage !== undefined ? { backgroundImage } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(backdropFilter !== undefined ? { backdropFilter } : {}),
  };
}
