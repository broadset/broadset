import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyleInput,
  BuiltInElementType,
  Canvas,
  PageElementInstance,
} from '@broadset/model';
import {
  BUILT_IN_ELEMENT_TYPES,
  createPageElementInstanceForElement,
  normalizeElementContent,
  styleSchema,
} from '@broadset/model';
import type { Layer } from 'ag-psd';
import { readPsd } from 'ag-psd';

import { encodeBitmapMaskFromLayerMask } from './bitmap-mask';
import { isRgbaColor, rgbaToHex } from './color-utils';
import { PSD_COORD_MAX, REVERSE_BLEND_MAP } from './constants';
import { bytesToDataUri } from './data-uri';
import { readDocumentXmpPacket } from './import-xmp';
import { ensureCanvasInitialized } from './runtime-canvas';
import type { PsdBitmapMask } from './types';
import { bezierPathToSvgD } from './vector-mask';

let importIdCounter = 0;
let importLinkedFiles: Map<string, { readonly data: Uint8Array; readonly type: string }> = new Map();

function isValidElementType(type: string): type is BuiltInElementType {
  return (BUILT_IN_ELEMENT_TYPES as readonly string[]).includes(type);
}

function createImportedElement(
  type: string,
  content: string,
  position: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  style: Partial<BroadsetElementStyleInput> = {},
): BroadsetElement {
  const validType = isValidElementType(type) ? type : 'rectangle';

  importIdCounter++;

  return {
    id: `psd-import-${String(importIdCounter)}`,
    type: validType,
    name: validType,
    locked: false,
    position,
    width,
    height,
    rotation: 0,
    content: normalizeElementContent(validType, content),
    style: styleSchema.parse({ opacity: 1, ...style }),
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    typeConfig: null,
    componentRef: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
  } satisfies BroadsetElement;
}

function detectLayerColor(
  layer: Layer,
): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } | undefined {
  if (!layer.imageData) return undefined;

  const data = layer.imageData.data;

  if (data.length < 4) return undefined;

  return {
    r: data[0] ?? 0,
    g: data[1] ?? 0,
    b: data[2] ?? 0,
    a: (data[3] ?? 255) / 255,
  };
}

interface LayerGeometry {
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

function extractGeometry(layer: Layer): LayerGeometry {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;

  return {
    position: { x: left, y: top },
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function extractDropShadow(effects: NonNullable<Layer['effects']>): string | undefined {
  const shadow = effects.dropShadow?.[0];

  if (!shadow?.enabled || !shadow.color || !isRgbaColor(shadow.color)) {
    return undefined;
  }

  const angle = (shadow.angle ?? 0) * (Math.PI / 180);
  const dist = shadow.distance?.value ?? 0;
  const blur = shadow.size?.value ?? 0;
  const opacity = shadow.opacity ?? 1;
  const ox = Math.round(Math.cos(angle) * dist);
  const oy = Math.round(Math.sin(angle) * dist);

  return `${String(ox)}px ${String(oy)}px ${String(blur)}px rgba(${String(shadow.color.r)},${String(shadow.color.g)},${String(shadow.color.b)},${String(opacity)})`;
}

function extractOuterGlowFilter(effects: NonNullable<Layer['effects']>): string | undefined {
  const glow = effects.outerGlow;

  if (!glow?.enabled || !glow.color || !isRgbaColor(glow.color)) {
    return undefined;
  }

  const glowBlur = glow.size?.value ?? 0;
  const glowOpacity = glow.opacity ?? 1;

  return `drop-shadow(0 0 ${String(glowBlur)}px rgba(${String(glow.color.r)},${String(glow.color.g)},${String(glow.color.b)},${String(glowOpacity)}))`;
}

function extractVectorMaskStyle(
  layer: Layer,
  width: number,
): Partial<{ readonly borderRadius: readonly number[]; readonly customClipPath: string }> {
  const firstPath = layer.vectorMask?.paths[0];

  if (!firstPath || firstPath.open) {
    return {};
  }

  if (firstPath.knots.length === 8) {
    const knot0 = firstPath.knots[0];

    if (!knot0) return {};

    const radiusPx = Math.round(((knot0.points[1] ?? 0) / PSD_COORD_MAX) * width);

    return { borderRadius: [radiusPx, radiusPx, radiusPx, radiusPx] };
  }

  const points = firstPath.knots.map((knot) => {
    const px = ((knot.points[1] ?? 0) / PSD_COORD_MAX) * 100;
    const py = ((knot.points[0] ?? 0) / PSD_COORD_MAX) * 100;

    return `${String(Math.round(px))}% ${String(Math.round(py))}%`;
  });

  return points.length >= 3 ? { customClipPath: `polygon(${points.join(', ')})` } : {};
}

function buildStyleFromLayer(layer: Layer, width: number): Record<string, unknown> {
  const style: Record<string, unknown> = {};

  if (layer.opacity !== undefined) {
    style['opacity'] = layer.opacity;
  }

  if (layer.blendMode) {
    const cssMode = REVERSE_BLEND_MAP[layer.blendMode];

    if (cssMode) {
      style['mixBlendMode'] = cssMode;
    }
  }

  if (layer.effects) {
    const boxShadow = extractDropShadow(layer.effects);

    if (boxShadow !== undefined) {
      style['boxShadow'] = boxShadow;
    }

    const filter = extractOuterGlowFilter(layer.effects);

    if (filter !== undefined) {
      style['filter'] = filter;
    }
  }

  Object.assign(style, extractVectorMaskStyle(layer, width));

  return style;
}

/**
 * Decompose a 6-element ag-psd text-transform `[xx, xy, yx, yy, tx,
 * ty]` back into degrees of rotation. Mirrors the export-side
 * `buildTextTransform`: `xx = cos θ`, `xy = sin θ`, so
 * `θ = atan2(xy, xx)`. Returns `0` when the transform is identity,
 * absent, or wrong-shaped — uniform rotation only (skew / non-uniform
 * scale fall back to axis-aligned, which is the closest Broadset
 * model representation today).
 */
function rotationFromTextTransform(transform: readonly number[] | undefined): number {
  if (transform === undefined || transform.length < 4) return 0;

  const xx = transform[0] ?? 1;
  const xy = transform[1] ?? 0;
  const radians = Math.atan2(xy, xx);
  const degrees = (radians * 180) / Math.PI;

  // Identity matrices commonly stored as `[1, 0, 0, 1, ...]` round to
  // zero; small floating-point drift is suppressed.
  return Math.abs(degrees) < 1e-6 ? 0 : degrees;
}

function importTextLayer(
  layer: Layer & { readonly text: NonNullable<Layer['text']> },
  geometry: LayerGeometry,
  style: Record<string, unknown>,
): BroadsetElement {
  const fontSize = layer.text.style?.fontSize ? { fontSize: layer.text.style.fontSize } : undefined;
  const fillColor = layer.text.style?.fillColor;
  const fontColor =
    fillColor && isRgbaColor(fillColor) ? { fontColor: rgbaToHex(fillColor.r, fillColor.g, fillColor.b) } : undefined;
  const rotation = rotationFromTextTransform(layer.text.transform);
  const base = createImportedElement('text', layer.text.text, geometry.position, geometry.width, geometry.height, {
    ...style,
    ...fontSize,
    ...fontColor,
  } satisfies Partial<BroadsetElementStyleInput>);

  return { ...base, rotation };
}

function importPlacedLayer(layer: Layer, geometry: LayerGeometry, style: Record<string, unknown>): BroadsetElement {
  const placedId = layer.placedLayer?.id;
  const linkedFileData = placedId === undefined ? undefined : importLinkedFiles.get(placedId);
  let content = '';

  if (linkedFileData) {
    content = bytesToDataUri(linkedFileData.data, linkedFileData.type);
  } else if (layer.imageData) {
    const bytes =
      layer.imageData.data instanceof Uint8Array ? layer.imageData.data : new Uint8Array(layer.imageData.data);

    content = bytesToDataUri(bytes, 'image/png');
  }

  return createImportedElement('image', content, geometry.position, geometry.width, geometry.height, style);
}

function importOpenVectorPath(
  layer: Layer,
  geometry: LayerGeometry,
  style: Record<string, unknown>,
): BroadsetElement | undefined {
  const firstPath = layer.vectorMask?.paths[0];

  if (!firstPath?.open) return undefined;

  const d = bezierPathToSvgD(firstPath, geometry.width, geometry.height);

  if (d === undefined) return undefined;

  return createImportedElement('path', d, geometry.position, geometry.width, geometry.height, style);
}

function importImageDataRectangle(
  layer: Layer,
  geometry: LayerGeometry,
  style: Record<string, unknown>,
): BroadsetElement {
  const hasColor = detectLayerColor(layer);
  const bgColor = hasColor ? rgbaToHex(hasColor.r, hasColor.g, hasColor.b, hasColor.a) : undefined;

  return createImportedElement('rectangle', '', geometry.position, geometry.width, geometry.height, {
    ...style,
    ...(bgColor ? { backgroundColor: bgColor } : undefined),
  } satisfies Partial<BroadsetElementStyleInput>);
}

function layerDisplayName(layer: Layer): string {
  const name = layer.name?.trim();

  return name && name.length > 0 ? name : '(unnamed layer)';
}

function buildPlaceholderWarning(layer: Layer): string {
  return `PSD import: layer "${layerDisplayName(layer)}" mapped as placeholder rectangle because it has no text, raster pixels, vector path, placed-layer data, or children Broadset can map natively.`;
}

function buildElementBody(layer: Layer, warnings: string[]): BroadsetElement | undefined {
  const geometry = extractGeometry(layer);
  const style = buildStyleFromLayer(layer, geometry.width);

  if (layer.text) {
    return importTextLayer(layer as Layer & { readonly text: NonNullable<Layer['text']> }, geometry, style);
  }

  if (layer.placedLayer) {
    return importPlacedLayer(layer, geometry, style);
  }

  if (style['borderRadius']) {
    return createImportedElement('rectangle', '', geometry.position, geometry.width, geometry.height, style);
  }

  const openPath = importOpenVectorPath(layer, geometry, style);

  if (openPath) return openPath;

  if (layer.imageData) {
    return importImageDataRectangle(layer, geometry, style);
  }

  // Group layers (have children, no own pixels): caller flattens via recursion.
  if (layer.children && layer.children.length > 0) {
    return undefined;
  }

  warnings.push(buildPlaceholderWarning(layer));

  return createImportedElement('rectangle', '', geometry.position, geometry.width, geometry.height, style);
}

/**
 * If the source PSD layer carries a bitmap (alpha-channel) mask, lift
 * the alpha bytes onto the element under `extensions.psd.bitmapMask`
 * so re-export reproduces the same mask. The vector mask (if any)
 * still wins as the editable Broadset surface — the bitmap mask only
 * rides as preservation.
 */
function attachBitmapMaskExtension(element: BroadsetElement, bitmapMask: PsdBitmapMask | undefined): BroadsetElement {
  if (bitmapMask === undefined) return element;

  const existingExtensions = (element.extensions as Record<string, unknown> | undefined) ?? {};
  const existingPsdExt = (existingExtensions['psd'] as Record<string, unknown> | undefined) ?? {};

  return {
    ...element,
    extensions: {
      ...existingExtensions,
      psd: {
        ...existingPsdExt,
        bitmapMask,
      },
    },
  } satisfies BroadsetElement;
}

function layerToElement(layer: Layer, warnings: string[]): BroadsetElement | undefined {
  const body = buildElementBody(layer, warnings);

  if (body === undefined) return undefined;

  const bitmapMask = layer.mask ? encodeBitmapMaskFromLayerMask(layer.mask) : undefined;

  return attachBitmapMaskExtension(body, bitmapMask);
}

type PsdPage = {
  readonly id: string;
  readonly name: string;
  readonly elements: readonly PageElementInstance[];
  readonly locale: null;
  readonly extensions: Readonly<Record<string, unknown>>;
};

function populateLinkedFiles(psd: ReturnType<typeof readPsd>): void {
  for (const lf of psd.linkedFiles ?? []) {
    if (lf.id && lf.data) {
      importLinkedFiles.set(lf.id, { data: lf.data, type: lf.type ?? 'image/png' });
    }
  }
}

function isGroupLayer(layer: Layer): boolean {
  return Array.isArray(layer.children) && layer.children.length > 0;
}

function importGroupLayer(layer: Layer, parentId: string | null): BroadsetElement {
  const geometry = extractGeometry(layer);
  const emptyStyle: Partial<BroadsetElementStyleInput> = {};
  const base = createImportedElement('group', '', geometry.position, geometry.width, geometry.height, emptyStyle);

  return { ...base, name: layer.name ?? base.name, parentId };
}

/**
 * Per-import budget book-keeping. Threaded through every recursive
 * call into {@link collectChildElements} so the importer can refuse
 * to descend past the configured nesting depth (`maxDepth`) and stop
 * collecting once the cumulative raster pixel total crosses
 * (`maxTotalPixels`). Both warnings are emitted at most once per
 * import so a deep tree doesn't fan out into thousands of duplicate
 * entries; the end-user surface still sees a single structured
 * notice via `importPsdDocument`.
 */
interface PsdImportBudget {
  readonly maxDepth: number;
  readonly maxTotalPixels: number;
  pixelTotal: number;
  depthWarningEmitted: boolean;
  pixelWarningEmitted: boolean;
  readonly warnings: string[];
}

function pixelCostForLayer(layer: Layer): number {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  return width * height;
}

function emitDepthWarningOnce(budget: PsdImportBudget): void {
  if (budget.depthWarningEmitted) return;
  budget.depthWarningEmitted = true;
  budget.warnings.push(
    `PSD import: layer-tree depth cap of ${String(budget.maxDepth)} reached. Layers nested past this depth were dropped to avoid unbounded recursion. Re-run with a higher \`maxDepth\` if you trust this file.`,
  );
}

function emitPixelWarningOnce(budget: PsdImportBudget): void {
  if (budget.pixelWarningEmitted) return;
  budget.pixelWarningEmitted = true;
  budget.warnings.push(
    `PSD import: total pixel cap of ${String(budget.maxTotalPixels)} reached. Subsequent raster layers were dropped to avoid unbounded allocation. Re-run with a higher \`maxTotalPixels\` if you trust this file.`,
  );
}

function pixelBudgetExceeded(budget: PsdImportBudget): boolean {
  return budget.maxTotalPixels > 0 && budget.pixelTotal > budget.maxTotalPixels;
}

function collectChildElements(
  children: readonly Layer[] | undefined,
  parentId: string | null,
  depth: number,
  budget: PsdImportBudget,
): BroadsetElement[] {
  if (budget.maxDepth > 0 && depth > budget.maxDepth) {
    emitDepthWarningOnce(budget);

    return [];
  }

  const elements: BroadsetElement[] = [];

  for (const child of children ?? []) {
    if (pixelBudgetExceeded(budget)) {
      emitPixelWarningOnce(budget);
      break;
    }

    if (isGroupLayer(child)) {
      const groupEl = importGroupLayer(child, parentId);

      elements.push(groupEl);
      elements.push(...collectChildElements(child.children, groupEl.id, depth + 1, budget));
      continue;
    }

    budget.pixelTotal += pixelCostForLayer(child);

    const el = layerToElement(child, budget.warnings);

    if (el === undefined) continue;

    elements.push(parentId === null ? el : { ...el, parentId });
  }

  return elements;
}

function makeEmptyPage(index: number, name: string): PsdPage {
  return { id: `page-${String(index + 1)}`, name, elements: [], locale: null, extensions: {} };
}

interface PsdImportShape {
  readonly pages: PsdPage[];
  readonly elements: BroadsetElement[];
  /**
   * Per-page list of root element IDs in the order the importer
   * produced them. Used after XMP-driven element-ID reconciliation to
   * stamp `PageElementInstance` entries onto each page so the active
   * page actually renders.
   */
  readonly rootIdsByPageIndex: readonly (readonly string[])[];
}

function buildPagesAndElements(psd: ReturnType<typeof readPsd>, budget: PsdImportBudget): PsdImportShape {
  const artboardLayers = (psd.children ?? []).filter((child) => child.artboard);

  if (artboardLayers.length === 0) {
    const flat = collectChildElements(psd.children, null, 0, budget);
    const rootIds = flat.filter((el) => el.parentId === null).map((el) => el.id);

    return {
      pages: [makeEmptyPage(0, 'Page 1')],
      elements: flat,
      rootIdsByPageIndex: [rootIds],
    };
  }

  const pages: PsdPage[] = [];
  const elements: BroadsetElement[] = [];
  const rootIdsByPageIndex: string[][] = [];

  for (const artboard of artboardLayers) {
    pages.push(makeEmptyPage(pages.length, artboard.name ?? `Page ${String(pages.length + 1)}`));

    const collected = collectChildElements(artboard.children, null, 0, budget);
    const rootIds = collected.filter((el) => el.parentId === null).map((el) => el.id);

    elements.push(...collected);
    rootIdsByPageIndex.push(rootIds);
  }

  return { pages, elements, rootIdsByPageIndex };
}

function warnOnXmpLayerCountMismatch(
  xmpPacket: ReturnType<typeof readDocumentXmpPacket>,
  layerElementCount: number,
  warnings: string[],
): void {
  if (xmpPacket === null) return;

  const xmpElementCount = xmpPacket.elements.length;

  if (xmpElementCount === layerElementCount) return;

  warnings.push(
    `PSD import: XMP packet declares ${String(xmpElementCount)} elements, layer tree yielded ${String(layerElementCount)}; trailing entries in the smaller list were ignored.`,
  );
}

/**
 * Default depth cap for PSD layer-tree import. Realistic Photoshop
 * documents nest 5-10 levels deep at the most extreme; 32 covers
 * every realistic case while bounding hostile layer trees.
 */
const DEFAULT_PSD_MAX_DEPTH = 32;

/**
 * Default total-pixel budget for raster layers (256 megapixels). A
 * single full-resolution photographic layer is typically <12 MP, so
 * this comfortably covers a deck of high-res images while bounding a
 * gigapixel canvas hostile fixture.
 */
const DEFAULT_PSD_MAX_TOTAL_PIXELS = 256 * 1024 * 1024;

export interface PsdImportInternalResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

/** Import a PSD file and recover BroadsetDocument elements. */
export function importPsd(data: Uint8Array): BroadsetDocument {
  return importPsdWithBudget(data).document;
}

/**
 * Cap-aware import variant. Returns the document plus structured
 * warnings emitted by the depth/pixel budgets so the
 * `importPsdDocument` wrapper can surface them on the
 * `DocumentImportResult.warnings` channel.
 */
export function importPsdWithBudget(
  data: Uint8Array,
  options?: { readonly maxDepth?: number | undefined; readonly maxTotalPixels?: number | undefined },
): PsdImportInternalResult {
  ensureCanvasInitialized();

  const psd = readPsd(data.buffer as ArrayBuffer, {
    skipCompositeImageData: true,
    skipThumbnail: true,
    useImageData: true,
  });

  importIdCounter = 0;
  importLinkedFiles = new Map();
  populateLinkedFiles(psd);

  const canvas: Canvas = {
    width: psd.width,
    height: psd.height,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };
  const budget: PsdImportBudget = {
    maxDepth: options?.maxDepth ?? DEFAULT_PSD_MAX_DEPTH,
    maxTotalPixels: options?.maxTotalPixels ?? DEFAULT_PSD_MAX_TOTAL_PIXELS,
    pixelTotal: 0,
    depthWarningEmitted: false,
    pixelWarningEmitted: false,
    warnings: [],
  };
  const { pages, elements, rootIdsByPageIndex } = buildPagesAndElements(psd, budget);
  const xmpPacket = readDocumentXmpPacket(psd);

  warnOnXmpLayerCountMismatch(xmpPacket, elements.length, budget.warnings);

  // XMP can rewrite element IDs to round-trip the original IDs from the
  // exporting Broadset session. Track the mapping so the per-page root
  // ID lists stay valid after reconciliation.
  const idRemap = new Map<string, string>();
  const reconciledElements: BroadsetElement[] = elements.map((el, index) => {
    if (xmpPacket === null) return el;

    const packetEntry = xmpPacket.elements[index];

    if (packetEntry === undefined) return el;

    idRemap.set(el.id, packetEntry.id);

    const existingPsdExt =
      ((el.extensions as Record<string, unknown> | undefined)?.['psd'] as Record<string, unknown> | undefined) ?? {};

    return {
      ...el,
      id: packetEntry.id,
      extensions: {
        ...el.extensions,
        psd: {
          ...existingPsdExt,
          dirty: false,
          roundTrip: { signature: 'BsPs', elementId: packetEntry.id },
        },
      },
    } satisfies BroadsetElement;
  });

  const elementsById = new Map(reconciledElements.map((el) => [el.id, el]));
  const pagesWithInstances: PsdPage[] = pages.map((page, pageIndex) => {
    const rootIds = rootIdsByPageIndex[pageIndex] ?? [];

    return {
      ...page,
      elements: rootIds
        .map((id) => elementsById.get(idRemap.get(id) ?? id))
        .filter((el): el is BroadsetElement => el !== undefined)
        .map(createPageElementInstanceForElement),
    };
  });

  return {
    document: {
      id: xmpPacket?.documentId ?? 'imported-psd',
      name: 'Imported PSD',
      documentMode: 'screen',
      canvas,
      elements: reconciledElements,
      pages: pagesWithInstances,
      animations: [],
      dataSchema: { fields: [] },
    } satisfies BroadsetDocument,
    warnings: budget.warnings,
  };
}
