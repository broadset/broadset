import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  BuiltInElementType,
  Canvas,
} from '@broadset/model';
import { BUILT_IN_ELEMENT_TYPES } from '@broadset/model';
import type { Layer } from 'ag-psd';
import { readPsd } from 'ag-psd';

import { isRgbaColor, rgbaToHex } from './color-utils';
import { PSD_COORD_MAX, REVERSE_BLEND_MAP } from './constants';
import { bytesToDataUri } from './data-uri';
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
  style: Partial<BroadsetElementStyle> = {},
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
    style: { opacity: 1, ...style },
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
  } as BroadsetElement;
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

function layerToElement(layer: Layer): BroadsetElement | undefined {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const position = { x: left, y: top };
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
    const shadow = layer.effects.dropShadow?.[0];

    if (shadow?.enabled) {
      const angle = (shadow.angle ?? 0) * (Math.PI / 180);
      const dist = shadow.distance?.value ?? 0;
      const blur = shadow.size?.value ?? 0;
      const color = shadow.color;
      const opacity = shadow.opacity ?? 1;
      const ox = Math.round(Math.cos(angle) * dist);
      const oy = Math.round(Math.sin(angle) * dist);

      if (color && isRgbaColor(color)) {
        style['boxShadow'] =
          `${String(ox)}px ${String(oy)}px ${String(blur)}px rgba(${String(color.r)},${String(color.g)},${String(color.b)},${String(opacity)})`;
      }
    }

    const glow = layer.effects.outerGlow;

    if (glow?.enabled) {
      const glowBlur = glow.size?.value ?? 0;
      const glowColor = glow.color;
      const glowOpacity = glow.opacity ?? 1;

      if (glowColor && isRgbaColor(glowColor)) {
        style['filter'] =
          `drop-shadow(0 0 ${String(glowBlur)}px rgba(${String(glowColor.r)},${String(glowColor.g)},${String(glowColor.b)},${String(glowOpacity)}))`;
      }
    }
  }

  if (layer.vectorMask?.paths) {
    const firstPath = layer.vectorMask.paths[0];

    if (firstPath && !firstPath.open && firstPath.knots.length === 8) {
      const knot0 = firstPath.knots[0];

      if (knot0) {
        const radiusPx = Math.round(((knot0.points[1] ?? 0) / PSD_COORD_MAX) * width);

        style['borderRadius'] = [radiusPx, radiusPx, radiusPx, radiusPx];
      }
    } else if (firstPath && !firstPath.open) {
      const points = firstPath.knots.map((knot) => {
        const px = ((knot.points[1] ?? 0) / PSD_COORD_MAX) * 100;
        const py = ((knot.points[0] ?? 0) / PSD_COORD_MAX) * 100;

        return `${String(Math.round(px))}% ${String(Math.round(py))}%`;
      });

      if (points.length >= 3) {
        style['customClipPath'] = `polygon(${points.join(', ')})`;
      }
    }
  }

  if (layer.text) {
    return createImportedElement('text', layer.text.text, position, width, height, {
      ...style,
      ...(layer.text.style?.fontSize ? { fontSize: layer.text.style.fontSize } : undefined),
      ...(layer.text.style?.fillColor && isRgbaColor(layer.text.style.fillColor) ?
        {
          fontColor: rgbaToHex(
            layer.text.style.fillColor.r,
            layer.text.style.fillColor.g,
            layer.text.style.fillColor.b,
          ),
        }
      : undefined),
    } as Partial<BroadsetElementStyle>);
  }

  if (layer.placedLayer) {
    let content = '';

    const linkedFileData = importLinkedFiles.get(layer.placedLayer.id);

    if (linkedFileData) {
      content = bytesToDataUri(linkedFileData.data, linkedFileData.type);
    } else if (layer.imageData) {
      content = bytesToDataUri(
        layer.imageData.data instanceof Uint8Array ? layer.imageData.data : new Uint8Array(layer.imageData.data),
        'image/png',
      );
    }

    return createImportedElement('image', content, position, width, height, style as Partial<BroadsetElementStyle>);
  }

  if (style['borderRadius']) {
    return createImportedElement('rectangle', '', position, width, height, style as Partial<BroadsetElementStyle>);
  }

  if (layer.vectorMask?.paths) {
    const firstPath = layer.vectorMask.paths[0];

    if (firstPath && firstPath.open) {
      const d = bezierPathToSvgD(firstPath, width, height);

      if (d) {
        return createImportedElement('path', d, position, width, height, style as Partial<BroadsetElementStyle>);
      }
    }
  }

  if (layer.imageData) {
    const hasColor = detectLayerColor(layer);
    const bgColor = hasColor ? rgbaToHex(hasColor.r, hasColor.g, hasColor.b, hasColor.a) : undefined;

    return createImportedElement('rectangle', '', position, width, height, {
      ...style,
      ...(bgColor ? { backgroundColor: bgColor } : undefined),
    } as Partial<BroadsetElementStyle>);
  }

  if (layer.children && layer.children.length > 0) {
    return undefined;
  }

  return createImportedElement('rectangle', '', position, width, height, style as Partial<BroadsetElementStyle>);
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

  for (const lf of psd.linkedFiles ?? []) {
    if (lf.id && lf.data) {
      importLinkedFiles.set(lf.id, {
        data: lf.data,
        type: lf.type ?? 'image/png',
      });
    }
  }

  const canvas: Canvas = {
    width: psd.width,
    height: psd.height,
    unit: 'px',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };

  const elements: BroadsetElement[] = [];
  const pages: Array<{
    readonly id: string;
    readonly name: string;
    readonly overrides: readonly [];
    readonly locale: null;
    readonly extensions: Readonly<Record<string, unknown>>;
  }> = [];

  const artboardLayers = (psd.children ?? []).filter((child) => child.artboard);

  if (artboardLayers.length > 0) {
    for (const artboard of artboardLayers) {
      pages.push({
        id: `page-${String(pages.length + 1)}`,
        name: artboard.name ?? `Page ${String(pages.length + 1)}`,
        overrides: [],
        locale: null,
        extensions: {},
      });

      for (const child of artboard.children ?? []) {
        const el = layerToElement(child);

        if (el) elements.push(el);
      }
    }
  } else {
    pages.push({
      id: 'page-1',
      name: 'Page 1',
      overrides: [],
      locale: null,
      extensions: {},
    });

    for (const child of psd.children ?? []) {
      const el = layerToElement(child);

      if (el) elements.push(el);
    }
  }

  return {
    id: 'imported-psd',
    name: 'Imported PSD',
    documentMode: 'screen',
    canvas,
    elements,
    pages,
    animations: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}
