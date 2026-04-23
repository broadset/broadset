import { type BroadsetElement, resolveStyleColor } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { parseHexColor } from './color-utils';
import { BLEND_MODE_MAP } from './constants';
import { decodeDataUri } from './data-uri';
import { parseBoxShadow, parseFilterGlow } from './effects';
import { buildRoundedRectMask, polygonToVectorMask, svgPathToPsdVectorMask } from './vector-mask';

interface LinkedFileEntry {
  readonly id: string;
  readonly name: string;
  readonly data: Uint8Array;
  readonly type: string;
}

interface ExportState {
  guidCounter: number;
  pendingLinkedFiles: LinkedFileEntry[];
  prefetchedUrlImages: Map<string, { readonly mime: string; readonly bytes: Uint8Array }>;
}

const exportState: ExportState = {
  guidCounter: 0,
  pendingLinkedFiles: [],
  prefetchedUrlImages: new Map(),
};

export function resetExportState(): void {
  exportState.guidCounter = 0;
  exportState.pendingLinkedFiles = [];
}

export function setPrefetchedUrlImages(
  images: Map<string, { readonly mime: string; readonly bytes: Uint8Array }>,
): void {
  exportState.prefetchedUrlImages = images;
}

export function getPendingLinkedFiles(): readonly LinkedFileEntry[] {
  return exportState.pendingLinkedFiles;
}

function elementIdToGuid(id: string): string {
  exportState.guidCounter++;

  const hex = exportState.guidCounter.toString(16).padStart(12, '0');
  const hash = simpleHash(id).toString(16).padStart(8, '0');

  return `${hash}-0000-4000-8000-${hex}`;
}

function simpleHash(s: string): number {
  let hash = 0;

  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function createSolidPixels(
  width: number,
  height: number,
  color: { readonly r: number; readonly g: number; readonly b: number; readonly a: number },
): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;

    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = color.a;
  }

  return data;
}

function applyBlendMode(layer: Layer, el: BroadsetElement): void {
  if (!el.style.mixBlendMode) return;

  const psdMode = BLEND_MODE_MAP[el.style.mixBlendMode];

  if (psdMode) {
    layer.blendMode = psdMode;
  }
}

function applyVectorMasks(layer: Layer, el: BroadsetElement): void {
  if (el.style.borderRadius) {
    const [a, b, c, d] = el.style.borderRadius;
    const maskPath = buildRoundedRectMask(el.width, el.height, [a, b, c, d]);

    layer.vectorMask = { paths: [maskPath] };
  }

  if (!el.style.customClipPath) return;

  const polyMatch = el.style.customClipPath.match(/polygon\(([^)]+)\)/);

  if (!polyMatch) return;

  const clipPath = polygonToVectorMask(polyMatch[1] ?? '', el.width, el.height);

  if (!clipPath) return;

  const existing = layer.vectorMask?.paths ?? [];

  layer.vectorMask = { paths: [...existing, { ...clipPath, operation: 'intersect' }] };
}

function applyBoxShadow(layer: Layer, el: BroadsetElement): void {
  if (!el.style.boxShadow) return;

  const shadow = parseBoxShadow(el.style.boxShadow);

  if (!shadow) return;

  layer.effects = {
    ...layer.effects,
    dropShadow: [
      {
        present: true,
        enabled: true,
        color: { r: shadow.color.r, g: shadow.color.g, b: shadow.color.b },
        opacity: shadow.color.a,
        angle: Math.round(Math.atan2(shadow.offsetY, shadow.offsetX) * (180 / Math.PI)),
        distance: { units: 'Pixels', value: Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2) },
        size: { units: 'Pixels', value: shadow.blur },
        ...(shadow.spread ? { choke: { units: 'Pixels', value: shadow.spread } } : undefined),
      },
    ],
  };
}

function applyFilterGlow(layer: Layer, el: BroadsetElement): void {
  if (!el.style.filter) return;

  const glow = parseFilterGlow(el.style.filter);

  if (!glow) return;

  layer.effects = {
    ...layer.effects,
    outerGlow: {
      present: true,
      enabled: true,
      color: { r: glow.color.r, g: glow.color.g, b: glow.color.b },
      opacity: glow.color.a,
      size: { units: 'Pixels', value: glow.blur },
    },
  };
}

function applyTextContent(layer: Layer, el: BroadsetElement): void {
  const fontSize = el.style.fontSize ?? 12;
  const fontColorCss = resolveStyleColor(el.style.fontColor, { resolveTheme: false });
  const color = fontColorCss ? parseHexColor(fontColorCss) : undefined;

  layer.text = {
    text: el.content,
    style: color ? { fontSize, fillColor: color } : { fontSize },
  };
}

function applyImageContent(layer: Layer, el: BroadsetElement): void {
  if (!el.content) return;

  const decoded = decodeDataUri(el.content);
  const urlContent = exportState.prefetchedUrlImages.get(el.id);
  const imageBytes = decoded ?? urlContent;

  if (!imageBytes) return;

  const w = Math.max(1, Math.round(el.width));
  const h = Math.max(1, Math.round(el.height));
  const guid = elementIdToGuid(el.id);

  layer.imageData = {
    width: w,
    height: h,
    data: createSolidPixels(w, h, { r: 200, g: 200, b: 200, a: 255 }),
  };

  layer.placedLayer = {
    id: guid,
    type: 'raster',
    width: w,
    height: h,
    transform: [
      el.position.x,
      el.position.y,
      el.position.x + el.width,
      el.position.y,
      el.position.x + el.width,
      el.position.y + el.height,
      el.position.x,
      el.position.y + el.height,
    ],
  };

  exportState.pendingLinkedFiles.push({
    id: guid,
    name: el.name || 'image',
    data: imageBytes.bytes,
    type: imageBytes.mime,
  });
}

function applyPathContent(layer: Layer, el: BroadsetElement): void {
  if (!el.content) return;

  const pathMask = svgPathToPsdVectorMask(el.content, el.width, el.height);

  if (!pathMask) return;

  layer.vectorMask = { paths: [pathMask] };

  if (!pathMask.open) return;

  layer.vectorStroke = { fillEnabled: false, strokeEnabled: true };

  const borderColorCss = resolveStyleColor(el.style.borderColor, { resolveTheme: false });

  if (!borderColorCss) return;

  const strokeColor = parseHexColor(borderColorCss);

  if (strokeColor) {
    layer.vectorFill = { type: 'color', color: strokeColor };
  }
}

function applyShapeFill(layer: Layer, el: BroadsetElement): void {
  const backgroundColorCss = resolveStyleColor(el.style.backgroundColor, { resolveTheme: false });

  if (!backgroundColorCss) return;

  const color = parseHexColor(backgroundColorCss);

  if (!color) return;

  const w = Math.max(1, Math.round(el.width));
  const h = Math.max(1, Math.round(el.height));

  layer.imageData = {
    width: w,
    height: h,
    data: createSolidPixels(w, h, {
      r: color.r,
      g: color.g,
      b: color.b,
      a: Math.round(color.a * 255),
    }),
  };
}

function applyTypeContent(layer: Layer, el: BroadsetElement): void {
  switch (el.type) {
    case 'text':
      applyTextContent(layer, el);

      return;
    case 'image':
      applyImageContent(layer, el);

      return;
    case 'path':
      applyPathContent(layer, el);

      return;
    case 'rectangle':
    case 'ellipse':
      applyShapeFill(layer, el);

      return;
    default:
      return;
  }
}

export function elementToLayer(el: BroadsetElement): Layer {
  const layer: Layer = {
    name: el.name,
    left: Math.round(el.position.x),
    top: Math.round(el.position.y),
    right: Math.round(el.position.x + el.width),
    bottom: Math.round(el.position.y + el.height),
    opacity: el.style.opacity,
    hidden: false,
  };

  applyBlendMode(layer, el);
  applyVectorMasks(layer, el);
  applyBoxShadow(layer, el);
  applyFilterGlow(layer, el);
  applyTypeContent(layer, el);

  return layer;
}
