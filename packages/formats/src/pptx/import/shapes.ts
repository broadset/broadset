import {
  type ArrowEnd,
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetFill,
  type BroadsetGradient,
  type BroadsetGradientStop,
  type Bullet,
  type Canvas,
  type ColorMods,
  createDefaultElement,
  type Hyperlink,
  normalizeColor,
  type Paragraph,
  type ParagraphAlign,
  type ParagraphProps,
  type Run,
  solidFill,
  type TextBody,
  type ThemeSlot,
} from '@broadset/model';
import svgpath from 'svgpath';

import { emuToCanvasLength, emuToMm, rotationUnitsToDegrees } from '../ooxml/units';
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
  /** `rId` → hyperlink target for `<a:hlinkClick>` resolution on text runs. */
  readonly hyperlinkByRelId: ReadonlyMap<string, Hyperlink>;
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
  const transform = extractTransform(ctx.canvas, body);

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
  const styled = applyShapeStyle(ctx.canvas, base, body);

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
  readonly flipH: boolean;
  readonly flipV: boolean;
}

function extractTransform(canvas: Canvas, body: string): ParsedTransform | null {
  const xfrmBlock = extractBlock(body, 'a:xfrm');

  if (xfrmBlock === null) return { x: 0, y: 0, width: 1, height: 1, rotation: 0, flipH: false, flipV: false };

  const off = xfrmBlock.block.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/);
  const ext = xfrmBlock.block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/);

  const x = off ? emuToCanvasLength(canvas, parseInt(off[1] ?? '0', 10)) : 0;
  const y = off ? emuToCanvasLength(canvas, parseInt(off[2] ?? '0', 10)) : 0;
  const width = ext ? emuToCanvasLength(canvas, parseInt(ext[1] ?? '0', 10)) : 1;
  const height = ext ? emuToCanvasLength(canvas, parseInt(ext[2] ?? '0', 10)) : 1;
  const rotAttr = xfrmBlock.openAttrs.match(/\brot="(-?\d+)"/);
  const rotation = rotAttr ? rotationUnitsToDegrees(parseInt(rotAttr[1] ?? '0', 10)) : 0;
  const flipH = /\bflipH="1"/.test(xfrmBlock.openAttrs);
  const flipV = /\bflipV="1"/.test(xfrmBlock.openAttrs);

  return { x, y, width, height, rotation, flipH, flipV };
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
  const rawName = nameAttr?.[1] ?? '';
  // OOXML attribute values escape `&`, `<`, `>`, `"`, `'`. Decode
  // before BSET tag detection so a name like `Foo &amp; Bar` round-
  // trips and BSET tags are matched character-for-character.
  const displayName = decodeXmlEntities(rawName);
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
  const pptxExt: Record<string, unknown> = { dirty: false };

  if (transform.flipH) pptxExt['flipH'] = true;
  if (transform.flipV) pptxExt['flipV'] = true;

  const base = createDefaultElement(kind, {
    id,
    name,
    position: { x: transform.x, y: transform.y },
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
    extensions: { pptx: pptxExt },
  });

  return parentGroupId === null ? base : { ...base, groupId: parentGroupId };
}

/**
 * Parse an `<a:ln>` stroke block from a shape body. Extracts width,
 * stroke colour, dash, and head/tail arrow endings per the spec's
 * `strokeHeadEnd` / `strokeTailEnd` fields (io-prereqs Phase 1).
 */
function parseStrokeFromBody(canvas: Canvas, body: string): {
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

  if (widthAttr !== undefined) result.borderWidth = emuToCanvasLength(canvas, parseInt(widthAttr, 10));

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
  return applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'rectangle', transform, parentGroupId), body);
}

function buildEllipse(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'ellipse', transform, parentGroupId), body);
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
  const base = applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'path', transform, parentGroupId), body);

  return { ...base, content: d };
}

/**
 * Merge fill + stroke (width, colour, dash, head/tail arrow ends) +
 * effects (outer shadow) extracted from the shape body onto the
 * element's style.
 */
function applyShapeStyle(canvas: Canvas, element: BroadsetElement, body: string): BroadsetElement {
  const fill = detectFill(body);
  const stroke = parseStrokeFromBody(canvas, body);
  const boxShadow = parseOuterShadow(body);

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

/**
 * Parse `<a:outerShdw>` or `<a:innerShdw>` into a CSS `box-shadow`
 * string. Inner shadows are emitted with the `inset` keyword. When
 * both forms are present in the same `<a:effectLst>` we emit a
 * comma-separated list (CSS box-shadow allows multiple shadows).
 */
function parseOuterShadow(body: string): string | null {
  const effectLst = extractBlock(body, 'a:effectLst');

  if (effectLst === null) return null;

  const outer = parseShadowBlock(effectLst.block, 'a:outerShdw', false);
  const inner = parseShadowBlock(effectLst.block, 'a:innerShdw', true);

  if (outer === null && inner === null) return null;
  if (outer !== null && inner !== null) return `${outer}, ${inner}`;

  return outer ?? inner;
}

function parseShadowBlock(block: string, tagName: string, inset: boolean): string | null {
  // Two simpler regex calls instead of one alternation — keeps complexity
  // under the lint threshold and makes the matched-vs-self-close branch
  // explicit.
  const escapedTag = tagName.replace(':', '\\:');
  const paired = block.match(new RegExp(`<${escapedTag}\\b([^>]*)>([\\s\\S]*?)<\\/${escapedTag}>`));
  const selfClose = paired === null ? block.match(new RegExp(`<${escapedTag}\\b([^>]*)\\/>`)) : null;

  if (paired === null && selfClose === null) return null;

  const attrs = paired?.[1] ?? selfClose?.[1] ?? '';
  const innerBody = paired?.[2] ?? '';
  const blurEmu = parseInt(attrs.match(/\bblurRad="(\d+)"/)?.[1] ?? '0', 10);
  const distEmu = parseInt(attrs.match(/\bdist="(\d+)"/)?.[1] ?? '0', 10);
  const dirUnits = parseInt(attrs.match(/\bdir="(\d+)"/)?.[1] ?? '0', 10);
  const dirRadians = (rotationUnitsToDegrees(dirUnits) * Math.PI) / 180;
  const offsetXmm = emuToMm(distEmu) * Math.cos(dirRadians);
  const offsetYmm = emuToMm(distEmu) * Math.sin(dirRadians);
  const blurMm = emuToMm(blurEmu);
  const colour = parseColorElement(innerBody);

  if (colour?.kind !== 'rgb') return null;

  const alphaMatch = innerBody.match(/<a:alpha\s+val="(\d+)"/);
  const alpha = alphaMatch !== null ? parseInt(alphaMatch[1] ?? '100000', 10) / 100000 : 1;
  const r = parseInt(colour.hex.slice(1, 3), 16);
  const g = parseInt(colour.hex.slice(3, 5), 16);
  const b = parseInt(colour.hex.slice(5, 7), 16);
  const prefix = inset ? 'inset ' : '';

  return `${prefix}${formatMm(offsetXmm)} ${formatMm(offsetYmm)} ${formatMm(blurMm)} rgba(${String(r)}, ${String(g)}, ${String(b)}, ${alpha.toFixed(3)})`;
}

function formatMm(value: number): string {
  return `${value.toFixed(2)}mm`;
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
  const srcRect = parseSrcRect(body);

  if (srcRect === null) return { ...base, content: dataUri };

  // Preserve the srcRect on extensions.pptx.srcRect so re-export emits
  // it again. Pixel-level baking (cropping the image bytes) is tracked
  // as a future enhancement — for now the data round-trips losslessly.
  const existingExt = (base.extensions['pptx'] as Record<string, unknown> | undefined) ?? {};

  return {
    ...base,
    content: dataUri,
    extensions: {
      ...base.extensions,
      pptx: {
        ...existingExt,
        srcRect,
      },
    },
  };
}

/**
 * Parse `<a:srcRect>` percentages off `<a:blipFill>`. Each component
 * is in OOXML's 1/100000 unit (50000 = 50%). All four sides may be
 * absent (defaults to 0). Returns `null` when no `<a:srcRect>` is
 * present so we don't litter `extensions.pptx` with empty crops.
 */
function parseSrcRect(body: string): { readonly l: number; readonly t: number; readonly r: number; readonly b: number } | null {
  const match = body.match(/<a:srcRect\b([^>]*)\/?>/);

  if (match === null) return null;

  const attrs = match[1] ?? '';
  const l = parseInt(attrs.match(/\bl="(-?\d+)"/)?.[1] ?? '0', 10);
  const t = parseInt(attrs.match(/\bt="(-?\d+)"/)?.[1] ?? '0', 10);
  const r = parseInt(attrs.match(/\br="(-?\d+)"/)?.[1] ?? '0', 10);
  const b = parseInt(attrs.match(/\bb="(-?\d+)"/)?.[1] ?? '0', 10);

  if (l === 0 && t === 0 && r === 0 && b === 0) return null;

  return { l, t, r, b };
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
 * Parse an OOXML colour primitive into a BroadsetColor. Recognised
 * variants:
 *
 * - `<a:srgbClr val="…"/>` — canonical sRGB hex.
 * - `<a:schemeClr val="…"/>` — theme-slot reference; preserves
 *   identity so re-export emits `<a:schemeClr>` again.
 * - `<a:scrgbClr r="…" g="…" b="…"/>` — linear-light percentages
 *   (0–100000). We convert to sRGB hex but keep the source string on
 *   `originalColor` so a later round-trip can restore the linear form.
 * - `<a:hslClr hue="…" sat="…" lum="…"/>` — HSL components per
 *   ECMA-376 (hue 0–21600000 = 0–360°, sat/lum 0–100000 = 0–100%).
 *   Converted to sRGB hex with `originalColor` carrying the source.
 * - `<a:prstClr val="…"/>` — preset name (e.g. `darkBlue`).
 *   Resolved through `normalizeColor` (which knows the CSS named
 *   set), with the preset name preserved on `originalColor`.
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

  const scrgbMatch = block.match(/<a:scrgbClr\s+r="(\d+)"\s+g="(\d+)"\s+b="(\d+)"(?:[^>]*)(\/>|>[\s\S]*?<\/a:scrgbClr>)/);

  if (scrgbMatch !== null) {
    const r = clampScrgb(parseInt(scrgbMatch[1] ?? '0', 10));
    const g = clampScrgb(parseInt(scrgbMatch[2] ?? '0', 10));
    const b = clampScrgb(parseInt(scrgbMatch[3] ?? '0', 10));
    const hex = scrgbToSrgbHex(r, g, b);

    return {
      kind: 'rgb',
      hex,
      originalColor: `scrgb(${String(r / 100000)}, ${String(g / 100000)}, ${String(b / 100000)})`,
    };
  }

  const hslMatch = block.match(/<a:hslClr\s+hue="(\d+)"\s+sat="(\d+)"\s+lum="(\d+)"(?:[^>]*)(\/>|>[\s\S]*?<\/a:hslClr>)/);

  if (hslMatch !== null) {
    const hueDegrees = parseInt(hslMatch[1] ?? '0', 10) / 60000;
    const saturationPct = parseInt(hslMatch[2] ?? '0', 10) / 1000;
    const lightnessPct = parseInt(hslMatch[3] ?? '0', 10) / 1000;
    const hex = hslToSrgbHex(hueDegrees, saturationPct, lightnessPct);

    return {
      kind: 'rgb',
      hex,
      originalColor: `hsl(${String(hueDegrees)}, ${String(saturationPct)}%, ${String(lightnessPct)}%)`,
    };
  }

  const prstMatch = block.match(/<a:prstClr\s+val="([a-zA-Z0-9]+)"(?:[^>]*)(\/>|>[\s\S]*?<\/a:prstClr>)/);

  if (prstMatch !== null) {
    const name = (prstMatch[1] ?? '').toLowerCase();
    const hex = prstNameToSrgbHex(name);

    if (hex === null) return null;

    return { kind: 'rgb', hex, originalColor: name };
  }

  return null;
}

function clampScrgb(value: number): number {
  return Math.max(0, Math.min(100000, value));
}

/**
 * Convert OOXML `<a:scrgbClr>` linear-light components (0–100000) to
 * an sRGB `#RRGGBB` string by applying the standard linear → gamma
 * transfer (IEC 61966-2-1).
 */
function scrgbToSrgbHex(r: number, g: number, b: number): `#${string}` {
  const toSrgb = (linearScaled: number): number => {
    const linear = linearScaled / 100000;
    const corrected = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

    return Math.round(Math.max(0, Math.min(1, corrected)) * 255);
  };

  return rgbToHex(toSrgb(r), toSrgb(g), toSrgb(b));
}

/**
 * HSL → sRGB hex per the canonical CSS Color formula. Hue in degrees,
 * saturation/lightness as 0–100 percentages.
 */
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

/**
 * OOXML preset colour names per ECMA-376 §20.1.10.46. The full set
 * mirrors CSS3/SVG named colours; we delegate to the model's
 * `normalizeColor` first (which carries the basic 21 names) and fall
 * back to the OOXML extended map. Names are matched case-insensitively.
 * Returns `null` when the name isn't recognised.
 */
function prstNameToSrgbHex(name: string): `#${string}` | null {
  try {
    const normalized = normalizeColor(name);
    const stripped = normalized.startsWith('#') ? normalized.slice(1) : normalized;

    return `#${stripped.slice(0, 6).toUpperCase()}`;
  } catch {
    const fallback = OOXML_EXTENDED_PRESET_COLORS[name];

    if (fallback === undefined) return null;

    return `#${fallback.toUpperCase()}`;
  }
}

/**
 * OOXML preset colours that aren't in the model's basic CSS_NAMED_COLORS
 * map. Hex values per ECMA-376 §20.1.10.46. Names are stored lowercase;
 * caller lowercases the source val before lookup.
 */
const OOXML_EXTENDED_PRESET_COLORS: Readonly<Record<string, string>> = {
  aliceblue: 'F0F8FF',
  antiquewhite: 'FAEBD7',
  aqua: '00FFFF',
  aquamarine: '7FFFD4',
  azure: 'F0FFFF',
  beige: 'F5F5DC',
  bisque: 'FFE4C4',
  blanchedalmond: 'FFEBCD',
  blueviolet: '8A2BE2',
  burlywood: 'DEB887',
  cadetblue: '5F9EA0',
  chartreuse: '7FFF00',
  chocolate: 'D2691E',
  coral: 'FF7F50',
  cornflowerblue: '6495ED',
  cornsilk: 'FFF8DC',
  crimson: 'DC143C',
  darkblue: '00008B',
  darkcyan: '008B8B',
  darkgoldenrod: 'B8860B',
  darkgray: 'A9A9A9',
  darkgreen: '006400',
  darkgrey: 'A9A9A9',
  darkkhaki: 'BDB76B',
  darkmagenta: '8B008B',
  darkolivegreen: '556B2F',
  darkorange: 'FF8C00',
  darkorchid: '9932CC',
  darkred: '8B0000',
  darksalmon: 'E9967A',
  darkseagreen: '8FBC8F',
  darkslateblue: '483D8B',
  darkslategray: '2F4F4F',
  darkslategrey: '2F4F4F',
  darkturquoise: '00CED1',
  darkviolet: '9400D3',
  deeppink: 'FF1493',
  deepskyblue: '00BFFF',
  dimgray: '696969',
  dimgrey: '696969',
  dodgerblue: '1E90FF',
  firebrick: 'B22222',
  floralwhite: 'FFFAF0',
  forestgreen: '228B22',
  gainsboro: 'DCDCDC',
  ghostwhite: 'F8F8FF',
  goldenrod: 'DAA520',
  greenyellow: 'ADFF2F',
  honeydew: 'F0FFF0',
  hotpink: 'FF69B4',
  indianred: 'CD5C5C',
  indigo: '4B0082',
  ivory: 'FFFFF0',
  khaki: 'F0E68C',
  lavender: 'E6E6FA',
  lavenderblush: 'FFF0F5',
  lawngreen: '7CFC00',
  lemonchiffon: 'FFFACD',
  lightblue: 'ADD8E6',
  lightcoral: 'F08080',
  lightcyan: 'E0FFFF',
  lightgoldenrodyellow: 'FAFAD2',
  lightgray: 'D3D3D3',
  lightgreen: '90EE90',
  lightgrey: 'D3D3D3',
  lightpink: 'FFB6C1',
  lightsalmon: 'FFA07A',
  lightseagreen: '20B2AA',
  lightskyblue: '87CEFA',
  lightslategray: '778899',
  lightslategrey: '778899',
  lightsteelblue: 'B0C4DE',
  lightyellow: 'FFFFE0',
  limegreen: '32CD32',
  linen: 'FAF0E6',
  maroon: '800000',
  mediumaquamarine: '66CDAA',
  mediumblue: '0000CD',
  mediumorchid: 'BA55D3',
  mediumpurple: '9370DB',
  mediumseagreen: '3CB371',
  mediumslateblue: '7B68EE',
  mediumspringgreen: '00FA9A',
  mediumturquoise: '48D1CC',
  mediumvioletred: 'C71585',
  midnightblue: '191970',
  mintcream: 'F5FFFA',
  mistyrose: 'FFE4E1',
  moccasin: 'FFE4B5',
  navajowhite: 'FFDEAD',
  oldlace: 'FDF5E6',
  olive: '808000',
  olivedrab: '6B8E23',
  orangered: 'FF4500',
  orchid: 'DA70D6',
  palegoldenrod: 'EEE8AA',
  palegreen: '98FB98',
  paleturquoise: 'AFEEEE',
  palevioletred: 'DB7093',
  papayawhip: 'FFEFD5',
  peachpuff: 'FFDAB9',
  peru: 'CD853F',
  plum: 'DDA0DD',
  powderblue: 'B0E0E6',
  rosybrown: 'BC8F8F',
  royalblue: '4169E1',
  saddlebrown: '8B4513',
  salmon: 'FA8072',
  sandybrown: 'F4A460',
  seagreen: '2E8B57',
  seashell: 'FFF5EE',
  sienna: 'A0522D',
  skyblue: '87CEEB',
  slateblue: '6A5ACD',
  slategray: '708090',
  slategrey: '708090',
  snow: 'FFFAFA',
  springgreen: '00FF7F',
  steelblue: '4682B4',
  tan: 'D2B48C',
  thistle: 'D8BFD8',
  tomato: 'FF6347',
  turquoise: '40E0D0',
  violet: 'EE82EE',
  wheat: 'F5DEB3',
  whitesmoke: 'F5F5F5',
  yellowgreen: '9ACD32',
};

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
  const endIdx = findMatchingCloseIdx(body, tagName, startIdx);

  if (endIdx < 0) return { block: body.slice(startIdx), openAttrs: attrs };

  return { block: body.slice(startIdx, endIdx), openAttrs: attrs };
}

/**
 * Scan forward from `startIdx` looking for the close tag that matches
 * the open tag at the start of `extractBlock`'s span — same name, same
 * depth. Naive `body.indexOf(close)` mis-binds when the same tag is
 * nested (e.g. `<a:effectLst>` at shape level containing another
 * `<a:effectLst>` inside a child run); this walker tracks depth so the
 * returned span is always the matching close.
 */
function findMatchingCloseIdx(body: string, tagName: string, startIdx: number): number {
  const open = `<${tagName}`;
  const close = `</${tagName}>`;
  let depth = 1;
  let cursor = startIdx;

  while (cursor < body.length) {
    const nextOpen = body.indexOf(open, cursor);
    const nextClose = body.indexOf(close, cursor);

    if (nextClose < 0) return -1;

    if (nextOpen >= 0 && nextOpen < nextClose) {
      // Confirm the open is a tag boundary (e.g. `<a:p>`) rather than
      // a longer-named tag that starts with the same prefix
      // (`<a:pPr>`). The next char after `<tagName` must be a space,
      // `>`, or `/`.
      const after = body.charCodeAt(nextOpen + open.length);
      const isBoundary = after === 0x20 || after === 0x3e || after === 0x2f || after === 0x09 || after === 0x0a || after === 0x0d;

      if (isBoundary) {
        depth += 1;
        cursor = nextOpen + open.length;
        continue;
      }

      cursor = nextOpen + open.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) return nextClose;
    cursor = nextClose + close.length;
  }

  return -1;
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
export function extractTextBody(
  canvas: Canvas,
  body: string,
  hyperlinks?: ReadonlyMap<string, Hyperlink>,
): TextBody | null {
  const txBody = extractBlock(body, 'p:txBody');

  if (txBody === null) return null;

  const paragraphs: Paragraph[] = [];

  for (const pMatch of txBody.block.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const pBody = pMatch[1] ?? '';
    const runs = extractRuns(pBody, hyperlinks);
    const props = extractParagraphProps(canvas, pBody);
    // PowerPoint authors empty paragraphs (just `<a:endParaRPr/>`) for
    // vertical spacing — preserve them as `runs: [{ text: '' }]` so the
    // structural intent survives round-trip.
    const finalRuns: readonly Run[] = runs.length === 0 ? [{ text: '' }] : runs;

    paragraphs.push(props === null ? { runs: finalRuns } : { runs: finalRuns, props });
  }

  if (paragraphs.length === 0) return null;

  return { paragraphs };
}

/**
 * Parse paragraph properties from `<a:pPr>`: alignment, bullet markup,
 * indent, line spacing, margin. Returns `null` when no `<a:pPr>` is
 * present or all extracted props are defaults.
 */
function extractParagraphProps(canvas: Canvas, paragraphBody: string): ParagraphProps | null {
  const pPrBlock = extractBlock(paragraphBody, 'a:pPr');

  if (pPrBlock === null) return null;

  const props: { -readonly [K in keyof ParagraphProps]?: ParagraphProps[K] } = {};

  const algn = pPrBlock.openAttrs.match(/\balgn="([^"]+)"/)?.[1];
  const align = ooxmlAlignToBroadset(algn);

  if (align !== undefined) props.align = align;

  const indentAttr = pPrBlock.openAttrs.match(/\bindent="(-?\d+)"/)?.[1];

  if (indentAttr !== undefined) props.indent = emuToCanvasLength(canvas, parseInt(indentAttr, 10));

  const marLAttr = pPrBlock.openAttrs.match(/\bmarL="(-?\d+)"/)?.[1];

  if (marLAttr !== undefined) {
    // OOXML marL is the left bullet/text indent; Broadset's `indent`
    // overlaps semantically. When both are present, indent wins.
    props.indent ??= emuToCanvasLength(canvas, parseInt(marLAttr, 10));
  }

  const bullet = parseBulletFromPPr(pPrBlock.block);

  if (bullet !== null) props.bullet = bullet;

  // `<a:lnSpc>` line spacing — we read percent-of-line and store as a
  // ratio. <a:spcPct val="150000"/> = 150% = 1.5.
  const lnSpc = pPrBlock.block.match(/<a:lnSpc>[\s\S]*?<a:spcPct\s+val="(\d+)"/);

  if (lnSpc !== null) {
    props.lineSpacing = parseInt(lnSpc[1] ?? '100000', 10) / 100000;
  }

  return Object.keys(props).length === 0 ? null : (props as ParagraphProps);
}

function ooxmlAlignToBroadset(algn: string | undefined): ParagraphAlign | undefined {
  if (algn === 'l') return 'start';
  if (algn === 'r') return 'end';
  if (algn === 'ctr') return 'center';
  if (algn === 'just') return 'justify';

  return undefined;
}

function parseBulletFromPPr(pPrBody: string): Bullet | null {
  if (/<a:buNone\b/.test(pPrBody)) return { kind: 'none' };

  const charMatch = pPrBody.match(/<a:buChar\s+char="([^"]+)"/);

  if (charMatch !== null) {
    const char = charMatch[1] ?? '•';

    return { kind: 'char', char };
  }

  const autoMatch = pPrBody.match(/<a:buAutoNum\b([^/>]*)\/?>/);

  if (autoMatch !== null) {
    const attrs = autoMatch[1] ?? '';
    const format = attrs.match(/\btype="([^"]+)"/)?.[1] ?? 'arabicPeriod';
    const startAtAttr = attrs.match(/\bstartAt="(\d+)"/)?.[1];

    return startAtAttr !== undefined
      ? { kind: 'auto', format, startAt: parseInt(startAtAttr, 10) }
      : { kind: 'auto', format };
  }

  return null;
}

function extractRuns(
  paragraphBody: string,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run[] {
  const runs: Run[] = [];

  for (const rMatch of paragraphBody.matchAll(/<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g)) {
    runs.push(buildRunFromRBody(rMatch[1] ?? '', hyperlinks));
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

function buildRunFromRBody(
  rBody: string,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run {
  const tMatch = rBody.match(/<a:t>([\s\S]*?)<\/a:t>/);
  const text = decodeXmlEntities(tMatch?.[1] ?? '');
  const rPrBlock = extractBlock(rBody, 'a:rPr');

  if (rPrBlock === null) return { text };

  const style = runStyleFromRPr(rPrBlock);
  const lang = rPrBlock.openAttrs.match(/\blang="([^"]+)"/)?.[1];
  const hyperlink = parseRunHyperlink(rPrBlock.block, hyperlinks);
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle && lang === undefined && hyperlink === undefined) return { text };

  const props = {
    ...(hasStyle ? { style } : {}),
    ...(lang !== undefined ? { lang } : {}),
    ...(hyperlink !== undefined ? { hyperlink } : {}),
  };

  return { text, props };
}

/**
 * Resolve `<a:hlinkClick r:id="rIdN"/>` against the slide's relationship
 * table. Returns `undefined` if the run has no hyperlink, the rel is
 * missing, or the rel target is empty (defensive — we never want to
 * persist a broken hyperlink that the renderer would fail on).
 */
function parseRunHyperlink(
  rPrBody: string,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Hyperlink | undefined {
  if (hyperlinks === undefined) return undefined;

  const match = rPrBody.match(/<a:hlinkClick\b([^>]*)\/?>/);

  if (match === null) return undefined;

  const attrs = match[1] ?? '';
  const relId = attrs.match(/\br:id="([^"]*)"/)?.[1];

  if (relId === undefined || relId.length === 0) return undefined;

  const target = hyperlinks.get(relId);

  if (target === undefined) return undefined;

  const tooltip = attrs.match(/\btooltip="([^"]*)"/)?.[1];

  if (tooltip !== undefined && tooltip.length > 0 && target.tooltip !== tooltip) {
    return { ...target, tooltip };
  }

  return target;
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
