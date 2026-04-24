import {
  type BroadsetElement,
  getSolidFillColor,
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFilter,
  type TextBody,
} from '@broadset/model';
import type { Layer, TextStyle, TextStyleRun } from 'ag-psd';

import { parseHexColor } from './color-utils';
import { BLEND_MODE_MAP } from './constants';
import { decodeDataUri } from './data-uri';
import { parseBoxShadow, parseFilterGlow } from './effects';
import {
  buildEllipseMask,
  buildRectangleMask,
  buildRoundedRectMask,
  polygonToVectorMask,
  svgPathToPsdVectorMask,
} from './vector-mask';

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

/**
 * Returns the 4 corners of an axis-aligned rectangle rotated by
 * `rotationDeg` degrees around its centre. Format: `[tlx, tly, trx,
 * try, brx, bry, blx, bly]` — the 8-number shape PSD `placedLayer`
 * transforms use.
 */
function rotatedQuad(
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDeg: number,
): [number, number, number, number, number, number, number, number] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotate = (px: number, py: number): [number, number] => {
    const dx = px - cx;
    const dy = py - cy;

    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  };

  const [tlx, tly] = rotate(x, y);
  const [trx, try_] = rotate(x + width, y);
  const [brx, bry] = rotate(x + width, y + height);
  const [blx, bly] = rotate(x, y + height);

  return [tlx, tly, trx, try_, brx, bry, blx, bly];
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
  const filterCss = resolveStyleFilter(el.style.filter, { resolveTheme: false });

  if (!filterCss) return;

  const glow = parseFilterGlow(filterCss);

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

export function isTextBody(value: unknown): value is TextBody {
  if (typeof value !== 'object' || value === null) return false;

  const maybeBody = value as { readonly paragraphs?: unknown };

  return Array.isArray(maybeBody.paragraphs);
}

export interface ComposedText {
  readonly text: string;
  readonly styleRuns: readonly TextStyleRun[];
}

/**
 * Canonical PSD paragraph separator. Photoshop reads `\r` as a hard
 * line break inside a text layer's composed string.
 */
const PSD_PARAGRAPH_SEPARATOR = '\r';

function styleFromRunOverrides(
  overrides: Readonly<Record<string, unknown>> | undefined,
  fallback: TextStyle,
): TextStyle {
  const style: TextStyle = { ...fallback };

  if (overrides === undefined) return style;

  const fontSize = overrides['fontSize'];

  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    style.fontSize = fontSize;
  }

  const fontColor = overrides['fontColor'];

  if (typeof fontColor === 'string') {
    const color = parseHexColor(fontColor);

    if (color !== undefined) style.fillColor = color;
  }

  const decoration = overrides['textDecoration'];

  if (decoration === 'underline') style.underline = true;
  if (decoration === 'line-through') style.strikethrough = true;

  const letterSpacing = overrides['letterSpacing'];

  if (typeof letterSpacing === 'number' && Number.isFinite(letterSpacing)) {
    style.tracking = letterSpacing;
  }

  return style;
}

export function composeTextFromBody(body: TextBody, fallback: TextStyle): ComposedText {
  const parts: string[] = [];
  const runs: TextStyleRun[] = [];

  body.paragraphs.forEach((para, index) => {
    if (index > 0) {
      parts.push(PSD_PARAGRAPH_SEPARATOR);
      runs.push({ length: PSD_PARAGRAPH_SEPARATOR.length, style: { ...fallback } });
    }

    for (const r of para.runs) {
      if (r.text.length === 0) continue;
      parts.push(r.text);
      runs.push({
        length: r.text.length,
        style: styleFromRunOverrides(r.props?.style, fallback),
      });
    }
  });

  return { text: parts.join(''), styleRuns: runs };
}

function applyTextContent(layer: Layer, el: BroadsetElement): void {
  const fontSize = el.style.fontSize ?? 12;
  const fontColorCss = resolveStyleColor(el.style.fontColor, { resolveTheme: false });
  const color = fontColorCss ? parseHexColor(fontColorCss) : undefined;
  const fallbackStyle: TextStyle = color ? { fontSize, fillColor: color } : { fontSize };

  if (isTextBody(el.content)) {
    const composed = composeTextFromBody(el.content, fallbackStyle);

    layer.text = {
      text: composed.text,
      style: fallbackStyle,
      styleRuns: [...composed.styleRuns],
    };

    return;
  }

  const plainText = resolveContentAsPlainString(el.content);

  layer.text = {
    text: plainText,
    style: fallbackStyle,
    styleRuns: [{ length: plainText.length, style: { ...fallbackStyle } }],
  };
}

function applyImageContent(layer: Layer, el: BroadsetElement): void {
  const contentText = resolveContentAsPlainString(el.content);

  if (!contentText) return;

  const decoded = decodeDataUri(contentText);
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
    transform: rotatedQuad(el.position.x, el.position.y, el.width, el.height, el.rotation),
  };

  exportState.pendingLinkedFiles.push({
    id: guid,
    name: el.name || 'image',
    data: imageBytes.bytes,
    type: imageBytes.mime,
  });
}

function applyPathContent(layer: Layer, el: BroadsetElement): void {
  const contentText = resolveContentAsPlainString(el.content);

  if (!contentText) return;

  const pathMask = svgPathToPsdVectorMask(contentText, el.width, el.height);

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
  const backgroundColorCss = resolveStyleColor(getSolidFillColor(el.style.fill), { resolveTheme: false });

  if (!backgroundColorCss) return;

  const color = parseHexColor(backgroundColorCss);

  if (!color) return;

  // Native vector shape layer: `vectorFill` carries the solid color,
  // `vectorMask` carries the shape geometry. Photoshop reads both as
  // a first-class editable shape. Per P5.3a (PSD plan) do NOT emit
  // `imageData` — a rasterized shape is not round-trip-editable.
  layer.vectorFill = { type: 'color', color };

  // Stroke styling survives the fill — applyStroke may add vectorStroke
  // separately below.
  if (el.type === 'rectangle' && el.style.borderRadius === undefined) {
    layer.vectorMask = { paths: [buildRectangleMask(el.width, el.height)] };
  } else if (el.type === 'ellipse') {
    layer.vectorMask = { paths: [buildEllipseMask(el.width, el.height)] };
  }
  // Rounded rectangles flow through `applyVectorMasks` above, which
  // already emits the rounded-rect path via `buildRoundedRectMask`.

  // Avoid emitting a stale `imageData` — ensure shape layers stay vector.
  delete layer.imageData;
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
