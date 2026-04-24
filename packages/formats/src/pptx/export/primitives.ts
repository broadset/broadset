import {
  type BroadsetColor,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  type ColorMods,
  getSolidFillColor,
  isRgbBroadsetColor,
  resolveStyleColor,
} from '@broadset/model';

import { alphaToOoxml, canvasLengthToEmu, degreesToRotationUnits, hexToOoxmlColor } from '../ooxml/units';
import type { SlideExportContext } from './context';

/**
 * Emit a `<a:xfrm>` transform element.
 *
 * The transform carries absolute canvas-space coordinates and the local
 * rotation. Group rotation does NOT compose into children — each
 * element's `rotation` is its own local rotation and OOXML handles
 * composition at render time.
 */
export function emitTransform(
  ctx: SlideExportContext,
  options: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotationDegrees: number;
    readonly includeChildOffset?: boolean;
  },
): string {
  const x = canvasLengthToEmu(ctx.canvas, options.x);
  const y = canvasLengthToEmu(ctx.canvas, options.y);
  const cx = canvasLengthToEmu(ctx.canvas, options.width);
  const cy = canvasLengthToEmu(ctx.canvas, options.height);
  const rot = degreesToRotationUnits(options.rotationDegrees);
  const rotAttr = rot !== 0 ? ` rot="${String(rot)}"` : '';
  const childOffset =
    options.includeChildOffset === true
      ? `<a:chOff x="${String(x)}" y="${String(y)}"/><a:chExt cx="${String(cx)}" cy="${String(cy)}"/>`
      : '';

  return `<a:xfrm${rotAttr}><a:off x="${String(x)}" y="${String(y)}"/><a:ext cx="${String(cx)}" cy="${String(cy)}"/>${childOffset}</a:xfrm>`;
}

/**
 * Resolve a {@link BroadsetColor} to an OOXML `<a:solidFill>` /
 * `<a:srgbClr>` / `<a:schemeClr>` fragment. Theme slots produce
 * `<a:schemeClr val="…"/>`; RGB colours produce `<a:srgbClr val="…"/>`.
 *
 * Alpha is carried inside the `<a:srgbClr>` element as an `<a:alpha>`
 * child when the input hex is 8 digits (RRGGBBAA). Theme-slot alpha
 * travels in `mods.alpha`.
 */
export function emitColorFill(color: BroadsetColor): string {
  if (isRgbBroadsetColor(color)) {
    const hex = color.hex;
    const ooxmlHex = hexToOoxmlColor(hex);
    const alphaChild = readHexAlpha(hex);

    return `<a:solidFill><a:srgbClr val="${ooxmlHex}">${alphaChild}</a:srgbClr></a:solidFill>`;
  }

  const mods = emitColorMods(color.mods);

  return `<a:solidFill><a:schemeClr val="${color.slot}">${mods}</a:schemeClr></a:solidFill>`;
}

function readHexAlpha(hex: string): string {
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex;

  if (stripped.length !== 8) return '';

  const alphaHex = stripped.slice(6);
  const alpha = parseInt(alphaHex, 16) / 255;

  if (!Number.isFinite(alpha) || alpha >= 1) return '';

  return `<a:alpha val="${String(alphaToOoxml(alpha))}"/>`;
}

/**
 * Emit the OOXML colour modifier children (`<a:lumMod/>`, `<a:lumOff/>`,
 * `<a:tint/>`, `<a:shade/>`, `<a:alpha/>`) for a theme-slot fill.
 *
 * Broadset stores mods as 0–1 fractions; OOXML stores them as
 * 1/1000-percent integers on a 0–100000 scale.
 */
export function emitColorMods(mods: ColorMods | undefined): string {
  if (mods === undefined) return '';

  const parts: string[] = [];

  const appendIfNumber = (key: string, value: number | undefined): void => {
    if (typeof value !== 'number') return;
    parts.push(`<a:${key} val="${String(Math.round(value * 100000))}"/>`);
  };

  appendIfNumber('lumMod', mods.lumMod);
  appendIfNumber('lumOff', mods.lumOff);
  appendIfNumber('tint', mods.tint);
  appendIfNumber('shade', mods.shade);
  appendIfNumber('alpha', mods.alpha);

  return parts.join('');
}

/**
 * Emit an OOXML shape fill from a Broadset `BroadsetFill`. Solid and
 * gradient fills emit natively; `none` emits `<a:noFill/>`. Picture and
 * pattern fills are NOT handled here — the caller resolves the asset
 * and emits `<a:blipFill>` / `<a:pattFill>` separately.
 */
export function emitFill(fill: BroadsetFill | undefined): string {
  if (fill === undefined || fill.kind === 'none') return '<a:noFill/>';
  if (fill.kind === 'solid') return emitColorFill(fill.color);
  if (fill.kind === 'gradient') return emitGradientFill(fill);

  return '<a:noFill/>';
}

function emitGradientFill(fill: Extract<BroadsetFill, { kind: 'gradient' }>): string {
  const gradient = fill.gradient;
  const stops = gradient.stops
    .map((stop) => {
      const pos = Math.round(stop.position * 100000);
      const inner = emitColorFill(stop.color).replace('<a:solidFill>', '').replace('</a:solidFill>', '');

      return `<a:gs pos="${String(pos)}">${inner}</a:gs>`;
    })
    .join('');

  if (gradient.type === 'radial') {
    return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`;
  }

  // Linear / conic — conic isn't representable in OOXML, so we fall
  // back to linear and let the metadata layer preserve the source.
  const angle = typeof gradient.angle === 'number' ? degreesToRotationUnits(gradient.angle) : 0;

  return `<a:gradFill flip="none" rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${String(angle)}" scaled="1"/></a:gradFill>`;
}

/**
 * Emit a `<a:ln>` element for the element's border, if any.
 */
export function emitStroke(style: BroadsetElementStyle, ctx: SlideExportContext): string {
  const width = style.borderWidth;

  if (width === undefined || width <= 0) return '';

  const widthEmu = canvasLengthToEmu(ctx.canvas, width);
  const borderColorCss = resolveStyleColor(style.borderColor, { resolveTheme: false });
  const hex = borderColorCss === undefined ? '000000' : hexToOoxmlColor(borderColorCss);
  const dashFragment =
    style.strokeDasharray !== undefined && style.strokeDasharray.length > 0 ? `<a:prstDash val="dash"/>` : '';
  const miter = style.strokeMiterlimit;
  const join =
    miter !== undefined
      ? `<a:miter lim="${String(Math.round(miter * 100000))}"/>`
      : '<a:miter lim="800000"/>';

  return `<a:ln w="${String(widthEmu)}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>${dashFragment}${join}</a:ln>`;
}

/** Convenience wrapper: derive a solid fill string from an element's style. */
export function emitElementFill(element: BroadsetElement): string {
  const color = getSolidFillColor(element.style.fill);

  if (color !== undefined) return emitColorFill(color);

  return emitFill(element.style.fill);
}
