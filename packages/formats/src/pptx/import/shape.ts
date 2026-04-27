import {
  type BroadsetElement,
  type Canvas,
  createDefaultElement,
  type Hyperlink,
} from '@broadset/model';

import {
  findDescendant,
  getAttr,
  parseOoxml,
  rootElement,
  serializeNode,
  type XmlElement,
} from '../ooxml/ast';
import { emuToCanvasLength, rotationUnitsToDegrees } from '../ooxml/units';
import { parseElementExt } from '../semantic/element-ext';
import { decodeShapeName } from '../semantic/shape-name';
import type { ElementMetaExtension, LayoutPlaceholder, ResolvedTheme } from '../types';
import { classifyChartGraphicFrame } from './chart';
import { detectGeometry, extractPresetName } from './geometry';
import { attachParentGroup } from './group';
import { buildPictureElement, type PictureImportWarning, type PictureSourceRef } from './picture';
import { applyShapeStyle } from './style';
import { classifyTableGraphicFrame,type UnsupportedShapeInfo } from './table';

export interface SlideImportContext {
  readonly canvas: Canvas;
  readonly theme: ResolvedTheme;
  /** Layout placeholder defaults — `idx` → font / size / colour. */
  readonly layoutPlaceholders: ReadonlyMap<number, LayoutPlaceholder>;
  /** `rId` → media-file path (inside the ZIP) for picture resolution. */
  readonly mediaByRelId: ReadonlyMap<string, PictureSourceRef>;
  /** `rId` → hyperlink target for `<a:hlinkClick>` resolution on text runs. */
  readonly hyperlinkByRelId: ReadonlyMap<string, Hyperlink>;
  /**
   * Importer warning sink. Populated as the shape walker encounters
   * content it drops or preserves as a raw blob. Returned to callers
   * via the importPptx result shape.
   */
  readonly warnings: PictureImportWarning[];
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
      const preserved = handleUnsupportedShape(ctx, child, parentGroupId);

      if (preserved !== null) out.push(preserved);

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

/**
 * Round-trip path for shape-tree children we don't yet map to a
 * native Broadset element kind (`<p:graphicFrame>` for tables /
 * charts / SmartArt, `<p:cxnSp>` connectors, `<p:contentPart>`
 * ink). Each emits a placeholder rectangle whose
 * `extensions.pptx.raw` carries the source XML verbatim, so a clean
 * round-trip re-emits the exact bytes per IO-D-18. Surfaces a
 * warning either way so users see what didn't make it to a native
 * Broadset element.
 *
 * Returns null when the node isn't a known unsupported shape kind
 * (in which case it's a non-shape child like `<p:nvGrpSpPr>` and
 * should be skipped silently).
 */
function handleUnsupportedShape(
  ctx: SlideImportContext,
  node: XmlElement,
  parentGroupId: string | null,
): BroadsetElement | null {
  const info = unsupportedShapeKind(node);

  if (info === null) return null;

  ctx.warnings.push({
    code: 'unsupported-shape',
    message: `${info.label} preserved as extensions.pptx.raw — re-export round-trips byte-equivalent content; native Broadset mapping deferred.`,
    ...(info.detail !== undefined ? { detail: info.detail } : {}),
  });

  const transform = extractTransform(ctx.canvas, node);

  if (transform === null) return null;

  const nameMatch = extractCNvPrAttrs(node);
  const elementIdBase = nameMatch?.bsetId ?? `pptx-el-${String(ctx.nextElementIndex)}`;
  const elementName = nameMatch?.displayName ?? info.label;

  ctx.nextElementIndex += 1;

  const base = buildBase(elementIdBase, elementName, 'rectangle', transform, parentGroupId);
  const raw = node.children.map((c) => serializeNode(c)).join('');

  return {
    ...base,
    extensions: {
      ...base.extensions,
      pptx: {
        dirty: false,
        raw,
        unsupportedTag: info.label,
        ...(info.detail !== undefined ? { unsupportedUri: info.detail } : {}),
      },
    },
  };
}

const PML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

function canonicalShapeTag(node: XmlElement): 'p:sp' | 'p:pic' | 'p:grpSp' | null {
  if (node.ns !== PML_NS) return null;
  if (node.local === 'sp') return 'p:sp';
  if (node.local === 'pic') return 'p:pic';
  if (node.local === 'grpSp') return 'p:grpSp';

  return null;
}

function classifyGraphicFrame(node: XmlElement): UnsupportedShapeInfo {
  const data = findDescendant(node, 'a:graphicData');
  const uri = data !== null ? getAttr(data, 'uri') ?? undefined : undefined;

  return (
    classifyTableGraphicFrame(uri) ??
    classifyChartGraphicFrame(uri) ??
    (uri !== undefined ? { label: 'OOXML graphicFrame', detail: uri } : { label: 'OOXML graphicFrame' })
  );
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
    return buildBase(id, name, 'group', transform, parentGroupId);
  }

  if (tagName === 'p:pic') {
    return buildPictureElement({
      shape,
      name,
      id,
      mediaByRelId: ctx.mediaByRelId,
      createFallback: () => buildBase(id, name, 'rectangle', transform, parentGroupId),
      createImageBase: () => buildBase(id, name, 'image', transform, parentGroupId),
      pushWarning: (warning) => {
        ctx.warnings.push(warning);
      },
    });
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

function preserveRawShape(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  const base = buildBase(id, name, 'rectangle', transform, parentGroupId);
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

  const off = findDescendant(xfrm, 'a:off');
  const ext = findDescendant(xfrm, 'a:ext');
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
 * `<p:extLst>` block.
 */
function extractElementMeta(shape: XmlElement): ElementMetaExtension | null {
  const cNvPr = findDescendant(shape, 'p:cNvPr');

  if (cNvPr === null) return null;

  const inner = cNvPr.children.map((c) => serializeNode(c)).join('');

  return parseElementExt(inner);
}

function buildBase(
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

  return attachParentGroup(base, parentGroupId);
}

function buildRectangle(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(ctx.canvas, buildBase(id, name, 'rectangle', transform, parentGroupId), shape);
}

function buildEllipse(
  ctx: SlideImportContext,
  id: string,
  name: string,
  transform: ParsedTransform,
  shape: XmlElement,
  parentGroupId: string | null,
): BroadsetElement {
  return applyShapeStyle(ctx.canvas, buildBase(id, name, 'ellipse', transform, parentGroupId), shape);
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
  const base = applyShapeStyle(ctx.canvas, buildBase(id, name, 'path', transform, parentGroupId), shape);

  return { ...base, content: d };
}
