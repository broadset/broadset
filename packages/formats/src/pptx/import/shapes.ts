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

import {
  findChild,
  findChildren,
  findDescendant,
  getAttr,
  getText,
  parseOoxml,
  rootElement,
  serializeNode,
  type XmlElement,
} from '../ooxml/ast';
import { OOXML_PRESET_COLOR_HEX } from '../ooxml/preset-colors';
import { emuToCanvasLength, emuToMm, rotationUnitsToDegrees } from '../ooxml/units';
import { parseElementExt } from '../semantic/element-ext';
import { decodeShapeName } from '../semantic/shape-name';
import type { ElementMetaExtension, LayoutPlaceholder, ResolvedTheme } from '../types';

/**
 * Operator-level shape recovery, AST-driven.
 *
 * Walks the parsed XML AST of a slide and emits Broadset elements for
 * the primitives the importer recognises: `<p:sp>` with rectangular /
 * round-rect / ellipse presets, `<a:custGeom>` paths, common preset
 * shapes (triangle / star / arrow / callout), `<p:pic>` images, and
 * `<p:grpSp>` groups. Anything else preserves under
 * `extensions.pptx.raw` per IO-D-18.
 *
 * Namespace-aware: matches by namespace URI, so non-default prefixes
 * (Keynote's `<dml:sp>`, etc.) resolve to the same canonical readers
 * as Office-canonical `<p:sp>`.
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
  const root = rootElement(parseOoxml(slideXml));

  if (root === null) return [];

  const spTree = findDescendant(root, 'p:spTree');

  if (spTree === null) return [];

  const elements: BroadsetElement[] = [];

  walkShapeTree(ctx, spTree, null, elements);

  return elements;
}

function walkShapeTree(
  ctx: SlideImportContext,
  parent: XmlElement,
  parentGroupId: string | null,
  out: BroadsetElement[],
): void {
  for (const child of parent.children) {
    if (child.kind !== 'element') continue;

    const tagName = canonicalShapeTag(child);

    if (tagName === null) {
      pushUnsupportedShapeWarning(ctx, child);
      continue;
    }

    const element = emitElementFromShape(ctx, tagName, child, parentGroupId);

    if (element === null) continue;

    out.push(element);

    if (tagName === 'p:grpSp') {
      walkShapeTree(ctx, child, element.id, out);
    }
  }
}

const PML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

function canonicalShapeTag(node: XmlElement): 'p:sp' | 'p:pic' | 'p:grpSp' | null {
  if (node.ns !== PML_NS) return null;
  if (node.local === 'sp') return 'p:sp';
  if (node.local === 'pic') return 'p:pic';
  if (node.local === 'grpSp') return 'p:grpSp';

  return null;
}

interface UnsupportedShapeInfo {
  readonly label: string;
  readonly detail?: string;
}

/**
 * Identify shape-tree children that aren't mapped to a Broadset
 * element today so the importer surfaces a warning instead of
 * dropping silently. Tables, charts, SmartArt diagrams, connectors,
 * and ink all live here.
 */
function pushUnsupportedShapeWarning(ctx: SlideImportContext, node: XmlElement): void {
  const info = unsupportedShapeKind(node);

  if (info === null) return;

  ctx.warnings.push({
    code: 'unsupported-shape',
    message: `${info.label} not yet mapped to a Broadset element — visual content dropped.`,
    ...(info.detail !== undefined ? { detail: info.detail } : {}),
  });
}

function classifyGraphicFrame(node: XmlElement): UnsupportedShapeInfo {
  const data = findDescendant(node, 'a:graphicData');
  const uri = data !== null ? getAttr(data, 'uri') ?? undefined : undefined;

  if (uri?.endsWith('/table')) return { label: 'OOXML table (<a:tbl>)', detail: uri };
  if (uri?.endsWith('/chart')) return { label: 'OOXML chart (<c:chart>)', detail: uri };
  if (uri?.includes('/diagram')) return { label: 'OOXML SmartArt diagram', detail: uri };

  return uri !== undefined ? { label: 'OOXML graphicFrame', detail: uri } : { label: 'OOXML graphicFrame' };
}

function unsupportedShapeKind(node: XmlElement): UnsupportedShapeInfo | null {
  if (node.ns !== PML_NS) return null;
  if (node.local === 'graphicFrame') return classifyGraphicFrame(node);
  if (node.local === 'cxnSp') return { label: 'OOXML connector (<p:cxnSp>)' };
  if (node.local === 'contentPart') return { label: 'OOXML ink / content part (<p:contentPart>)' };

  return null;
}

function emitElementFromShape(
  ctx: SlideImportContext,
  tagName: 'p:sp' | 'p:pic' | 'p:grpSp',
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement | null {
  const transform = extractTransform(ctx.canvas, shape);

  if (transform === null) return null;

  const nameMatch = extractCNvPrAttrs(shape);
  const elementIdBase = nameMatch?.bsetId ?? `pptx-el-${String(ctx.nextElementIndex)}`;
  const elementName = nameMatch?.displayName ?? elementIdBase;
  const meta = extractElementMeta(shape);

  ctx.nextElementIndex += 1;

  const built = buildElementByTag(ctx, tagName, elementIdBase, elementName, transform, shape, parentGroupId);

  if (built === null) return null;

  return applyMetaOverrides(built, meta, nameMatch);
}

function buildElementByTag(
  ctx: SlideImportContext,
  tagName: 'p:sp' | 'p:pic' | 'p:grpSp',
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement | null {
  if (tagName === 'p:grpSp') {
    return buildBase(ctx, id, name, 'group', transform, parentGroupId);
  }

  if (tagName === 'p:pic') {
    return buildPicture(ctx, id, name, transform, shape, parentGroupId);
  }

  // p:sp — dispatch on geometry.
  const geom = detectGeometry(shape);

  if (geom === null) return buildRectangle(ctx, id, name, transform, shape, parentGroupId);

  if (geom.kind === 'rectangle' || geom.kind === 'roundRect') {
    return buildRectangle(ctx, id, name, transform, shape, parentGroupId);
  }

  if (geom.kind === 'ellipse') {
    return buildEllipse(ctx, id, name, transform, shape, parentGroupId);
  }

  if (geom.kind === 'path') {
    return buildPath(ctx, id, name, transform, shape, parentGroupId, geom.d ?? '');
  }

  // Unknown preset — preserve under extensions.pptx.raw per IO-D-18.
  ctx.warnings.push({
    code: 'unsupported-shape',
    message: `Unknown OOXML preset for shape id ${id} — preserved as extensions.pptx.raw`,
    detail: extractPresetName(shape) ?? 'custom',
  });

  return preserveRawShape(ctx, id, name, transform, shape, parentGroupId);
}

const NATIVE_BROADSET_KINDS: ReadonlySet<string> = new Set([
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
]);

/**
 * Apply Broadset metadata pulled from `<p:extLst>` and the BSET shape
 * name onto a freshly-built element. Type override priority:
 * 1. `extLst.kind` — structured per-shape extension (most authoritative).
 * 2. `bsetTag.kind` (from the shape name) — fallback when extLst was stripped.
 */
function applyMetaOverrides(
  element: BroadsetElement,
  meta: ElementMetaExtension | null,
  nameMatch: CNvPrAttrs | null,
): BroadsetElement {
  const overrideKind = pickOverrideKind(element.type, meta, nameMatch);
  const dataFieldFromMeta = meta?.dataField ?? nameMatch?.bsetDataField;
  const dataFieldBinding =
    dataFieldFromMeta !== undefined && dataFieldFromMeta.length > 0
      ? { fieldName: dataFieldFromMeta, overflow: 'clip' as const }
      : null;

  const result: BroadsetElement = {
    ...element,
    ...(overrideKind !== null ? { type: overrideKind } : {}),
    ...(dataFieldBinding !== null ? { dataField: dataFieldBinding } : {}),
  };

  if (meta !== null) {
    const existingExt = (result.extensions['pptx'] as Record<string, unknown> | undefined) ?? {};

    return {
      ...result,
      extensions: {
        ...result.extensions,
        pptx: {
          ...existingExt,
          dirty: meta.dirty,
        },
      },
    };
  }

  return result;
}

function pickOverrideKind(
  geomType: string,
  meta: ElementMetaExtension | null,
  nameMatch: CNvPrAttrs | null,
): string | null {
  const metaKind = meta?.kind;

  if (metaKind !== undefined && metaKind !== geomType && NATIVE_BROADSET_KINDS.has(metaKind)) {
    return metaKind;
  }

  const tagKind = nameMatch?.bsetKind;

  if (tagKind !== undefined && tagKind !== geomType && NATIVE_BROADSET_KINDS.has(tagKind)) {
    return tagKind;
  }

  return null;
}

function extractPresetName(shape: XmlElement): string | undefined {
  const prst = findDescendant(shape, 'a:prstGeom');

  return prst !== null ? getAttr(prst, 'prst') : undefined;
}

function preserveRawShape(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  const base = buildBase(ctx, id, name, 'rectangle', transform, parentGroupId);
  const styled = applyShapeStyle(ctx.canvas, base, shape);
  // Serialise the shape's children back to a raw-XML string so the
  // exporter can re-emit byte-equivalent content per IO-D-18.
  const raw = shape.children.map((c) => serializeNode(c)).join('');

  return {
    ...styled,
    extensions: {
      ...(styled.extensions),
      pptx: { dirty: false, raw },
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

function extractTransform(canvas: Canvas, shape: XmlElement): ParsedTransform | null {
  const xfrm = findDescendant(shape, 'a:xfrm');

  if (xfrm === null) return { x: 0, y: 0, width: 1, height: 1, rotation: 0, flipH: false, flipV: false };

  const off = findChild(xfrm, 'a:off');
  const ext = findChild(xfrm, 'a:ext');
  const x = off !== null ? emuToCanvasLength(canvas, parseInt(getAttr(off, 'x') ?? '0', 10)) : 0;
  const y = off !== null ? emuToCanvasLength(canvas, parseInt(getAttr(off, 'y') ?? '0', 10)) : 0;
  const width = ext !== null ? emuToCanvasLength(canvas, parseInt(getAttr(ext, 'cx') ?? '1', 10)) : 1;
  const height = ext !== null ? emuToCanvasLength(canvas, parseInt(getAttr(ext, 'cy') ?? '1', 10)) : 1;
  const rotAttr = getAttr(xfrm, 'rot');
  const rotation = rotAttr !== undefined ? rotationUnitsToDegrees(parseInt(rotAttr, 10)) : 0;
  const flipH = getAttr(xfrm, 'flipH') === '1';
  const flipV = getAttr(xfrm, 'flipV') === '1';

  return { x, y, width, height, rotation, flipH, flipV };
}

interface CNvPrAttrs {
  readonly bsetId?: string;
  readonly displayName: string;
  readonly bsetKind?: string;
  readonly bsetDataField?: string;
}

function extractCNvPrAttrs(shape: XmlElement): CNvPrAttrs | null {
  const cNvPr = findDescendant(shape, 'p:cNvPr');

  if (cNvPr === null) return null;

  const rawName = getAttr(cNvPr, 'name') ?? '';
  // The AST already decodes XML entities on attribute values, so
  // `Foo &amp; Bar` arrives as `Foo & Bar` here.
  const displayName = rawName;
  const bsetTag = displayName.length > 0 ? decodeShapeName(displayName) : null;

  if (bsetTag !== null) {
    return {
      bsetId: bsetTag.id,
      displayName: bsetTag.id,
      bsetKind: bsetTag.kind,
      ...(bsetTag.dataField !== undefined ? { bsetDataField: bsetTag.dataField } : {}),
    };
  }

  return { displayName };
}

/**
 * Pull the per-shape Broadset metadata extension out of the shape's
 * `<p:extLst>` block. Defers to the namespace-aware `parseElementExt`
 * by serialising the cNvPr inner body — the function is shared with
 * the customXml ledger reader so we don't re-implement the schema.
 */
function extractElementMeta(shape: XmlElement): ElementMetaExtension | null {
  const cNvPr = findDescendant(shape, 'p:cNvPr');

  if (cNvPr === null) return null;

  const inner = cNvPr.children.map((c) => serializeNode(c)).join('');

  return parseElementExt(inner);
}

interface DetectedGeometry {
  readonly kind: 'rectangle' | 'roundRect' | 'ellipse' | 'path' | 'unknown';
  readonly d?: string;
}

function detectGeometry(shape: XmlElement): DetectedGeometry | null {
  const prst = findDescendant(shape, 'a:prstGeom');

  if (prst !== null) {
    const preset = getAttr(prst, 'prst') ?? '';

    if (preset === 'rect') return { kind: 'rectangle' };
    if (preset === 'roundRect') return { kind: 'roundRect' };
    if (preset === 'ellipse' || preset === 'circle') return { kind: 'ellipse' };

    const presetD = OOXML_PRESET_TO_SVG_D[preset];

    if (presetD !== undefined) return { kind: 'path', d: presetD };

    return { kind: 'unknown' };
  }

  const custGeom = findDescendant(shape, 'a:custGeom');

  if (custGeom !== null) {
    const d = custGeomToSvgD(custGeom);

    return { kind: 'path', d };
  }

  return null;
}

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
  wedgeRectCallout: 'M 0 0 L 100000 0 L 100000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 0 75000 Z',
  wedgeRoundRectCallout: 'M 10000 0 L 90000 0 L 100000 10000 L 100000 65000 L 90000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 10000 75000 L 0 65000 L 0 10000 Z',
  wedgeEllipseCallout: 'M 50000 0 C 22386 0 0 16863 0 37500 C 0 58137 22386 75000 50000 75000 L 60000 75000 L 50000 100000 L 40000 75000 C 36000 75000 32000 74600 28000 73850 Z',
};

function custGeomToSvgD(custGeom: XmlElement): string {
  const path = findDescendant(custGeom, 'a:path');

  if (path === null) return '';

  const ops: string[] = [];

  for (const op of path.children) {
    if (op.kind !== 'element') continue;

    const segment = opToSvgSegment(op);

    if (segment !== null) ops.push(segment);
    else if (op.local === 'close') ops.push('Z');
  }

  const d = ops.join(' ');

  if (d.length === 0) return '';

  try {
    return svgpath(d).abs().toString();
  } catch {
    return d;
  }
}

function opToSvgSegment(op: XmlElement): string | null {
  const pts = findChildren(op, 'a:pt').map((pt) => ({
    x: parseFloat(getAttr(pt, 'x') ?? '0'),
    y: parseFloat(getAttr(pt, 'y') ?? '0'),
  }));
  const p0 = pts[0];
  const p1 = pts[1];
  const p2 = pts[2];

  if (op.local === 'moveTo' && p0 !== undefined) return `M ${String(p0.x)} ${String(p0.y)}`;
  if (op.local === 'lnTo' && p0 !== undefined) return `L ${String(p0.x)} ${String(p0.y)}`;

  if (op.local === 'cubicBezTo' && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return `C ${String(p0.x)} ${String(p0.y)} ${String(p1.x)} ${String(p1.y)} ${String(p2.x)} ${String(p2.y)}`;
  }

  if (op.local === 'quadBezTo' && p0 !== undefined && p1 !== undefined) {
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

function buildRectangle(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'rectangle', transform, parentGroupId), shape);
}

function buildEllipse(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'ellipse', transform, parentGroupId), shape);
}

function buildPath(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
  d: string,
): BroadsetElement {
  const base = applyShapeStyle(ctx.canvas, buildBase(ctx, id, name, 'path', transform, parentGroupId), shape);

  return { ...base, content: d };
}

function applyShapeStyle(canvas: Canvas, element: BroadsetElement, shape: XmlElement): BroadsetElement {
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

function buildPicture(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement | null {
  const blip = findDescendant(shape, 'a:blip');

  if (blip === null) {
    ctx.warnings.push({
      code: 'unsupported-content',
      message: `Picture shape "${name}" has no <a:blip> fill — rendered as transparent rectangle.`,
      detail: id,
    });

    return buildBase(ctx, id, name, 'rectangle', transform, parentGroupId);
  }

  const relId = getAttr(blip, 'embed') ?? '';
  const media = ctx.mediaByRelId.get(relId);

  if (!media) {
    ctx.warnings.push({
      code: 'unsupported-content',
      message: `Picture shape "${name}" references missing media (rel "${relId}") — rendered as transparent rectangle.`,
      detail: id,
    });

    return buildBase(ctx, id, name, 'rectangle', transform, parentGroupId);
  }

  const base = buildBase(ctx, id, name, 'image', transform, parentGroupId);
  const dataUri = `data:${media.mime};base64,${uint8ToBase64(media.bytes)}`;
  const srcRect = parseSrcRect(shape);

  if (srcRect === null) return { ...base, content: dataUri };

  // Apply the OOXML crop visually via `style.customClipPath` (CSS
  // `inset()` is the exact semantic match for `<a:srcRect>`) AND
  // preserve the raw srcRect on `extensions.pptx.srcRect` so a clean
  // round-trip re-emits the same crop. CSS `inset(top right bottom
  // left)` accepts the four edge insets in clockwise-from-top order,
  // each as a percentage. OOXML's units are 1/100000 (50000 = 50%);
  // we divide by 1000 to land at CSS percent.
  const clipPath = `inset(${formatPercent(srcRect.t)} ${formatPercent(srcRect.r)} ${formatPercent(srcRect.b)} ${formatPercent(srcRect.l)})`;
  const existingExt = (base.extensions['pptx'] as Record<string, unknown> | undefined) ?? {};

  return {
    ...base,
    content: dataUri,
    style: {
      ...base.style,
      customClipPath: clipPath,
    },
    extensions: {
      ...base.extensions,
      pptx: {
        ...existingExt,
        srcRect,
      },
    },
  };
}

function formatPercent(ooxmlValue: number): string {
  // OOXML srcRect uses 1/100000 units; CSS inset() takes percentages.
  // Round to two decimal places so the output stays compact.
  return `${(ooxmlValue / 1000).toFixed(2)}%`;
}

function parseSrcRect(shape: XmlElement): { readonly l: number; readonly t: number; readonly r: number; readonly b: number } | null {
  const node = findDescendant(shape, 'a:srcRect');

  if (node === null) return null;

  const l = parseInt(getAttr(node, 'l') ?? '0', 10);
  const t = parseInt(getAttr(node, 't') ?? '0', 10);
  const r = parseInt(getAttr(node, 'r') ?? '0', 10);
  const b = parseInt(getAttr(node, 'b') ?? '0', 10);

  if (l === 0 && t === 0 && r === 0 && b === 0) return null;

  return { l, t, r, b };
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
function parseColorElement(node: XmlElement): BroadsetColor | null {
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
 * with per-run styling. Public API takes a raw XML body string for
 * backward compatibility — callers that already have an `XmlElement`
 * should pass it through `extractTextBodyFromNode` directly.
 */
export function extractTextBody(
  canvas: Canvas,
  body: string,
  hyperlinks?: ReadonlyMap<string, Hyperlink>,
): TextBody | null {
  // Wrap the body fragment so fast-xml-parser sees a single root, then
  // navigate down to the `<p:txBody>` via the AST.
  const wrapped = `<sp xmlns:p="${PML_NS}" xmlns:a="${DML_NS}" xmlns:r="${REL_NS}">${body}</sp>`;
  const root = rootElement(parseOoxml(wrapped));

  if (root === null) return null;

  return extractTextBodyFromNode(canvas, root, hyperlinks);
}

const DML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function extractTextBodyFromNode(
  canvas: Canvas,
  shape: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): TextBody | null {
  const txBody = findDescendant(shape, 'p:txBody');

  if (txBody === null) return null;

  const paragraphs: Paragraph[] = [];

  for (const p of findChildren(txBody, 'a:p')) {
    const runs = extractRuns(p, hyperlinks);
    const props = extractParagraphProps(canvas, p);
    const finalRuns: readonly Run[] = runs.length === 0 ? [{ text: '' }] : runs;

    paragraphs.push(props === null ? { runs: finalRuns } : { runs: finalRuns, props });
  }

  if (paragraphs.length === 0) return null;

  return { paragraphs };
}

function extractParagraphProps(canvas: Canvas, p: XmlElement): ParagraphProps | null {
  const pPr = findChild(p, 'a:pPr');

  if (pPr === null) return null;

  const props: { -readonly [K in keyof ParagraphProps]?: ParagraphProps[K] } = {};

  const algn = getAttr(pPr, 'algn');
  const align = ooxmlAlignToBroadset(algn);

  if (align !== undefined) props.align = align;

  const indentAttr = getAttr(pPr, 'indent');

  if (indentAttr !== undefined) props.indent = emuToCanvasLength(canvas, parseInt(indentAttr, 10));

  const marLAttr = getAttr(pPr, 'marL');

  if (marLAttr !== undefined) {
    props.indent ??= emuToCanvasLength(canvas, parseInt(marLAttr, 10));
  }

  const bullet = parseBulletFromPPr(pPr);

  if (bullet !== null) props.bullet = bullet;

  const lnSpc = findChild(pPr, 'a:lnSpc');

  if (lnSpc !== null) {
    const spcPct = findChild(lnSpc, 'a:spcPct');

    if (spcPct !== null) {
      props.lineSpacing = parseInt(getAttr(spcPct, 'val') ?? '100000', 10) / 100000;
    }
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

function parseBulletFromPPr(pPr: XmlElement): Bullet | null {
  if (findChild(pPr, 'a:buNone') !== null) return { kind: 'none' };

  const buChar = findChild(pPr, 'a:buChar');

  if (buChar !== null) {
    const char = getAttr(buChar, 'char') ?? '•';

    return { kind: 'char', char };
  }

  const buAuto = findChild(pPr, 'a:buAutoNum');

  if (buAuto !== null) {
    const format = getAttr(buAuto, 'type') ?? 'arabicPeriod';
    const startAtAttr = getAttr(buAuto, 'startAt');

    return startAtAttr !== undefined
      ? { kind: 'auto', format, startAt: parseInt(startAtAttr, 10) }
      : { kind: 'auto', format };
  }

  return null;
}

function extractRuns(
  paragraph: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run[] {
  const runs: Run[] = [];

  for (const r of findChildren(paragraph, 'a:r')) {
    runs.push(buildRunFromElement(r, hyperlinks));
  }

  // Fallback: paragraphs without `<a:r>` wrapper but with raw `<a:t>`
  // text — emit a single unstyled run.
  if (runs.length === 0) {
    for (const t of findChildren(paragraph, 'a:t')) {
      runs.push({ text: getText(t) });
    }
  }

  return runs;
}

function buildRunFromElement(
  r: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run {
  const t = findChild(r, 'a:t');
  const text = t !== null ? getText(t) : '';
  const rPr = findChild(r, 'a:rPr');

  if (rPr === null) return { text };

  const style = runStyleFromRPr(rPr);
  const lang = getAttr(rPr, 'lang');
  const hyperlink = parseRunHyperlink(rPr, hyperlinks);
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle && lang === undefined && hyperlink === undefined) return { text };

  const props = {
    ...(hasStyle ? { style } : {}),
    ...(lang !== undefined ? { lang } : {}),
    ...(hyperlink !== undefined ? { hyperlink } : {}),
  };

  return { text, props };
}

function parseRunHyperlink(
  rPr: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Hyperlink | undefined {
  if (hyperlinks === undefined) return undefined;

  const hlink = findChild(rPr, 'a:hlinkClick');

  if (hlink === null) return undefined;

  const relId = getAttr(hlink, 'id') ?? '';

  if (relId.length === 0) return undefined;

  const target = hyperlinks.get(relId);

  if (target === undefined) return undefined;

  const tooltip = getAttr(hlink, 'tooltip');

  if (tooltip !== undefined && tooltip.length > 0 && target.tooltip !== tooltip) {
    return { ...target, tooltip };
  }

  return target;
}

function runStyleFromRPr(rPr: XmlElement): Record<string, unknown> {
  const style: Record<string, unknown> = {};

  if (getAttr(rPr, 'b') === '1') style['bold'] = true;
  if (getAttr(rPr, 'i') === '1') style['italic'] = true;

  const uAttr = getAttr(rPr, 'u');

  if (uAttr !== undefined && uAttr !== 'none') style['underline'] = true;

  const szAttr = getAttr(rPr, 'sz');

  if (szAttr !== undefined) style['fontSize'] = parseInt(szAttr, 10) / 100;

  const latin = findChild(rPr, 'a:latin');

  if (latin !== null) {
    const typeface = getAttr(latin, 'typeface');

    if (typeface !== undefined) style['fontFamily'] = typeface;
  }

  const solid = findChild(rPr, 'a:solidFill');

  if (solid !== null) {
    const color = parseColorElement(solid);

    if (color !== null) style['color'] = color;
  }

  return style;
}

/**
 * Compose a BroadsetDocument from per-slide element lists. Used by
 * the operator-level importer once parseSlideShapes has populated
 * each page.
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
  // Element ids must be globally unique across the document. PowerPoint
  // "Duplicate slide" copies the shape XML verbatim, BSET tags and all,
  // so two slides can carry the same `BSET:{id}:…` name. Without
  // disambiguation the merge ledger collapses both into one element.
  // We give the second-and-later occurrences a synthetic suffix tagged
  // with the slide id so the originals match the preserved JSON and
  // the duplicates land as fresh elements (markDirty path).
  const seenIds = new Map<string, number>();

  for (const slide of slides) {
    for (const el of slide.elements) {
      const seenCount = seenIds.get(el.id) ?? 0;

      seenIds.set(el.id, seenCount + 1);

      if (seenCount === 0) {
        allElements.push(el);
        continue;
      }

      const disambiguated: BroadsetElement = {
        ...el,
        id: `${el.id}__dup-${slide.id}`,
      };

      allElements.push(disambiguated);
    }
  }

  const pages = slides.map((slide) => ({
    id: slide.id,
    name: slide.id,
    elements: [],
    locale: null,
    extensions: {},
    ...(slide.notes !== undefined && slide.notes.length > 0 ? { notes: slide.notes } : {}),
  }));

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
