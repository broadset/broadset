import {
  type ArrowEnd,
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetFill,
  type BroadsetGradient,
  type BroadsetGradientStop,
  type Canvas,
  type ColorMods,
  createDefaultElement,
  type Paragraph,
  type Run,
  solidFill,
  type TextBody,
  type ThemeSlot,
} from '@broadset/model';
import svgpath from 'svgpath';

import { emuToMm, rotationUnitsToDegrees } from '../ooxml/units';
import { decodeShapeName } from '../semantic/shape-name';
import type { LayoutPlaceholder, ResolvedTheme } from '../types';

/**
 * Operator-level shape recovery. Walks a slide's XML and emits
 * Broadset elements for the primitives the importer recognizes.
 *
 * Recognized today: `<p:sp>` with `<a:prstGeom prst="rect|roundRect">`
 * (→ rectangle), `<a:prstGeom prst="ellipse">` (→ ellipse), arbitrary
 * `<a:prstGeom>` presets (→ rectangle with name hint), `<a:custGeom>`
 * (→ path), `<p:pic>` (→ image), `<p:grpSp>` (→ group).
 *
 * Each recognized shape inherits its rotation / geometry / fill from
 * the source XML. Text frames (`<p:txBody>`) recover their textual
 * content (without per-run styling; structured rich-text is deferred
 * to a later iteration).
 */

export interface SlideImportContext {
  readonly canvas: Canvas;
  readonly theme: ResolvedTheme;
  /** Layout placeholder defaults — `idx` → font / size / colour. */
  readonly layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>;
  /** `rId` → media-file path (inside the ZIP) for picture resolution. */
  readonly mediaByRelId: ReadonlyMap<string, { readonly path: string; readonly mime: string; readonly bytes: Uint8Array }>;
  /**
   * Importer warning sink. Populated as the shape walker encounters
   * content it drops or preserves as a raw blob. Returned to callers
   * via the importPptx result shape.
   */
  readonly warnings: {
    readonly code: 'unsupported-shape' | 'unsupported-content';
    readonly message: string;
    readonly detail?: string;
  }[];
  /** Monotonic element-id allocator when names are missing or rewritten. */
  nextElementIndex: number;
}

/**
 * Parse one slide XML into a flat list of `BroadsetElement` plus the
 * parent / group relationships. The caller can splice the elements
 * into the document's `elements` array.
 */
export function parseSlideShapes(ctx: SlideImportContext, slideXml: string): readonly BroadsetElement[] {
  const elements: BroadsetElement[] = [];

  // Extract the shape tree body. The root is `<p:spTree>`.
  const treeBody = extractBlock(slideXml, 'p:spTree');

  if (treeBody === null) return elements;

  walkShapeTree(ctx, treeBody.block, null, elements);

  return elements;
}

function walkShapeTree(
  ctx: SlideImportContext,
  body: string,
  parentGroupId: string | null,
  out: BroadsetElement[],
): void {
  let cursor = 0;

  while (cursor < body.length) {
    const nextOpen = findNextShapeOpen(body, cursor);

    if (nextOpen === null) break;

    const { tagName, openEndIdx } = nextOpen;
    const closeTag = `</${tagName}>`;
    const contentStart = openEndIdx;
    const contentEnd = findMatchingCloseIndex(body, contentStart, tagName);

    if (contentEnd < 0) {
      cursor = openEndIdx;
      continue;
    }

    const shapeBody = body.slice(contentStart, contentEnd);
    const element = emitElementFromShape(ctx, tagName, shapeBody, parentGroupId);

    if (element !== null) {
      out.push(element);

      if (tagName === 'p:grpSp') {
        walkShapeTree(ctx, shapeBody, element.id, out);
      }
    }

    cursor = contentEnd + closeTag.length;
  }
}

interface ShapeOpen {
  readonly tagName: string;
  readonly startIdx: number;
  readonly openEndIdx: number;
}

function findNextShapeOpen(body: string, from: number): ShapeOpen | null {
  const re = /<(p:sp|p:pic|p:grpSp)\b[^>]*?>/g;

  re.lastIndex = from;

  const match = re.exec(body);

  if (match === null) return null;

  const tagName = match[1] ?? 'p:sp';
  const startIdx = match.index;
  const openEndIdx = startIdx + match[0].length;

  return { tagName, startIdx, openEndIdx };
}

function findMatchingCloseIndex(body: string, fromIdx: number, tagName: string): number {
  // Handle nested groups correctly: count depth.
  const openRe = new RegExp(`<${tagName}\\b[^>]*?>`, 'g');
  const closeRe = new RegExp(`</${tagName}>`, 'g');

  openRe.lastIndex = fromIdx;
  closeRe.lastIndex = fromIdx;

  let depth = 1;
  let search = fromIdx;

  while (depth > 0 && search < body.length) {
    openRe.lastIndex = search;
    closeRe.lastIndex = search;

    const nextOpen = openRe.exec(body);
    const nextClose = closeRe.exec(body);

    if (nextClose === null) return -1;

    if (nextOpen !== null && nextOpen.index < nextClose.index) {
      depth += 1;
      search = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose.index;
      search = nextClose.index + nextClose[0].length;
    }
  }

  return -1;
}

function emitElementFromShape(
  ctx: SlideImportContext,
  tagName: string,
  body: string,
  parentGroupId: string | null,
): BroadsetElement | null {
  const transform = extractTransform(body);

  if (transform === null) return null;

  const nameMatch = extractCNvPrAttrs(body);
  const elementIdBase = nameMatch?.bsetId ?? `pptx-el-${String(ctx.nextElementIndex)}`;
  const elementName = nameMatch?.displayName ?? elementIdBase;

  ctx.nextElementIndex += 1;

  if (tagName === 'p:grpSp') {
    return buildBase(ctx, elementIdBase, elementName, 'group', transform, parentGroupId);
  }

  if (tagName === 'p:pic') {
    return buildPicture(ctx, elementIdBase, elementName, transform, body, parentGroupId);
  }

  // p:sp — dispatch on geometry.
  const geom = detectGeometry(body);

  if (geom === null) return buildRectangle(ctx, elementIdBase, elementName, transform, body, parentGroupId);

  if (geom.kind === 'rectangle' || geom.kind === 'roundRect') {
    return buildRectangle(ctx, elementIdBase, elementName, transform, body, parentGroupId);
  }

  if (geom.kind === 'ellipse') {
    return buildEllipse(ctx, elementIdBase, elementName, transform, body, parentGroupId);
  }

  if (geom.kind === 'path') {
    return buildPath(ctx, elementIdBase, elementName, transform, body, parentGroupId, geom.d ?? '');
  }

  // Unknown preset (triangle, star, arrow, callout, etc.) — preserve
  // the source XML under `extensions.pptx.raw` per IO-D-18 and map to
  // a rectangle as the visual fallback. A future expansion of the
  // preset table (Audit A5) will map common presets natively.
  ctx.warnings.push({
    code: 'unsupported-shape',
    message: `Unknown OOXML preset for shape id ${elementIdBase} — preserved as extensions.pptx.raw`,
    detail: extractPresetName(body) ?? 'custom',
  });

  return preserveRawShape(ctx, elementIdBase, elementName, transform, body, parentGroupId);
}

function extractPresetName(body: string): string | undefined {
  const match = body.match(/<a:prstGeom\s+prst="([^"]+)"/);

  return match?.[1];
}

function preserveRawShape(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  const base = buildBase(ctx, id, name, 'rectangle', transform, parentGroupId);
  const styled = applyShapeStyle(base, body);

  return {
    ...styled,
    extensions: {
      ...(styled.extensions),
      pptx: { dirty: false, raw: body },
    },
  };
}

interface ParsedTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

function extractTransform(body: string): ParsedTransform | null {
  const xfrmBlock = extractBlock(body, 'a:xfrm');

  if (xfrmBlock === null) return { x: 0, y: 0, width: 1, height: 1, rotation: 0 };

  const off = xfrmBlock.block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/);
  const ext = xfrmBlock.block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);

  const x = off ? emuToMm(parseInt(off[1] ?? '0', 10)) : 0;
  const y = off ? emuToMm(parseInt(off[2] ?? '0', 10)) : 0;
  const width = ext ? emuToMm(parseInt(ext[1] ?? '0', 10)) : 1;
  const height = ext ? emuToMm(parseInt(ext[2] ?? '0', 10)) : 1;
  const rotAttr = xfrmBlock.openAttrs.match(/\brot="(-?\d+)"/);
  const rotation = rotAttr ? rotationUnitsToDegrees(parseInt(rotAttr[1] ?? '0', 10)) : 0;

  return { x, y, width, height, rotation };
}

interface CNvPrAttrs {
  readonly bsetId?: string;
  readonly displayName: string;
}

function extractCNvPrAttrs(body: string): CNvPrAttrs | null {
  const match = body.match(/<p:cNvPr\b([^>]*)(\/>|>)/);

  if (!match) return null;

  const attrs = match[1] ?? '';
  const nameAttr = attrs.match(/\bname="([^"]*)"/);
  const displayName = nameAttr?.[1] ?? '';
  const bsetTag = displayName.length > 0 ? decodeShapeName(displayName) : null;

  if (bsetTag !== null) return { bsetId: bsetTag.id, displayName: bsetTag.id };

  return { displayName };
}

interface DetectedGeometry {
  readonly kind: 'rectangle' | 'roundRect' | 'ellipse' | 'path' | 'unknown';
  readonly d?: string;
}

function detectGeometry(body: string): DetectedGeometry | null {
  const prst = body.match(/<a:prstGeom\s+prst="([^"]+)"/);

  if (prst) {
    const preset = prst[1] ?? '';

    if (preset === 'rect') return { kind: 'rectangle' };
    if (preset === 'roundRect') return { kind: 'roundRect' };
    if (preset === 'ellipse' || preset === 'circle') return { kind: 'ellipse' };

    // Common presets without a native Broadset type. Express the
    // geometry as a `path` element with an SVG `d` string scaled to
    // the OOXML 0..100000 unit cube. Future expansion: callouts,
    // arrows with stem widths, multi-pointed stars.
    const presetD = OOXML_PRESET_TO_SVG_D[preset];

    if (presetD !== undefined) return { kind: 'path', d: presetD };

    return { kind: 'unknown' };
  }

  if (body.includes('<a:custGeom>')) {
    const d = custGeomToSvgD(body);

    return { kind: 'path', d };
  }

  return null;
}

/**
 * Common OOXML preset shapes mapped to SVG `d` strings on the canonical
 * 0..100000 × 0..100000 path-coordinate cube. Geometry is approximate
 * for presets that have parametric variants; future versions can pull
 * the OOXML preset adjustment values (`<a:gd>`) when present.
 */
const OOXML_PRESET_TO_SVG_D: Readonly<Record<string, string>> = {
  triangle: 'M 50000 0 L 100000 100000 L 0 100000 Z',
  rtTriangle: 'M 0 0 L 100000 100000 L 0 100000 Z',
  diamond: 'M 50000 0 L 100000 50000 L 50000 100000 L 0 50000 Z',
  parallelogram: 'M 25000 0 L 100000 0 L 75000 100000 L 0 100000 Z',
  trapezoid: 'M 25000 0 L 75000 0 L 100000 100000 L 0 100000 Z',
  pentagon: 'M 50000 0 L 100000 38197 L 80902 100000 L 19098 100000 L 0 38197 Z',
  hexagon: 'M 25000 0 L 75000 0 L 100000 50000 L 75000 100000 L 25000 100000 L 0 50000 Z',
  heptagon: 'M 50000 0 L 89500 19500 L 100000 61100 L 75000 100000 L 25000 100000 L 0 61100 L 10500 19500 Z',
  octagon: 'M 29289 0 L 70711 0 L 100000 29289 L 100000 70711 L 70711 100000 L 29289 100000 L 0 70711 L 0 29289 Z',
  star4:
    'M 50000 0 L 60000 40000 L 100000 50000 L 60000 60000 L 50000 100000 L 40000 60000 L 0 50000 L 40000 40000 Z',
  star5:
    'M 50000 0 L 61803 38197 L 100000 38197 L 69098 61803 L 80902 100000 L 50000 76393 L 19098 100000 L 30902 61803 L 0 38197 L 38197 38197 Z',
  star6:
    'M 50000 0 L 66667 28868 L 100000 25000 L 83333 50000 L 100000 75000 L 66667 71132 L 50000 100000 L 33333 71132 L 0 75000 L 16667 50000 L 0 25000 L 33333 28868 Z',
  star8:
    'M 50000 0 L 61730 23270 L 85355 14645 L 76730 38270 L 100000 50000 L 76730 61730 L 85355 85355 L 61730 76730 L 50000 100000 L 38270 76730 L 14645 85355 L 23270 61730 L 0 50000 L 23270 38270 L 14645 14645 L 38270 23270 Z',
  rightArrow: 'M 0 25000 L 60000 25000 L 60000 0 L 100000 50000 L 60000 100000 L 60000 75000 L 0 75000 Z',
  leftArrow: 'M 100000 25000 L 40000 25000 L 40000 0 L 0 50000 L 40000 100000 L 40000 75000 L 100000 75000 Z',
  upArrow: 'M 25000 100000 L 25000 40000 L 0 40000 L 50000 0 L 100000 40000 L 75000 40000 L 75000 100000 Z',
  downArrow: 'M 25000 0 L 25000 60000 L 0 60000 L 50000 100000 L 100000 60000 L 75000 60000 L 75000 0 Z',
  leftRightArrow: 'M 0 50000 L 25000 0 L 25000 25000 L 75000 25000 L 75000 0 L 100000 50000 L 75000 100000 L 75000 75000 L 25000 75000 L 25000 100000 Z',
  upDownArrow: 'M 50000 0 L 100000 25000 L 75000 25000 L 75000 75000 L 100000 75000 L 50000 100000 L 0 75000 L 25000 75000 L 25000 25000 L 0 25000 Z',
  plus: 'M 35000 0 L 65000 0 L 65000 35000 L 100000 35000 L 100000 65000 L 65000 65000 L 65000 100000 L 35000 100000 L 35000 65000 L 0 65000 L 0 35000 L 35000 35000 Z',
  // Callouts approximate to a rounded-rectangle body + tail; full
  // geometry varies by adjustment values that we don't read yet.
  wedgeRectCallout: 'M 0 0 L 100000 0 L 100000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 0 75000 Z',
  wedgeRoundRectCallout: 'M 10000 0 L 90000 0 L 100000 10000 L 100000 65000 L 90000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 10000 75000 L 0 65000 L 0 10000 Z',
  wedgeEllipseCallout: 'M 50000 0 C 22386 0 0 16863 0 37500 C 0 58137 22386 75000 50000 75000 L 60000 75000 L 50000 100000 L 40000 75000 C 36000 75000 32000 74600 28000 73850 Z',
};

function custGeomToSvgD(body: string): string {
  // Very tolerant parse: walk moveTo / lnTo / cubicBezTo / quadBezTo /
  // close operators and emit an SVG `d` string. OOXML coords are in
  // `<a:path w="…" h="…">` units; we normalize to the path's local
  // bbox (width × height) by scaling to the output unit the caller
  // passes as the element width × height. At import time the element
  // geometry already carries absolute dimensions, so a relative `d`
  // that references 0..100000 × 0..100000 is fine — the path renderer
  // interprets via viewBox.
  const pathBlock = extractBlock(body, 'a:path');

  if (pathBlock === null) return '';

  const ops: string[] = [];

  // Match path operations explicitly — avoid greedy `.*?` matching that
  // stops at child `<a:pt/>` self-closes. Two patterns: container ops
  // (moveTo/lnTo/cubicBezTo/quadBezTo) with their full `<a:pt/>` list,
  // and the empty-body `<a:close/>`. We interleave the matches in
  // source order.
  const allMatches: { readonly index: number; readonly op: string; readonly inner: string }[] = [];

  for (const m of pathBlock.block.matchAll(
    /<a:(moveTo|lnTo|cubicBezTo|quadBezTo)\b[^>]*>([\s\S]*?)<\/a:\1>/g,
  )) {
    allMatches.push({ index: m.index, op: m[1] ?? '', inner: m[2] ?? '' });
  }

  for (const m of pathBlock.block.matchAll(/<a:close\s*\/\s*>/g)) {
    allMatches.push({ index: m.index, op: 'close', inner: '' });
  }

  allMatches.sort((a, b) => a.index - b.index);

  for (const { op, inner } of allMatches) {
    const svg = opToSvgSegment(op, inner);

    if (svg !== null) {
      ops.push(svg);
      continue;
    }

    if (op === 'close') {
      ops.push('Z');
    }
  }

  const d = ops.join(' ');

  if (d.length === 0) return '';

  // Normalize the `d` path; harmless when already canonical.
  try {
    return svgpath(d).abs().toString();
  } catch {
    return d;
  }
}

function opToSvgSegment(op: string, inner: string): string | null {
  const pts = [...inner.matchAll(/<a:pt\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/g)].map((pm) => ({
    x: parseInt(pm[1] ?? '0', 10),
    y: parseInt(pm[2] ?? '0', 10),
  }));
  const p0 = pts[0];
  const p1 = pts[1];
  const p2 = pts[2];

  if (op === 'moveTo' && p0 !== undefined) return `M ${String(p0.x)} ${String(p0.y)}`;
  if (op === 'lnTo' && p0 !== undefined) return `L ${String(p0.x)} ${String(p0.y)}`;

  if (op === 'cubicBezTo' && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return `C ${String(p0.x)} ${String(p0.y)} ${String(p1.x)} ${String(p1.y)} ${String(p2.x)} ${String(p2.y)}`;
  }

  if (op === 'quadBezTo' && p0 !== undefined && p1 !== undefined) {
    return `Q ${String(p0.x)} ${String(p0.y)} ${String(p1.x)} ${String(p1.y)}`;
  }

  return null;
}

function buildBase(
  _ctx: SlideImportContext,
  id: string,
  name: string,
  kind: BroadsetElement['type'],
  transform: ParsedTransform,
  parentGroupId: string | null,
): BroadsetElement {
  // Initialise extensions.pptx.dirty = false so subsequent edits in
  // Broadset can distinguish untouched imports from edited elements
  // per IO-D-18 and the cross-format Format Round-Trip Metadata
  // requirement.
  const base = createDefaultElement(kind, {
    id,
    name,
    position: { x: transform.x, y: transform.y },
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    extensions: { pptx: { dirty: false } },
  });

  return parentGroupId === null ? base : { ...base, groupId: parentGroupId };
}

/**
 * Parse an `<a:ln>` stroke block from a shape body. Extracts width,
 * stroke colour, dash, and head/tail arrow endings per the spec's
 * `strokeHeadEnd` / `strokeTailEnd` fields (io-prereqs Phase 1).
 */
function parseStrokeFromBody(body: string): {
  readonly borderWidth?: number;
  readonly borderColor?: BroadsetColor;
  readonly strokeDasharray?: string;
  readonly strokeHeadEnd?: ArrowEnd;
  readonly strokeTailEnd?: ArrowEnd;
} | null {
  const lnBlock = extractBlock(body, 'a:ln');

  if (lnBlock === null) return null;

  const result: {
    borderWidth?: number;
    borderColor?: BroadsetColor;
    strokeDasharray?: string;
    strokeHeadEnd?: ArrowEnd;
    strokeTailEnd?: ArrowEnd;
  } = {};

  const widthAttr = lnBlock.openAttrs.match(/\bw="(\d+)"/)?.[1];

  if (widthAttr !== undefined) result.borderWidth = emuToMm(parseInt(widthAttr, 10));

  const colour = parseColorElement(lnBlock.block);

  if (colour !== null) result.borderColor = colour;

  const dashMatch = lnBlock.block.match(/<a:prstDash\s+val="([^"]+)"/);

  const dashStyle = dashMatch?.[1];

  if (dashStyle !== undefined && dashStyle !== 'solid') result.strokeDasharray = dashStyle;

  const headEnd = parseArrowEnd(lnBlock.block, 'headEnd');
  const tailEnd = parseArrowEnd(lnBlock.block, 'tailEnd');

  if (headEnd !== null) result.strokeHeadEnd = headEnd;
  if (tailEnd !== null) result.strokeTailEnd = tailEnd;

  return Object.keys(result).length === 0 ? null : result;
}

function parseArrowEnd(lnBody: string, tag: 'headEnd' | 'tailEnd'): ArrowEnd | null {
  const re = new RegExp(`<a:${tag}\\b([^/>]*)\\/?\\s*>`);
  const match = lnBody.match(re);

  if (!match) return null;

  const attrs = match[1] ?? '';
  const ooxmlType = attrs.match(/\btype="([^"]+)"/)?.[1] ?? 'none';
  const widthAttr = attrs.match(/\bw="([^"]+)"/)?.[1];
  const lengthAttr = attrs.match(/\blen="([^"]+)"/)?.[1];

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

function buildRectangle(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(buildBase(ctx, id, name, 'rectangle', transform, parentGroupId), body);
}

function buildEllipse(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(buildBase(ctx, id, name, 'ellipse', transform, parentGroupId), body);
}

function buildPath(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
  d: string,
): BroadsetElement {
  const base = applyShapeStyle(buildBase(ctx, id, name, 'path', transform, parentGroupId), body);

  return { ...base, content: d };
}

/**
 * Merge fill + stroke (width, colour, dash, head/tail arrow ends)
 * extracted from the shape body onto the element's style.
 */
function applyShapeStyle(element: BroadsetElement, body: string): BroadsetElement {
  const fill = detectFill(body);
  const stroke = parseStrokeFromBody(body);

  if (fill === null && stroke === null) return element;

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
    },
  };
}

function buildPicture(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement | null {
  const embed = body.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/);

  if (!embed) return null;

  const relId = embed[1] ?? '';
  const media = ctx.mediaByRelId.get(relId);

  if (!media) return null;

  const base = buildBase(ctx, id, name, 'image', transform, parentGroupId);
  const dataUri = `data:${media.mime};base64,${uint8ToBase64(media.bytes)}`;

  return { ...base, content: dataUri };
}

/**
 * Detect a fill on a shape body. Dispatches to solid / gradient /
 * picture (returns null; caller handles `<p:pic>` separately) in that
 * order.
 */
function detectFill(body: string): BroadsetFill | null {
  const solid = extractBlock(body, 'a:solidFill');

  if (solid !== null) {
    const color = parseColorElement(solid.block);

    if (color !== null) return solidFill(color);
  }

  const gradient = extractBlock(body, 'a:gradFill');

  if (gradient !== null) {
    const grad = parseGradient(gradient.block);

    if (grad !== null) return { kind: 'gradient', gradient: grad };
  }

  return null;
}

/**
 * Parse a `<a:srgbClr>` or `<a:schemeClr>` block into a BroadsetColor.
 * Preserves theme-slot references (`{ kind: 'theme', slot, mods }`)
 * rather than resolving to the palette's sRGB — preserves identity so
 * re-export emits `<a:schemeClr>` again.
 */
function parseColorElement(block: string): BroadsetColor | null {
  const srgbMatch = block.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6,8})"(?:[^>]*)(\/>|>[\s\S]*?<\/a:srgbClr>)/);

  if (srgbMatch !== null) {
    const digits = (srgbMatch[1] ?? '').toUpperCase();
    const hex: `#${string}` = `#${digits}`;

    return { kind: 'rgb', hex };
  }

  const schemeMatch = block.match(/<a:schemeClr\s+val="([a-zA-Z0-9]+)"(?:[^>]*)(\/>|>[\s\S]*?<\/a:schemeClr>)/);

  if (schemeMatch !== null) {
    const slot = schemeMatch[1] as ThemeSlot;
    const innerBody = schemeMatch[2] ?? '';
    const mods = parseColorMods(innerBody);

    return mods === null ? { kind: 'theme', slot } : { kind: 'theme', slot, mods };
  }

  return null;
}

function parseColorMods(innerBody: string): ColorMods | null {
  const result: Record<string, number> = {};
  const modNames = ['lumMod', 'lumOff', 'tint', 'shade', 'alpha'] as const;

  for (const name of modNames) {
    const re = new RegExp(`<a:${name}\\s+val="(\\d+)"`);
    const match = innerBody.match(re);

    if (match !== null) {
      const raw = parseInt(match[1] ?? '0', 10);

      result[name] = raw / 100000;
    }
  }

  return Object.keys(result).length === 0 ? null : (result as ColorMods);
}

/**
 * Parse `<a:gradFill>` into a BroadsetGradient. Supports linear
 * (`<a:lin ang="…"/>`) and radial / path (`<a:path path="circle">`).
 * Stops are extracted from `<a:gsLst>`.
 */
function parseGradient(block: string): BroadsetGradient | null {
  const stops: BroadsetGradientStop[] = [];
  const gsLst = extractBlock(block, 'a:gsLst');

  if (gsLst === null) return null;

  for (const stopMatch of gsLst.block.matchAll(/<a:gs\s+pos="(\d+)"[^>]*>([\s\S]*?)<\/a:gs>/g)) {
    const pos = parseInt(stopMatch[1] ?? '0', 10) / 100000;
    const color = parseColorElement(stopMatch[2] ?? '');

    if (color !== null) stops.push({ position: pos, color });
  }

  if (stops.length === 0) return null;

  const radial = block.includes('<a:path path="circle"');

  if (radial) return { type: 'radial', stops };

  const linMatch = block.match(/<a:lin\b[^>]*\bang="(-?\d+)"/);
  const angle = linMatch !== null ? parseInt(linMatch[1] ?? '0', 10) / 60000 : 0;

  return { type: 'linear', stops, angle };
}

interface ExtractedBlock {
  readonly block: string;
  readonly openAttrs: string;
}

function extractBlock(body: string, tagName: string): ExtractedBlock | null {
  const openRe = new RegExp(`<${tagName}\\b([^>]*)(\\/?)>`);
  const open = body.match(openRe);

  if (!open) return null;

  const attrs = open[1] ?? '';
  const selfClose = open[2] === '/';

  if (selfClose) return { block: '', openAttrs: attrs };

  const startIdx = (open.index ?? 0) + open[0].length;
  const close = `</${tagName}>`;
  const endIdx = body.indexOf(close, startIdx);

  if (endIdx < 0) return { block: body.slice(startIdx), openAttrs: attrs };

  return { block: body.slice(startIdx, endIdx), openAttrs: attrs };
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * Recover text content from a `<p:sp>` body as a structured TextBody
 * with per-run styling (bold / italic / underline / font family / size
 * / color). Spec requires: "Multi-run paragraphs import as TextBody
 * with per-run styling".
 *
 * Returns `null` when the body has no text frame or the text frame is
 * empty — callers treat that as "not a text shape".
 */
export function extractTextBody(body: string): TextBody | null {
  const txBody = extractBlock(body, 'p:txBody');

  if (txBody === null) return null;

  const paragraphs: Paragraph[] = [];

  for (const pMatch of txBody.block.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const pBody = pMatch[1] ?? '';
    const runs = extractRuns(pBody);

    if (runs.length === 0) continue;
    paragraphs.push({ runs });
  }

  if (paragraphs.length === 0) return null;

  return { paragraphs };
}

function extractRuns(paragraphBody: string): Run[] {
  const runs: Run[] = [];

  for (const rMatch of paragraphBody.matchAll(/<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g)) {
    runs.push(buildRunFromRBody(rMatch[1] ?? ''));
  }

  // Fallback: a paragraph with raw `<a:t>` text and no `<a:r>` wrapper
  // (unusual but produced by some tools) — emit a single unstyled run.
  if (runs.length === 0) {
    for (const tMatch of paragraphBody.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) {
      runs.push({ text: decodeXmlEntities(tMatch[1] ?? '') });
    }
  }

  return runs;
}

function buildRunFromRBody(rBody: string): Run {
  const tMatch = rBody.match(/<a:t>([\s\S]*?)<\/a:t>/);
  const text = decodeXmlEntities(tMatch?.[1] ?? '');
  const rPrBlock = extractBlock(rBody, 'a:rPr');

  if (rPrBlock === null) return { text };

  const style = runStyleFromRPr(rPrBlock);
  const lang = rPrBlock.openAttrs.match(/\blang="([^"]+)"/)?.[1];
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle && lang === undefined) return { text };

  const props = {
    ...(hasStyle ? { style } : {}),
    ...(lang !== undefined ? { lang } : {}),
  };

  return { text, props };
}

function runStyleFromRPr(rPr: ExtractedBlock): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  const openAttrs = rPr.openAttrs;

  if (/\bb="1"/.test(openAttrs)) style['bold'] = true;
  if (/\bi="1"/.test(openAttrs)) style['italic'] = true;

  const uAttr = openAttrs.match(/\bu="([^"]+)"/)?.[1];

  if (uAttr !== undefined && uAttr !== 'none') style['underline'] = true;

  const szAttr = openAttrs.match(/\bsz="(\d+)"/)?.[1];

  if (szAttr !== undefined) style['fontSize'] = parseInt(szAttr, 10) / 100;

  const latinMatch = rPr.block.match(/<a:latin\s+typeface="([^"]+)"/);

  if (latinMatch !== null) style['fontFamily'] = latinMatch[1];

  const solidFillMatch = rPr.block.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);

  if (solidFillMatch !== null) {
    const color = parseColorElement(solidFillMatch[0]);

    if (color !== null) style['color'] = color;
  }

  return style;
}

/**
 * Legacy helper for callers that only want flat text (imports where we
 * promote a rectangle/ellipse to a text element). Falls back to joining
 * paragraphs with newlines; prefer {@link extractTextBody} for
 * structured output.
 */
export function extractTextContent(body: string): string {
  const textBody = extractTextBody(body);

  if (textBody === null) return '';

  return textBody.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Turn the importer's flat element list into a full BroadsetDocument —
 * one Page per slide, with per-slide elements. If any slide contains
 * text frames with non-empty content, a text element is emitted in
 * addition to the shape.
 */
export function composeDocumentFromSlides(
  canvas: Canvas,
  slides: readonly {
    readonly id: string;
    readonly notes?: string;
    readonly elements: readonly BroadsetElement[];
  }[],
): BroadsetDocument {
  const allElements: BroadsetElement[] = [];
  const pages = slides.map((slide) => {
    for (const el of slide.elements) allElements.push(el);

    return {
      id: slide.id,
      name: slide.id,
      elements: [],
      locale: null,
      extensions: {},
      ...(slide.notes !== undefined && slide.notes.length > 0 ? { notes: slide.notes } : {}),
    };
  });

  return {
    id: 'pptx-import',
    name: 'Imported from PPTX',
    documentMode: 'screen',
    canvas,
    elements: allElements,
    pages: pages.length > 0 ? pages : [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  };
}
