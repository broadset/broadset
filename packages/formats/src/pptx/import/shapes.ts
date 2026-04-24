import {
  type BroadsetDocument,
  type BroadsetElement,
  type Canvas,
  createDefaultElement,
  rgbColor,
  solidFill,
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

  // Unknown preset → rectangle with the preset name in `name`.
  return buildRectangle(ctx, elementIdBase, elementName, transform, body, parentGroupId);
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
    if (preset === 'ellipse') return { kind: 'ellipse' };

    return { kind: 'unknown' };
  }

  if (body.includes('<a:custGeom>')) {
    const d = custGeomToSvgD(body);

    return { kind: 'path', d };
  }

  return null;
}

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
  const base = createDefaultElement(kind, {
    id,
    name,
    position: { x: transform.x, y: transform.y },
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
  });

  return parentGroupId === null ? base : { ...base, groupId: parentGroupId };
}

function buildRectangle(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  const base = buildBase(ctx, id, name, 'rectangle', transform, parentGroupId);
  const fill = detectSolidFill(body, ctx.theme);

  if (fill !== null) return { ...base, style: { ...base.style, fill } };

  return base;
}

function buildEllipse(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  body: string,
  parentGroupId: string | null,
): BroadsetElement {
  const base = buildBase(ctx, id, name, 'ellipse', transform, parentGroupId);
  const fill = detectSolidFill(body, ctx.theme);

  if (fill !== null) return { ...base, style: { ...base.style, fill } };

  return base;
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
  const base = buildBase(ctx, id, name, 'path', transform, parentGroupId);
  const fill = detectSolidFill(body, ctx.theme);

  return {
    ...base,
    content: d,
    ...(fill !== null ? { style: { ...base.style, fill } } : {}),
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

function detectSolidFill(body: string, theme: ResolvedTheme): BroadsetElement['style']['fill'] | null {
  const solidBlock = extractBlock(body, 'a:solidFill');

  if (solidBlock === null) return null;

  const srgb = solidBlock.block.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6,8})"/);

  if (srgb) {
    const hex = `#${(srgb[1] ?? '').toUpperCase()}`;

    return solidFill(rgbColor(hex as `#${string}`));
  }

  const scheme = solidBlock.block.match(/<a:schemeClr\s+val="([a-zA-Z0-9]+)"/);

  if (scheme) {
    const slot = scheme[1] as ThemeSlot | undefined;

    if (slot !== undefined && slot in theme.palette) {
      return solidFill(rgbColor((theme.palette[slot] as `#${string}`)));
    }
  }

  return null;
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
 * Recover text content from a `<p:sp>` body. Handles multi-paragraph
 * and multi-run text frames, concatenating runs with newlines between
 * paragraphs.
 */
export function extractTextContent(body: string): string {
  const txBody = extractBlock(body, 'p:txBody');

  if (txBody === null) return '';

  const paragraphs: string[] = [];

  for (const pMatch of txBody.block.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const pBody = pMatch[1] ?? '';
    const runs: string[] = [];

    for (const rMatch of pBody.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) {
      runs.push(decodeXmlEntities(rMatch[1] ?? ''));
    }

    paragraphs.push(runs.join(''));
  }

  return paragraphs.join('\n');
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
