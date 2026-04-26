import {
  type BroadsetColor,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  type Canvas,
  type ColorMods,
  getSolidFillColor,
  isRgbBroadsetColor,
  normalizeColor,
  pxToMm,
  resolveStyleColor,
} from '@broadset/model';

import { alphaToOoxml, canvasLengthToEmu, degreesToRotationUnits, hexToOoxmlColor, mmToEmu } from '../ooxml/units';
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
    readonly flipH?: boolean;
    readonly flipV?: boolean;
    readonly includeChildOffset?: boolean;
  },
): string {
  const x = canvasLengthToEmu(ctx.canvas, options.x);
  const y = canvasLengthToEmu(ctx.canvas, options.y);
  const cx = canvasLengthToEmu(ctx.canvas, options.width);
  const cy = canvasLengthToEmu(ctx.canvas, options.height);
  const rot = degreesToRotationUnits(options.rotationDegrees);
  const rotAttr = rot !== 0 ? ` rot="${String(rot)}"` : '';
  const flipHAttr = options.flipH === true ? ` flipH="1"` : '';
  const flipVAttr = options.flipV === true ? ` flipV="1"` : '';
  const childOffset =
    options.includeChildOffset === true
      ? `<a:chOff x="${String(x)}" y="${String(y)}"/><a:chExt cx="${String(cx)}" cy="${String(cy)}"/>`
      : '';

  return `<a:xfrm${rotAttr}${flipHAttr}${flipVAttr}><a:off x="${String(x)}" y="${String(y)}"/><a:ext cx="${String(cx)}" cy="${String(cy)}"/>${childOffset}</a:xfrm>`;
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

/**
 * Emit an `<a:effectLst>` from the element's CSS-style `boxShadow`.
 * Maps the most common form (offsetX offsetY blurRadius color) to
 * OOXML `<a:outerShdw>`. Returns an empty string when no shadow is
 * declared.
 */
export function emitEffects(style: BroadsetElementStyle, ctx: SlideExportContext): string {
  const shadow = style.boxShadow;

  if (shadow === undefined || shadow.trim().length === 0) return '';

  const parsed = parseBoxShadow(shadow, ctx.canvas);

  if (parsed === null) return '';

  // offsets/blur are already in mm — go straight to EMU.
  const distEmu = mmToEmu(Math.hypot(parsed.offsetXmm, parsed.offsetYmm));
  const blurEmu = mmToEmu(parsed.blurMm);
  const directionDegrees =
    parsed.offsetXmm === 0 && parsed.offsetYmm === 0
      ? 0
      : (Math.atan2(parsed.offsetYmm, parsed.offsetXmm) * 180) / Math.PI;
  const dirUnits = degreesToRotationUnits(((directionDegrees % 360) + 360) % 360);
  const ooxmlHex = hexToOoxmlColor(parsed.color);
  const alphaChild = parsed.alpha < 1 ? `<a:alpha val="${String(alphaToOoxml(parsed.alpha))}"/>` : '';

  return `<a:effectLst><a:outerShdw blurRad="${String(blurEmu)}" dist="${String(distEmu)}" dir="${String(dirUnits)}" rotWithShape="0"><a:srgbClr val="${ooxmlHex}">${alphaChild}</a:srgbClr></a:outerShdw></a:effectLst>`;
}

/**
 * Parse a CSS `box-shadow` value into offsetX/offsetY/blur (all in mm)
 * and colour. Accepts the canonical form
 * `offsetX offsetY blurRadius color` with px/mm/cm/in/pt length units
 * and any colour `normalizeColor` understands (named CSS colours,
 * hex 3/6/8, rgb/rgba, hsl/hsla). When the input is a multi-value list
 * (`shadow1, shadow2, …`) we use the first non-`inset` entry —
 * `<a:outerShdw>` only carries one. `inset` shadows are skipped because
 * OOXML's outer shadow has no inset semantics.
 */
function parseBoxShadow(value: string, canvas: Canvas): {
  readonly offsetXmm: number;
  readonly offsetYmm: number;
  readonly blurMm: number;
  readonly color: string;
  readonly alpha: number;
} | null {
  for (const shadow of splitShadowList(value)) {
    const trimmed = shadow.trim();

    if (trimmed.length === 0) continue;
    // Inset shadows are not representable as <a:outerShdw>; skip and
    // try the next entry in the list.
    if (/\binset\b/.test(trimmed)) continue;

    const parsed = parseSingleShadow(trimmed, canvas);

    if (parsed !== null) return parsed;
  }

  return null;
}

function parseSingleShadow(value: string, canvas: Canvas): {
  readonly offsetXmm: number;
  readonly offsetYmm: number;
  readonly blurMm: number;
  readonly color: string;
  readonly alpha: number;
} | null {
  const tokens = tokeniseShadow(value);

  if (tokens.length < 3) return null;

  const offsetXmm = parseLengthMm(tokens[0] ?? '0', canvas);
  const offsetYmm = parseLengthMm(tokens[1] ?? '0', canvas);
  const blurMm = parseLengthMm(tokens[2] ?? '0', canvas);
  const colourToken = tokens[tokens.length - 1] ?? '#000000';
  const colourParse = parseCssColor(colourToken);

  if (colourParse === null) return null;

  return { offsetXmm, offsetYmm, blurMm, color: colourParse.hex, alpha: colourParse.alpha };
}

/**
 * Split a CSS shadow list on top-level commas, preserving commas that
 * appear inside `rgba(...)` / `hsl(...)` colour groups. Returns a single
 * entry when no commas appear (unbracketed single-shadow case).
 */
function splitShadowList(value: string): readonly string[] {
  const out: string[] = [];
  let buffer = '';
  let depth = 0;

  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && ch === ',') {
      out.push(buffer);
      buffer = '';
    } else {
      buffer += ch;
    }
  }

  if (buffer.length > 0) out.push(buffer);

  return out;
}

/**
 * Tokenise a `box-shadow` value on whitespace, treating any `rgba(...)`
 * or `rgb(...)` group as an atomic token even though it contains
 * spaces and commas internally.
 */
function tokeniseShadow(value: string): readonly string[] {
  const out: string[] = [];
  let buffer = '';
  let depth = 0;

  for (const ch of value) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && /\s/.test(ch)) {
      if (buffer.length > 0) {
        out.push(buffer);
        buffer = '';
      }
    } else {
      buffer += ch;
    }
  }

  if (buffer.length > 0) out.push(buffer);

  return out;
}

const MM_PER_INCH = 25.4;
const MM_PER_CM = 10;
const PT_PER_INCH = 72;

function parseLengthMm(token: string, canvas: Canvas): number {
  const match = token.trim().match(/^(-?\d*\.?\d+)(px|mm|cm|in|pt)?$/i);

  if (match === null) return 0;

  const num = parseFloat(match[1] ?? '0');
  const unit = (match[2] ?? 'px').toLowerCase();

  if (unit === 'mm') return num;
  if (unit === 'cm') return num * MM_PER_CM;
  if (unit === 'in') return num * MM_PER_INCH;
  if (unit === 'pt') return (num * MM_PER_INCH) / PT_PER_INCH;

  // px (default): use canvas DPI.
  return pxToMm(num, canvas.dpi);
}

/**
 * Resolve any CSS colour literal to `{ hex: '#RRGGBB', alpha }`.
 *
 * Delegates to `normalizeColor` (model package) so we get parity with
 * the rest of Broadset for named colours, rgb/rgba, hsl/hsla, and 3/6/8
 * digit hex. The 8-digit form encodes alpha in the trailing two hex
 * digits — we split it out so `<a:alpha>` carries the channel
 * separately, since OOXML keeps colour and alpha distinct.
 */
function parseCssColor(input: string): { readonly hex: string; readonly alpha: number } | null {
  let normalized: string;

  try {
    normalized = normalizeColor(input);
  } catch {
    return null;
  }

  const stripped = normalized.startsWith('#') ? normalized.slice(1) : normalized;

  if (stripped.length === 8) {
    return {
      hex: `#${stripped.slice(0, 6)}`,
      alpha: parseInt(stripped.slice(6), 16) / 255,
    };
  }

  return { hex: normalized, alpha: 1 };
}

/** Convenience wrapper: derive a solid fill string from an element's style. */
export function emitElementFill(element: BroadsetElement): string {
  const color = getSolidFillColor(element.style.fill);

  if (color !== undefined) return emitColorFill(color);

  return emitFill(element.style.fill);
}
