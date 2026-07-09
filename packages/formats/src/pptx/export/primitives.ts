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

import { isOoxmlPresetColorName } from '../ooxml/preset-colors';
import { alphaToOoxml, canvasLengthToEmu, degreesToRotationUnits, hexToOoxmlColor, mmToEmu } from '../ooxml/units';
import { pushExportWarning, type SlideExportContext } from './context';

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
 * `<a:srgbClr>` / `<a:scrgbClr>` / `<a:hslClr>` / `<a:prstClr>` /
 * `<a:schemeClr>` fragment.
 *
 * When `color.originalColor` carries the source non-sRGB form
 * (`scrgb(r, g, b)`, `hsl(h, s%, l%)`, or a bare CSS preset name) the
 * exporter emits the matching OOXML primitive so a Keynote / foreign
 * `<a:scrgbClr>` round-trips losslessly. Otherwise RGB colours emit
 * `<a:srgbClr>` and theme slots emit `<a:schemeClr>`.
 *
 * Alpha is carried as an `<a:alpha>` child of the colour primitive
 * when the input hex is 8 digits (RRGGBBAA); theme-slot alpha travels
 * in `mods.alpha`.
 */
export function emitColorFill(color: BroadsetColor): string {
  if (isRgbBroadsetColor(color)) {
    const alphaChild = readHexAlpha(color.hex);
    const original = color.originalColor;

    const scrgbInner = original !== undefined ? buildScrgbInner(original, alphaChild) : null;

    if (scrgbInner !== null) return `<a:solidFill>${scrgbInner}</a:solidFill>`;

    const hslInner = original !== undefined ? buildHslInner(original, alphaChild) : null;

    if (hslInner !== null) return `<a:solidFill>${hslInner}</a:solidFill>`;

    const prstInner = original !== undefined ? buildPrstInner(original, alphaChild) : null;

    if (prstInner !== null) return `<a:solidFill>${prstInner}</a:solidFill>`;

    const ooxmlHex = hexToOoxmlColor(color.hex);

    return `<a:solidFill><a:srgbClr val="${ooxmlHex}">${alphaChild}</a:srgbClr></a:solidFill>`;
  }

  const mods = emitColorMods(color.mods);

  return `<a:solidFill><a:schemeClr val="${color.slot}">${mods}</a:schemeClr></a:solidFill>`;
}

const SCRGB_RE = /^scrgb\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i;
const HSL_RE = /^hsl\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)%\s*,\s*(-?\d*\.?\d+)%\s*\)$/i;
const PRST_RE = /^[a-z][a-zA-Z0-9]+$/;

function buildScrgbInner(original: string, alphaChild: string): string | null {
  const match = SCRGB_RE.exec(original);

  if (match === null) return null;

  // Source is recorded in 0–1 fractions; OOXML wants 0–100000 integers.
  const r = clampScrgbVal(parseFloat(match[1] ?? '0') * SCRGB_SCALE);
  const g = clampScrgbVal(parseFloat(match[2] ?? '0') * SCRGB_SCALE);
  const b = clampScrgbVal(parseFloat(match[3] ?? '0') * SCRGB_SCALE);

  return `<a:scrgbClr r="${String(r)}" g="${String(g)}" b="${String(b)}">${alphaChild}</a:scrgbClr>`;
}

function buildHslInner(original: string, alphaChild: string): string | null {
  const match = HSL_RE.exec(original);

  if (match === null) return null;

  // OOXML hue is in 1/60000-degree units, sat/lum in 1/1000-percent.
  const hue = Math.round(parseFloat(match[1] ?? '0') * HSL_HUE_SCALE);
  const sat = clampHslPct(parseFloat(match[2] ?? '0') * HSL_PCT_SCALE);
  const lum = clampHslPct(parseFloat(match[3] ?? '0') * HSL_PCT_SCALE);

  return `<a:hslClr hue="${String(((hue % HSL_HUE_FULL) + HSL_HUE_FULL) % HSL_HUE_FULL)}" sat="${String(sat)}" lum="${String(lum)}">${alphaChild}</a:hslClr>`;
}

function buildPrstInner(original: string, alphaChild: string): string | null {
  // A preset name is a bare CSS-colour identifier — must NOT contain
  // parens, commas, hash, or whitespace. The shape regex is the cheap
  // filter; the ECMA-376 §20.1.10.46 allowlist is the authoritative
  // gate. Without the allowlist, a stale or crafted `originalColor`
  // string could emit a `<a:prstClr val="…"/>` PowerPoint rejects with
  // a repair dialog.
  if (!PRST_RE.test(original)) return null;
  if (!isOoxmlPresetColorName(original.toLowerCase())) return null;

  return `<a:prstClr val="${original}">${alphaChild}</a:prstClr>`;
}

const SCRGB_SCALE = 100000;
const HSL_HUE_SCALE = 60000;
const HSL_HUE_FULL = HSL_HUE_SCALE * 360;
const HSL_PCT_SCALE = 1000;

function clampScrgbVal(value: number): number {
  return Math.max(0, Math.min(SCRGB_SCALE, Math.round(value)));
}

function clampHslPct(value: number): number {
  return Math.max(0, Math.min(SCRGB_SCALE, Math.round(value)));
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
function emitColorMods(mods: ColorMods | undefined): string {
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
 * OOXML `<a:outerShdw>`, plus `inset` entries to `<a:innerShdw>`.
 * Returns an empty string when no shadow is declared.
 *
 * Pushes export warnings on `ctx.warnings` for fidelity-loss cases:
 * multi-shadow lists truncated to the first emit-eligible entry
 * (`shadow-truncated`) and unparseable strings dropped entirely
 * (`shadow-dropped`).
 */
export function emitEffects(
  style: BroadsetElementStyle,
  ctx: SlideExportContext,
  elementId?: string,
): string {
  const shadow = style.boxShadow;

  if (shadow === undefined || shadow.trim().length === 0) return '';

  const parseResult = parseBoxShadow(shadow, ctx.canvas);

  if (parseResult.truncatedCount > 0) {
    pushExportWarning(ctx, {
      code: 'shadow-truncated',
      message: `multi-value box-shadow truncated to the first outer + first inner entry — OOXML carries one of each per shape (${shadow})`,
      ...(elementId !== undefined ? { elementId } : {}),
    });
  }

  if (parseResult.outer === null && parseResult.inner === null) {
    pushExportWarning(ctx, {
      code: 'shadow-dropped',
      message: `box-shadow could not be parsed and was dropped on export (${shadow})`,
      ...(elementId !== undefined ? { elementId } : {}),
    });

    return '';
  }

  const outerXml = parseResult.outer !== null ? renderShadowXml('a:outerShdw', parseResult.outer) : '';
  const innerXml = parseResult.inner !== null ? renderShadowXml('a:innerShdw', parseResult.inner) : '';

  return `<a:effectLst>${outerXml}${innerXml}</a:effectLst>`;
}

function renderShadowXml(tagName: 'a:outerShdw' | 'a:innerShdw', parsed: ParsedShadow): string {
  const distEmu = mmToEmu(Math.hypot(parsed.offsetXmm, parsed.offsetYmm));
  const blurEmu = mmToEmu(parsed.blurMm);
  const directionDegrees =
    parsed.offsetXmm === 0 && parsed.offsetYmm === 0
      ? 0
      : (Math.atan2(parsed.offsetYmm, parsed.offsetXmm) * 180) / Math.PI;
  const dirUnits = degreesToRotationUnits(((directionDegrees % 360) + 360) % 360);
  const ooxmlHex = hexToOoxmlColor(parsed.color);
  const alphaChild = parsed.alpha < 1 ? `<a:alpha val="${String(alphaToOoxml(parsed.alpha))}"/>` : '';
  // outerShdw carries `rotWithShape`; innerShdw doesn't have that attribute.
  const rotAttr = tagName === 'a:outerShdw' ? ' rotWithShape="0"' : '';

  return `<${tagName} blurRad="${String(blurEmu)}" dist="${String(distEmu)}" dir="${String(dirUnits)}"${rotAttr}><a:srgbClr val="${ooxmlHex}">${alphaChild}</a:srgbClr></${tagName}>`;
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
interface ParsedShadow {
  readonly offsetXmm: number;
  readonly offsetYmm: number;
  readonly blurMm: number;
  readonly color: string;
  readonly alpha: number;
}

interface BoxShadowParseResult {
  readonly outer: ParsedShadow | null;
  readonly inner: ParsedShadow | null;
  /** Count of emit-eligible entries dropped because OOXML carries one of each. */
  readonly truncatedCount: number;
}

function parseBoxShadow(value: string, canvas: Canvas): BoxShadowParseResult {
  const entries = splitShadowList(value).map((s) => s.trim()).filter((s) => s.length > 0);
  let outer: ParsedShadow | null = null;
  let inner: ParsedShadow | null = null;
  let truncated = 0;

  for (const entry of entries) {
    const isInset = /\binset\b/.test(entry);
    const cleaned = isInset ? entry.replace(/\binset\b/g, '').trim() : entry;
    const parsed = parseSingleShadow(cleaned, canvas);

    if (parsed === null) continue;

    if (isInset) {
      if (inner === null) inner = parsed;
      else truncated += 1;
    } else if (outer === null) outer = parsed;
    else truncated += 1;
  }

  return { outer, inner, truncatedCount: truncated };
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
