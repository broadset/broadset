import type { projectFormatV1 } from '@broadset/model';

import { gradientToCss } from './gradient-css';
import { colorValueToCss, formatCssNumber } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';

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
  readonly backgroundBlendMode?: string;
  readonly filter?: string;
  readonly backdropFilter?: string;
  /** Complete inert JSON for enabled effects that require a later compositor. */
  readonly deferredEffects?: string;
}

const OPAQUE = 1;
const NORMAL_BLEND = 'normal';
const PIXEL_CONTEXT: PhysicalUnitContextV1 = { unit: 'px', dpi: 96 };

const APPEARANCE_OUTPUT_BUDGET_V1 = 64;

export function appearanceWithinOutputBudgetV1(appearance: Appearance): boolean {
  return appearance.fills.length + appearance.strokes.length + appearance.effects.length <= APPEARANCE_OUTPUT_BUDGET_V1;
}

function pixels(value: number, units: PhysicalUnitContextV1): string {
  return `${formatCssNumber(spatialValueToCssPixelsV1(value, units))}px`;
}

/**
 * A single CSS background-image layer for a paint. `solid` becomes a same-color `linear-gradient` so it
 * can layer with other fills; `pattern`/`picture` need runtime asset-URL resolution and are handled by
 * the element renderer, not this pure resolver.
 */
function colorWithOpacity(color: string, opacity: number): string {
  return opacity === OPAQUE ? color : `color-mix(in srgb, ${color} ${formatCssNumber(opacity * 100)}%, transparent)`;
}

export function paintToBackgroundLayerV1(paint: Paint, swatches: Swatches, opacity = OPAQUE): string | undefined {
  switch (paint.kind) {
    case 'none':
    case 'pattern':
    case 'picture':
      return undefined;

    case 'solid': {
      const color = colorWithOpacity(colorValueToCss(paint.color, swatches), opacity);

      return `linear-gradient(${color}, ${color})`;
    }

    case 'gradient':
      return gradientToCss(paint.gradient, swatches, opacity);
  }
}

/** Enabled fills as a CSS `background-image` layer list. v1 fills paint bottom-to-top; CSS layers paint
 * top-first, so the enabled layers are reversed. */
function fillsToBackground(
  appearance: Appearance,
  swatches: Swatches,
): { readonly image?: string; readonly blendMode?: string } {
  const layers = appearance.fills
    .filter((fill) => fill.enabled)
    .flatMap((fill) => {
      const image = paintToBackgroundLayerV1(fill.paint, swatches, fill.opacity);

      return image === undefined ? [] : [{ image, blendMode: fill.blendMode }];
    })
    .reverse();

  if (layers.length === 0) return {};

  return {
    image: layers.map((layer) => layer.image).join(', '),
    ...(layers.some((layer) => layer.blendMode !== NORMAL_BLEND) ?
      { blendMode: layers.map((layer) => layer.blendMode).join(', ') }
    : {}),
  };
}

/** CSS `filter` function for an effect, or `undefined` when it needs an SVG filter (color-matrix, bevel,
 * displacement, inner-shadow) or a different property (backdrop-blur). */
function effectToFilter(effect: Effect, swatches: Swatches, units: PhysicalUnitContextV1): string | undefined {
  if (effect.blendMode !== NORMAL_BLEND) return undefined;

  switch (effect.kind) {
    case 'blur':
      return effect.opacity === OPAQUE ? `blur(${pixels(effect.radius, units)})` : undefined;

    case 'drop-shadow': {
      const [offsetX, offsetY] = effect.offset;

      return effect.spread === 0 && effect.opacity === OPAQUE ?
          `drop-shadow(${pixels(offsetX, units)} ${pixels(offsetY, units)} ${pixels(effect.radius, units)} ${colorValueToCss(effect.color, swatches)})`
        : undefined;
    }

    case 'glow':
      return !effect.inner && effect.spread === 0 && effect.opacity === OPAQUE ?
          `drop-shadow(0 0 ${pixels(effect.radius, units)} ${colorValueToCss(effect.color, swatches)})`
        : undefined;
    case 'opacity':
      return effect.opacity === OPAQUE ? `opacity(${formatCssNumber(effect.amount)})` : undefined;
    case 'inner-shadow':
    case 'color-matrix':
    case 'bevel':
    case 'displacement':
    case 'backdrop-blur':
      return undefined;
  }
}

function spatialEffectMetadata(effect: Effect, units: PhysicalUnitContextV1): Readonly<Record<string, unknown>> {
  const converted = (value: number): number => spatialValueToCssPixelsV1(value, units);

  switch (effect.kind) {
    case 'blur':
    case 'backdrop-blur':
      return { radius: converted(effect.radius) };
    case 'drop-shadow':
    case 'inner-shadow':
      return {
        offset: [converted(effect.offset[0]), converted(effect.offset[1])],
        radius: converted(effect.radius),
        spread: converted(effect.spread),
      };
    case 'glow':
      return { radius: converted(effect.radius), spread: converted(effect.spread) };
    case 'bevel':
      return { depth: converted(effect.depth), soften: converted(effect.soften) };
    case 'displacement':
      return { scale: [converted(effect.scale[0]), converted(effect.scale[1])] };
    case 'color-matrix':
    case 'opacity':
      return {};
  }
}

function isDeferredEffect(effect: Effect): boolean {
  if (!effect.enabled) return false;
  if (effect.kind === 'backdrop-blur') return effect.opacity !== OPAQUE || effect.blendMode !== NORMAL_BLEND;

  return effectToFilter(effect, new Map(), PIXEL_CONTEXT) === undefined;
}

function collectFilters(
  appearance: Appearance,
  swatches: Swatches,
  units: PhysicalUnitContextV1,
): { readonly filter?: string; readonly backdropFilter?: string } {
  const enabled = appearance.effects.filter((effect) => effect.enabled);
  const filters = enabled
    .map((effect) => effectToFilter(effect, swatches, units))
    .filter((value): value is string => value !== undefined);
  const backdrop = enabled.flatMap((effect) =>
    effect.kind === 'backdrop-blur' && effect.opacity === OPAQUE && effect.blendMode === NORMAL_BLEND ?
      [`blur(${pixels(effect.radius, units)})`]
    : [],
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
export function appearanceToStyle(
  appearance: Appearance,
  swatches: Swatches,
  units: PhysicalUnitContextV1 = PIXEL_CONTEXT,
): AppearanceStyle {
  if (!appearanceWithinOutputBudgetV1(appearance)) return {};

  const background = fillsToBackground(appearance, swatches);
  const { filter, backdropFilter } = collectFilters(appearance, swatches, units);
  const deferred = appearance.effects
    .filter(isDeferredEffect)
    .map((effect) => ({ effect, spatialPixels: spatialEffectMetadata(effect, units) }));

  return {
    ...(appearance.opacity !== OPAQUE ? { opacity: formatCssNumber(appearance.opacity) } : {}),
    ...(appearance.blendMode !== NORMAL_BLEND ? { mixBlendMode: appearance.blendMode } : {}),
    ...(appearance.isolation ? { isolation: 'isolate' } : {}),
    ...(background.image !== undefined ? { backgroundImage: background.image } : {}),
    ...(background.blendMode !== undefined ? { backgroundBlendMode: background.blendMode } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(backdropFilter !== undefined ? { backdropFilter } : {}),
    ...(deferred.length > 0 ? { deferredEffects: JSON.stringify(deferred) } : {}),
  };
}
