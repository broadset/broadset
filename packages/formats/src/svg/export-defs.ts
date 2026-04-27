/**
 * Exporter-side `<defs>` rendering. Owns gradient / shadow /
 * filter-stack / pattern / mask / marker primitive emission so the
 * orchestrator (`export.ts`) stays focused on element walking and
 * `<defs>` collection. Each function is pure: it consumes a
 * Broadset value plus a stable `id` and returns the SVG markup
 * string. Caller (the `DefsCollector` in `export.ts`) owns id
 * assignment so multiple elements sharing the same gradient /
 * shadow content reuse a single emitted `<defs>` node.
 *
 * Split out of `export.ts` in P7.7n to bring the orchestrator
 * back under the soft size limit.
 */
import {
  type ArrowEnd,
  type BroadsetGradient,
  colorToCss,
  type FilterPrimitive,
  type FilterStack,
  type PatternFill,
  type PictureFill,
} from '@broadset/model';

import { sanitizeSvg } from '../_shared/sanitize';
import { escapeXml, isAllowedImageUrlScheme } from './shared';

/* ------------------------------------------------------------------ */
/*  Gradient Defs                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render a gradient `<defs>` entry with the supplied `id`. The
 * caller (`DefsCollector`) owns id assignment so multiple elements
 * sharing the same gradient content reuse a single `<defs>` node.
 * Returns `''` when the gradient kind has no native SVG primitive
 * — the caller treats empty defs as a no-op fill.
 */
export function renderGradientDef(id: string, gradient: BroadsetGradient): string {
  // Conic gradients fall back to a linear approximation on the
  // visual layer; the metadata packet carries the original spec so
  // re-import recovers the true type.
  const effective = gradient.type === 'conic' ? conicFallbackGradient(gradient) : gradient;
  const stops = effective.stops
    .map((s) => `<stop offset="${String(s.position * 100)}%" stop-color="${escapeXml(colorToCss(s.color))}"/>`)
    .join('');

  if (effective.type === 'linear') {
    const angle = effective.angle ?? 0;
    const rad = (angle * Math.PI) / 180;
    const x2 = Math.round((Math.cos(rad) * 0.5 + 0.5) * 100) / 100;
    const y2 = Math.round((Math.sin(rad) * 0.5 + 0.5) * 100) / 100;
    const x1 = 1 - x2;
    const y1 = 1 - y2;

    return `<linearGradient id="${id}" x1="${String(x1)}" y1="${String(y1)}" x2="${String(x2)}" y2="${String(y2)}">${stops}</linearGradient>`;
  }

  if (effective.type === 'radial') {
    const cx = (effective.center?.[0] ?? 50) / 100;
    const cy = (effective.center?.[1] ?? 50) / 100;

    return `<radialGradient id="${id}" cx="${String(cx)}" cy="${String(cy)}" r="0.5">${stops}</radialGradient>`;
  }

  return '';
}

/**
 * The fill used by the visual layer when a conic gradient is
 * requested. Conic has no SVG 2 primitive, so we emit a many-stop
 * linear approximation — the true spec rides in `<metadata>` and is
 * recovered on re-import.
 */
export function conicFallbackGradient(conic: BroadsetGradient): BroadsetGradient {
  return {
    type: 'linear',
    angle: conic.startAngle ?? 0,
    stops: conic.stops,
  };
}

/* ------------------------------------------------------------------ */
/*  Box-Shadow → SVG Filter Approximation                            */
/* ------------------------------------------------------------------ */

export function renderShadowFilter(id: string, shadow: string): string {
  // Parse simple box-shadow: <x>px <y>px <blur>px <color>
  const match = /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(.+)$/.exec(shadow.trim());

  if (match === null) return '';

  const dx = match[1];
  const dy = match[2];
  const blur = match[3];
  const color = match[4];

  if (dx === undefined || dy === undefined || blur === undefined || color === undefined) return '';

  return `<filter id="${id}"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${String(Number(blur) / 2)}" flood-color="${escapeXml(color.trim())}"/></filter>`;
}

/* ------------------------------------------------------------------ */
/*  FilterStack → <filter>                                            */
/* ------------------------------------------------------------------ */

/**
 * Render a structured `FilterStack` as a single `<filter>` def.
 * Each primitive emits its corresponding SVG filter primitive
 * (`<feGaussianBlur>`, `<feColorMatrix>`, `<feDropShadow>`,
 * `<feComponentTransfer>`). Empty stacks return `''` so the
 * caller skips emission and the element gets no `filter=` attr.
 */
export function renderFilterStackDef(id: string, stack: FilterStack): string {
  if (stack.length === 0) return '';

  const primitives = stack.map(renderFilterPrimitive).filter((s) => s !== '');

  if (primitives.length === 0) return '';

  return `<filter id="${id}">${primitives.join('')}</filter>`;
}

function renderFilterPrimitive(primitive: FilterPrimitive): string {
  switch (primitive.kind) {
    case 'blur':
      return `<feGaussianBlur stdDeviation="${String(primitive.stdDeviation)}"/>`;

    case 'color-matrix':
      return `<feColorMatrix type="matrix" values="${primitive.matrix.join(' ')}"/>`;

    case 'drop-shadow': {
      const colorCss = colorToCss(primitive.color);

      return `<feDropShadow dx="${String(primitive.offsetX)}" dy="${String(primitive.offsetY)}" stdDeviation="${String(primitive.blur / 2)}" flood-color="${escapeXml(colorCss)}"/>`;
    }

    case 'hue-rotate':
      return `<feColorMatrix type="hueRotate" values="${String(primitive.amount)}"/>`;

    case 'saturate':
      return `<feColorMatrix type="saturate" values="${String(primitive.amount)}"/>`;

    case 'grayscale':
      return renderGrayscaleMatrix(primitive.amount);

    case 'sepia':
      return renderSepiaMatrix(primitive.amount);

    case 'invert':
      return renderInvertComponentTransfer(primitive.amount);

    case 'brightness':
      return renderBrightnessComponentTransfer(primitive.amount);

    case 'contrast':
      return renderContrastComponentTransfer(primitive.amount);

    case 'opacity':
      return `<feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${String(primitive.amount)} 0"/>`;

    case 'custom-svg':
      // Custom SVG filter primitives are sanitised at the renderer
      // boundary per FilterStack docs; emit verbatim through the
      // shared SVG sanitizer to drop any active payload.
      return sanitizeSvg(primitive.svg).ast.markup;
  }
}

/**
 * Canonical CSS-equivalent matrices for the grayscale / sepia
 * amount-based filters. The values match the W3C CSS Filter Effects
 * 1 algorithm so consumer browsers reproduce the same output as
 * `filter: grayscale(0.5)`.
 */
function renderGrayscaleMatrix(amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const r = String(0.2126 + 0.7874 * (1 - a));
  const g = String(0.7152 - 0.7152 * (1 - a));
  const b = String(0.0722 - 0.0722 * (1 - a));
  const r2 = String(0.2126 - 0.2126 * (1 - a));
  const g2 = String(0.7152 + 0.2848 * (1 - a));
  const b2 = String(0.0722 - 0.0722 * (1 - a));
  const r3 = String(0.2126 - 0.2126 * (1 - a));
  const g3 = String(0.7152 - 0.7152 * (1 - a));
  const b3 = String(0.0722 + 0.9278 * (1 - a));
  const matrix = `${r} ${g} ${b} 0 0 ${r2} ${g2} ${b2} 0 0 ${r3} ${g3} ${b3} 0 0 0 0 0 1 0`;

  return `<feColorMatrix type="matrix" values="${matrix}"/>`;
}

function renderSepiaMatrix(amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const r = String(0.393 + 0.607 * (1 - a));
  const g = String(0.769 - 0.769 * (1 - a));
  const b = String(0.189 - 0.189 * (1 - a));
  const r2 = String(0.349 - 0.349 * (1 - a));
  const g2 = String(0.686 + 0.314 * (1 - a));
  const b2 = String(0.168 - 0.168 * (1 - a));
  const r3 = String(0.272 - 0.272 * (1 - a));
  const g3 = String(0.534 - 0.534 * (1 - a));
  const b3 = String(0.131 + 0.869 * (1 - a));
  const matrix = `${r} ${g} ${b} 0 0 ${r2} ${g2} ${b2} 0 0 ${r3} ${g3} ${b3} 0 0 0 0 0 1 0`;

  return `<feColorMatrix type="matrix" values="${matrix}"/>`;
}

/**
 * `invert(a)` per CSS: out = 1 - 2a + 2a*in, clamped. Implemented
 * via `<feComponentTransfer>` with linear funcR/G/B. Same form
 * works for `brightness(a)` (slope=a, intercept=0) and
 * `contrast(a)` (slope=a, intercept=0.5*(1-a)).
 */
function renderInvertComponentTransfer(amount: number): string {
  const slope = String(1 - 2 * amount);
  const intercept = String(amount);

  return `<feComponentTransfer data-bs-filter-primitive="invert"><feFuncR type="linear" slope="${slope}" intercept="${intercept}"/><feFuncG type="linear" slope="${slope}" intercept="${intercept}"/><feFuncB type="linear" slope="${slope}" intercept="${intercept}"/></feComponentTransfer>`;
}

function renderBrightnessComponentTransfer(amount: number): string {
  const slope = String(amount);

  return `<feComponentTransfer data-bs-filter-primitive="brightness"><feFuncR type="linear" slope="${slope}"/><feFuncG type="linear" slope="${slope}"/><feFuncB type="linear" slope="${slope}"/></feComponentTransfer>`;
}

function renderContrastComponentTransfer(amount: number): string {
  const slope = String(amount);
  const intercept = String((1 - amount) / 2);

  return `<feComponentTransfer data-bs-filter-primitive="contrast"><feFuncR type="linear" slope="${slope}" intercept="${intercept}"/><feFuncG type="linear" slope="${slope}" intercept="${intercept}"/><feFuncB type="linear" slope="${slope}" intercept="${intercept}"/></feComponentTransfer>`;
}

/* ------------------------------------------------------------------ */
/*  Pattern + Mask Defs                                               */
/* ------------------------------------------------------------------ */

/**
 * Render a `<pattern>` def for `fill.kind === 'pattern'` /
 * `'picture'`. The pattern body references the asset id as the
 * `<image href>`; consumers resolve assets via their own registry.
 */
export function renderPatternDef(
  id: string,
  fill: PatternFill | PictureFill,
  elementWidth: number,
  elementHeight: number,
  assetResolver?: (assetId: string) => string | undefined,
): string {
  const width = elementWidth > 0 ? elementWidth : 100;
  const height = elementHeight > 0 ? elementHeight : 100;
  const patternUnits = 'userSpaceOnUse';
  // P7.7l rejects unsafe schemes (javascript:, data:text/html)
  // returned by a malicious or compromised resolver.
  const resolved = assetResolver?.(fill.assetId) ?? fill.assetId;
  const href = isAllowedImageUrlScheme(resolved) ? resolved : '';
  const inner = `<image href="${escapeXml(href)}" xlink:href="${escapeXml(href)}" width="${String(width)}" height="${String(height)}" preserveAspectRatio="${fill.kind === 'picture' && fill.mode === 'stretch' ? 'none' : 'xMidYMid meet'}"/>`;

  return `<pattern id="${id}" patternUnits="${patternUnits}" width="${String(width)}" height="${String(height)}">${inner}</pattern>`;
}

/**
 * Render a `<mask>` def for an element with a custom mask path.
 * The mask's `<path>` carries the supplied `customClipPath` `d` value;
 * the element references it via `mask="url(#…)"`.
 */
export function renderMaskDef(id: string, maskPath: string, fillCss: string): string {
  // SVG mask convention: white = visible, black = hidden. The
  // path fills with `fillCss` (white by default) so the masked
  // shape shows through the path's geometry.
  return `<mask id="${id}" maskUnits="userSpaceOnUse"><path d="${escapeXml(maskPath)}" fill="${escapeXml(fillCss)}"/></mask>`;
}

/* ------------------------------------------------------------------ */
/*  Object-Fit → preserveAspectRatio Mapping                          */
/* ------------------------------------------------------------------ */

export function objectFitToPreserveAspectRatio(objectFit: string | undefined): string {
  switch (objectFit) {
    case 'contain':
      return 'xMidYMid meet';
    case 'cover':
      return 'xMidYMid slice';
    case 'fill':
      return 'none';
    case 'none':
      return 'xMidYMid meet';
    case 'scale-down':
      return 'xMidYMid meet';
    default:
      return 'xMidYMid slice'; // default to cover
  }
}

/* ------------------------------------------------------------------ */
/*  Arrow Marker Defs                                                 */
/* ------------------------------------------------------------------ */

function arrowEndScale(size: 'sm' | 'md' | 'lg' | undefined): number {
  if (size === 'sm') return 2;
  if (size === 'lg') return 6;

  return 4;
}

export function renderMarkerDef(id: string, end: ArrowEnd, stroke: string): string {
  const widthScale = arrowEndScale(end.width);
  const lengthScale = arrowEndScale(end.length);
  let path: string;

  switch (end.shape) {
    case 'stealth':
      path = `<path d="M0,0 L${String(lengthScale)},${String(widthScale / 2)} L${String(
        lengthScale * 0.6,
      )},${String(widthScale / 2)} L0,${String(widthScale)} Z" fill="${stroke}"/>`;
      break;
    case 'diamond':
      path = `<path d="M0,${String(widthScale / 2)} L${String(lengthScale / 2)},0 L${String(
        lengthScale,
      )},${String(widthScale / 2)} L${String(lengthScale / 2)},${String(widthScale)} Z" fill="${stroke}"/>`;
      break;
    case 'oval':
      path = `<ellipse cx="${String(lengthScale / 2)}" cy="${String(widthScale / 2)}" rx="${String(
        lengthScale / 2,
      )}" ry="${String(widthScale / 2)}" fill="${stroke}"/>`;
      break;
    case 'none':
      return '';
    case 'triangle':
    default:
      path = `<path d="M0,0 L${String(lengthScale)},${String(widthScale / 2)} L0,${String(
        widthScale,
      )} Z" fill="${stroke}"/>`;
  }

  return `<marker id="${id}" viewBox="0 0 ${String(lengthScale)} ${String(
    widthScale,
  )}" markerUnits="strokeWidth" markerWidth="${String(lengthScale)}" markerHeight="${String(
    widthScale,
  )}" refX="${String(lengthScale)}" refY="${String(widthScale / 2)}" orient="auto">${path}</marker>`;
}
