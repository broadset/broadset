import {
  type ArrowEnd,
  type BroadsetColor,
  type BroadsetElement,
  type BroadsetFill,
  type BroadsetGradient,
  type BroadsetGradientStop,
  type Canvas,
  type ColorMods,
  normalizeColor,
  solidFill,
  type ThemeSlot,
} from '@broadset/model';

import { findChild, findChildren, findDescendant, getAttr, type XmlElement } from '../ooxml/ast';
import { OOXML_PRESET_COLOR_HEX } from '../ooxml/preset-colors';
import { emuToCanvasLength, emuToMm, rotationUnitsToDegrees } from '../ooxml/units';

export function applyShapeStyle(canvas: Canvas, element: BroadsetElement, shape: XmlElement): BroadsetElement {
  const fill = detectFill(shape);
  const stroke = parseStrokeFromBody(canvas, shape);
  const boxShadow = parseOuterShadow(shape);

  if (fill === null && stroke === null && boxShadow === null) return element;

  return {
    ...element,
    style: {
      ...element.style,
      ...(fill !== null ? { fill } : {}),
      ...(stroke?.borderWidth !== undefined ? { borderWidth: stroke.borderWidth } : {}),
      ...(stroke?.borderColor !== undefined ? { borderColor: stroke.borderColor } : {}),
      ...(stroke?.strokeDasharray !== undefined ? { strokeDasharray: stroke.strokeDasharray } : {}),
      ...(stroke?.strokeHeadEnd !== undefined ? { strokeHeadEnd: stroke.strokeHeadEnd } : {}),
      ...(stroke?.strokeTailEnd !== undefined ? { strokeTailEnd: stroke.strokeTailEnd } : {}),
      ...(boxShadow !== null ? { boxShadow } : {}),
    },
  };
}

function parseStrokeFromBody(canvas: Canvas, shape: XmlElement): {
  readonly borderWidth?: number;
  readonly borderColor?: BroadsetColor;
  readonly strokeDasharray?: string;
  readonly strokeHeadEnd?: ArrowEnd;
  readonly strokeTailEnd?: ArrowEnd;
} | null {
  const ln = findDescendant(shape, 'a:ln');

  if (ln === null) return null;

  const result: {
    borderWidth?: number;
    borderColor?: BroadsetColor;
    strokeDasharray?: string;
    strokeHeadEnd?: ArrowEnd;
    strokeTailEnd?: ArrowEnd;
  } = {};

  const widthAttr = getAttr(ln, 'w');

  if (widthAttr !== undefined) result.borderWidth = emuToCanvasLength(canvas, parseInt(widthAttr, 10));

  const colour = parseColorElement(ln);

  if (colour !== null) result.borderColor = colour;

  const dash = findChild(ln, 'a:prstDash');
  const dashStyle = dash !== null ? getAttr(dash, 'val') : undefined;

  if (dashStyle !== undefined && dashStyle !== 'solid') result.strokeDasharray = dashStyle;

  const headEnd = parseArrowEnd(ln, 'a:headEnd');
  const tailEnd = parseArrowEnd(ln, 'a:tailEnd');

  if (headEnd !== null) result.strokeHeadEnd = headEnd;
  if (tailEnd !== null) result.strokeTailEnd = tailEnd;

  return Object.keys(result).length === 0 ? null : result;
}

function parseArrowEnd(ln: XmlElement, qname: 'a:headEnd' | 'a:tailEnd'): ArrowEnd | null {
  const node = findChild(ln, qname);

  if (node === null) return null;

  const ooxmlType = getAttr(node, 'type') ?? 'none';
  const widthAttr = getAttr(node, 'w');
  const lengthAttr = getAttr(node, 'len');

  return {
    shape: ooxmlArrowShapeToBroadset(ooxmlType),
    ...(widthAttr !== undefined ? { width: ooxmlArrowSizeToBroadset(widthAttr) } : {}),
    ...(lengthAttr !== undefined ? { length: ooxmlArrowSizeToBroadset(lengthAttr) } : {}),
  };
}

function ooxmlArrowShapeToBroadset(type: string): ArrowEnd['shape'] {
  if (type === 'triangle' || type === 'arrow') return 'triangle';
  if (type === 'stealth') return 'stealth';
  if (type === 'diamond') return 'diamond';
  if (type === 'oval') return 'oval';

  return 'none';
}

function ooxmlArrowSizeToBroadset(size: string): 'sm' | 'md' | 'lg' {
  if (size === 'sm') return 'sm';
  if (size === 'lg') return 'lg';

  return 'md';
}

function parseOuterShadow(shape: XmlElement): string | null {
  const effectLst = findDescendant(shape, 'a:effectLst');

  if (effectLst === null) return null;

  const outer = parseShadowBlock(effectLst, 'a:outerShdw', false);
  const inner = parseShadowBlock(effectLst, 'a:innerShdw', true);

  if (outer === null && inner === null) return null;
  if (outer !== null && inner !== null) return `${outer}, ${inner}`;

  return outer ?? inner;
}

function parseShadowBlock(effectLst: XmlElement, qname: 'a:outerShdw' | 'a:innerShdw', inset: boolean): string | null {
  const shdw = findChild(effectLst, qname);

  if (shdw === null) return null;

  const blurEmu = parseInt(getAttr(shdw, 'blurRad') ?? '0', 10);
  const distEmu = parseInt(getAttr(shdw, 'dist') ?? '0', 10);
  const dirUnits = parseInt(getAttr(shdw, 'dir') ?? '0', 10);
  const dirRadians = (rotationUnitsToDegrees(dirUnits) * Math.PI) / 180;
  const offsetXmm = emuToMm(distEmu) * Math.cos(dirRadians);
  const offsetYmm = emuToMm(distEmu) * Math.sin(dirRadians);
  const blurMm = emuToMm(blurEmu);
  const colour = parseColorElement(shdw);

  if (colour?.kind !== 'rgb') return null;

  const srgb = findDescendant(shdw, 'a:srgbClr');
  const alphaNode = srgb !== null ? findChild(srgb, 'a:alpha') : null;
  const alpha = alphaNode !== null ? parseInt(getAttr(alphaNode, 'val') ?? '100000', 10) / 100000 : 1;
  const r = parseInt(colour.hex.slice(1, 3), 16);
  const g = parseInt(colour.hex.slice(3, 5), 16);
  const b = parseInt(colour.hex.slice(5, 7), 16);
  const prefix = inset ? 'inset ' : '';

  return `${prefix}${formatMm(offsetXmm)} ${formatMm(offsetYmm)} ${formatMm(blurMm)} rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3)})`;
}

function formatMm(value: number): string {
  return `${value.toFixed(2)}mm`;
}

function detectFill(shape: XmlElement): BroadsetFill | null {
  // Look for spPr fill children only — a paint inside `<a:ln>` is the
  // border colour, not the fill, and per-run colours live in the text body.
  const spPr = findDescendant(shape, 'p:spPr');
  const scope = spPr ?? shape;
  const solid = findChild(scope, 'a:solidFill');

  if (solid !== null) {
    const color = parseColorElement(solid);

    if (color !== null) return solidFill(color);
  }

  const gradient = findChild(scope, 'a:gradFill');

  if (gradient !== null) {
    const grad = parseGradient(gradient);

    if (grad !== null) return { kind: 'gradient', gradient: grad };
  }

  return null;
}

/**
 * Parse an OOXML colour primitive into a BroadsetColor. The function
 * accepts any node containing one of the colour primitives directly as
 * a descendant (`<a:srgbClr>`, `<a:schemeClr>`, `<a:scrgbClr>`,
 * `<a:hslClr>`, `<a:prstClr>`).
 */
export function parseColorElement(node: XmlElement): BroadsetColor | null {
  const srgb = findDescendant(node, 'a:srgbClr');

  if (srgb !== null) {
    const val = getAttr(srgb, 'val') ?? '';

    if (/^[0-9A-Fa-f]{6,8}$/.test(val)) {
      const hex: `#${string}` = `#${val.toUpperCase()}`;

      return { kind: 'rgb', hex };
    }
  }

  const scheme = findDescendant(node, 'a:schemeClr');

  if (scheme !== null) {
    const slot = (getAttr(scheme, 'val') ?? '') as ThemeSlot;
    const mods = parseColorMods(scheme);

    return mods === null ? { kind: 'theme', slot } : { kind: 'theme', slot, mods };
  }

  const scrgb = findDescendant(node, 'a:scrgbClr');

  if (scrgb !== null) {
    const r = clampScrgb(parseInt(getAttr(scrgb, 'r') ?? '0', 10));
    const g = clampScrgb(parseInt(getAttr(scrgb, 'g') ?? '0', 10));
    const b = clampScrgb(parseInt(getAttr(scrgb, 'b') ?? '0', 10));
    const hex = scrgbToSrgbHex(r, g, b);

    return {
      kind: 'rgb',
      hex,
      originalColor: `scrgb(${String(r / 100000)}, ${String(g / 100000)}, ${String(b / 100000)})`,
    };
  }

  const hsl = findDescendant(node, 'a:hslClr');

  if (hsl !== null) {
    const hueDegrees = parseInt(getAttr(hsl, 'hue') ?? '0', 10) / 60000;
    const saturationPct = parseInt(getAttr(hsl, 'sat') ?? '0', 10) / 1000;
    const lightnessPct = parseInt(getAttr(hsl, 'lum') ?? '0', 10) / 1000;
    const hex = hslToSrgbHex(hueDegrees, saturationPct, lightnessPct);

    return {
      kind: 'rgb',
      hex,
      originalColor: `hsl(${String(hueDegrees)}, ${String(saturationPct)}%, ${String(lightnessPct)}%)`,
    };
  }

  const prst = findDescendant(node, 'a:prstClr');

  if (prst !== null) {
    const name = (getAttr(prst, 'val') ?? '').toLowerCase();
    const hex = prstNameToSrgbHex(name);

    if (hex !== null) return { kind: 'rgb', hex, originalColor: name };
  }

  return null;
}

function clampScrgb(value: number): number {
  return Math.max(0, Math.min(100000, value));
}

function scrgbToSrgbHex(r: number, g: number, b: number): `#${string}` {
  const toSrgb = (linearScaled: number): number => {
    const linear = linearScaled / 100000;
    const corrected = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

    return Math.round(Math.max(0, Math.min(1, corrected)) * 255);
  };

  return rgbToHex(toSrgb(r), toSrgb(g), toSrgb(b));
}

function hslToSrgbHex(hueDegrees: number, saturationPct: number, lightnessPct: number): `#${string}` {
  const s = Math.max(0, Math.min(100, saturationPct)) / 100;
  const l = Math.max(0, Math.min(100, lightnessPct)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((hueDegrees % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r1, g1, b1] = hslSegment(hp, c, x);
  const m = l - c / 2;

  return rgbToHex(
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  );
}

function hslSegment(hp: number, c: number, x: number): readonly [number, number, number] {
  if (hp < 1) return [c, x, 0];
  if (hp < 2) return [x, c, 0];
  if (hp < 3) return [0, c, x];
  if (hp < 4) return [0, x, c];
  if (hp < 5) return [x, 0, c];

  return [c, 0, x];
}

function rgbToHex(r: number, g: number, b: number): `#${string}` {
  const hex = `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();

  return `#${hex}`;
}

function prstNameToSrgbHex(name: string): `#${string}` | null {
  try {
    const normalized = normalizeColor(name);
    const stripped = normalized.startsWith('#') ? normalized.slice(1) : normalized;

    return `#${stripped.slice(0, 6).toUpperCase()}`;
  } catch {
    const fallback = OOXML_PRESET_COLOR_HEX[name];

    if (fallback === undefined) return null;

    return `#${fallback.toUpperCase()}`;
  }
}

function parseColorMods(scheme: XmlElement): ColorMods | null {
  const result: Record<string, number> = {};
  const modNames = ['lumMod', 'lumOff', 'tint', 'shade', 'alpha'] as const;

  for (const name of modNames) {
    const mod = findChild(scheme, `a:${name}`);

    if (mod === null) continue;

    const raw = parseInt(getAttr(mod, 'val') ?? '0', 10);

    result[name] = raw / 100000;
  }

  return Object.keys(result).length === 0 ? null : (result as ColorMods);
}

function parseGradient(gradFill: XmlElement): BroadsetGradient | null {
  const stops: BroadsetGradientStop[] = [];
  const gsLst = findChild(gradFill, 'a:gsLst');

  if (gsLst === null) return null;

  for (const gs of findChildren(gsLst, 'a:gs')) {
    const pos = parseInt(getAttr(gs, 'pos') ?? '0', 10) / 100000;
    const color = parseColorElement(gs);

    if (color !== null) stops.push({ position: pos, color });
  }

  if (stops.length === 0) return null;

  const path = findChild(gradFill, 'a:path');

  if (path !== null && getAttr(path, 'path') === 'circle') {
    return { type: 'radial', stops };
  }

  const lin = findChild(gradFill, 'a:lin');
  const angle = lin !== null ? parseInt(getAttr(lin, 'ang') ?? '0', 10) / 60000 : 0;

  return { type: 'linear', stops, angle };
}

