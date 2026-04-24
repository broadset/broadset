import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyleInput,
  BuiltInElementType,
  Canvas,
} from '@broadset/model';
import { BUILT_IN_ELEMENT_TYPES, styleSchema } from '@broadset/model';
import type { Layer } from 'ag-psd';
import { readPsd } from 'ag-psd';

import { isRgbaColor, rgbaToHex } from './color-utils';
import { PSD_COORD_MAX, REVERSE_BLEND_MAP } from './constants';
import { bytesToDataUri } from './data-uri';
import { readDocumentXmpPacket } from './import-xmp';
import { ensureCanvasInitialized } from './runtime-canvas';
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
    content,
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

function importTextLayer(
  layer: Layer & { readonly text: NonNullable<Layer['text']> },
  geometry: LayerGeometry,
  style: Record<string, unknown>,
): BroadsetElement {
  const fontSize = layer.text.style?.fontSize ? { fontSize: layer.text.style.fontSize } : undefined;
  const fillColor = layer.text.style?.fillColor;
  const fontColor =
    fillColor && isRgbaColor(fillColor) ? { fontColor: rgbaToHex(fillColor.r, fillColor.g, fillColor.b) } : undefined;

  return createImportedElement('text', layer.text.text, geometry.position, geometry.width, geometry.height, {
    ...style,
    ...fontSize,
    ...fontColor,
  } satisfies Partial<BroadsetElementStyleInput>);
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

  return createImportedElement(
    'image',
    content,
    geometry.position,
    geometry.width,
    geometry.height,
    style as Partial<BroadsetElementStyleInput>,
  );
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

  return createImportedElement(
    'path',
    d,
    geometry.position,
    geometry.width,
    geometry.height,
    style as Partial<BroadsetElementStyleInput>,
  );
}

function importImageDataRectangle(layer: Layer, geometry: LayerGeometry, style: Record<string, unknown>): BroadsetElement {
  const hasColor = detectLayerColor(layer);
  const bgColor = hasColor ? rgbaToHex(hasColor.r, hasColor.g, hasColor.b, hasColor.a) : undefined;

  return createImportedElement('rectangle', '', geometry.position, geometry.width, geometry.height, {
    ...style,
    ...(bgColor ? { backgroundColor: bgColor } : undefined),
  } satisfies Partial<BroadsetElementStyleInput>);
}

function layerToElement(layer: Layer): BroadsetElement | undefined {
  const geometry = extractGeometry(layer);
  const style = buildStyleFromLayer(layer, geometry.width);

  if (layer.text) {
    return importTextLayer(layer as Layer & { readonly text: NonNullable<Layer['text']> }, geometry, style);
  }

  if (layer.placedLayer) {
    return importPlacedLayer(layer, geometry, style);
  }

  if (style['borderRadius']) {
    return createImportedElement(
      'rectangle',
      '',
      geometry.position,
      geometry.width,
      geometry.height,
      style as Partial<BroadsetElementStyleInput>,
    );
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

  return createImportedElement(
    'rectangle',
    '',
    geometry.position,
    geometry.width,
    geometry.height,
    style as Partial<BroadsetElementStyleInput>,
  );
}

type PsdPage = {
  readonly id: string;
  readonly name: string;
  readonly elements: readonly [];
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

function collectChildElements(children: readonly Layer[] | undefined): BroadsetElement[] {
  const elements: BroadsetElement[] = [];

  for (const child of children ?? []) {
    const el = layerToElement(child);

    if (el) elements.push(el);
  }

  return elements;
}

function makePage(index: number, name: string): PsdPage {
  return { id: `page-${String(index + 1)}`, name, elements: [], locale: null, extensions: {} };
}

function buildPagesAndElements(psd: ReturnType<typeof readPsd>): {
  readonly pages: PsdPage[];
  readonly elements: BroadsetElement[];
} {
  const artboardLayers = (psd.children ?? []).filter((child) => child.artboard);

  if (artboardLayers.length === 0) {
    return {
      pages: [makePage(0, 'Page 1')],
      elements: collectChildElements(psd.children),
    };
  }

  const pages: PsdPage[] = [];
  const elements: BroadsetElement[] = [];

  for (const artboard of artboardLayers) {
    pages.push(makePage(pages.length, artboard.name ?? `Page ${String(pages.length + 1)}`));
    elements.push(...collectChildElements(artboard.children));
  }

  return { pages, elements };
}

/** Import a PSD file and recover BroadsetDocument elements. */
export function importPsd(data: Uint8Array): BroadsetDocument {
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
  const { pages, elements } = buildPagesAndElements(psd);
  const xmpPacket = readDocumentXmpPacket(psd);
  const reconciledElements = xmpPacket
    ? elements.map((el, index) => {
        const packetEntry = xmpPacket.elements[index];

        if (packetEntry === undefined) return el;

        return {
          ...el,
          id: packetEntry.id,
          extensions: { ...el.extensions, psd: { dirty: false, roundTrip: { signature: 'BsPs', elementId: packetEntry.id } } },
        } satisfies BroadsetElement;
      })
    : elements;

  return {
    id: xmpPacket?.documentId ?? 'imported-psd',
    name: 'Imported PSD',
    documentMode: 'screen',
    canvas,
    elements: reconciledElements,
    pages,
    animations: [],
    dataSchema: { fields: [] },
  } satisfies BroadsetDocument;
}
