/**
 * @module psd
 * @description PSD export/import for BroadsetDocument.
 *
 * Uses ag-psd for reading/writing Photoshop PSD files.
 * Exports element layers with vector masks, text layers, smart objects,
 * layer effects, blend modes, and artboard pages.
 */
import type { BroadsetDocument, PageElement } from '@broadset/model';
import type { BezierKnot, BezierPath, Layer, LayerEffectShadow, LayerEffectsOuterGlow, LinkedFile, Psd } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';

import { svgPathToPsdVectorMask } from './psd-path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PSD uses 72 DPI by default; 1mm ≈ 2.835 px at 72 DPI. */
const PX_PER_MM = 72 / 25.4;

/**
 * Generate a deterministic GUID from a numeric counter.
 * ag-psd requires placed layer IDs in GUID format.
 */
function generateGuid(n: number): string {
  const hex = n.toString(16).padStart(8, '0');

  return `${hex}-0000-0000-0000-000000000000`;
}

// ---------------------------------------------------------------------------
// CSS → PSD blend mode mapping
// ---------------------------------------------------------------------------

const CSS_TO_PSD_BLEND: Record<string, Layer['blendMode']> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function getStyleProp(el: PageElement, key: string): unknown {
  return el.style?.[key];
}

function getScreenProp(el: PageElement, key: string): unknown {
  return el.screen?.[key];
}

function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

/** Parse #rgb or #rrggbb to RGBA. */
function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  const c = hex.trim().replace(/^#/, '');

  let r = 0;
  let g = 0;
  let b = 0;

  if (c.length === 3) {
    r = parseInt(c.charAt(0) + c.charAt(0), 16);
    g = parseInt(c.charAt(1) + c.charAt(1), 16);
    b = parseInt(c.charAt(2) + c.charAt(2), 16);
  } else if (c.length >= 6) {
    r = parseInt(c.substring(0, 2), 16);
    g = parseInt(c.substring(2, 4), 16);
    b = parseInt(c.substring(4, 6), 16);
  }

  return { r, g, b, a: 1 };
}

/** Parse CSS rgba(r,g,b,a) or rgb(r,g,b). */
function parseRgbaColor(css: string): { r: number; g: number; b: number; a: number } | null {
  const rgbaMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(css);

  if (!rgbaMatch) {
    return null;
  }

  return {
    r: parseInt(rgbaMatch[1] ?? '0', 10),
    g: parseInt(rgbaMatch[2] ?? '0', 10),
    b: parseInt(rgbaMatch[3] ?? '0', 10),
    a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
  };
}

// Re-export for consumers
export { svgPathToPsdVectorMask } from './psd-path';

// ---------------------------------------------------------------------------
// CSS box-shadow parser
// ---------------------------------------------------------------------------

interface ParsedShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly color: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
}

function parseBoxShadow(css: string): ParsedShadow | null {
  // Match: <offsetX>px <offsetY>px <blur>px <color>
  const match =
    /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/.exec(css);

  if (!match) {
    return null;
  }

  const offsetX = parseFloat(match[1] ?? '0');
  const offsetY = parseFloat(match[2] ?? '0');
  const blur = parseFloat(match[3] ?? '0');
  const colorStr = match[4] ?? '#000000';

  const color =
    colorStr.startsWith('#') ? parseHexColor(colorStr) : (parseRgbaColor(colorStr) ?? { r: 0, g: 0, b: 0, a: 1 });

  return { offsetX, offsetY, blur, color };
}

/** Parse CSS filter: drop-shadow() for outer glow fallback. */
function parseFilterDropShadow(css: string): ParsedShadow | null {
  const match =
    /drop-shadow\(\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})\s*\)/.exec(
      css,
    );

  if (!match) {
    return null;
  }

  return {
    offsetX: parseFloat(match[1] ?? '0'),
    offsetY: parseFloat(match[2] ?? '0'),
    blur: parseFloat(match[3] ?? '0'),
    color:
      (match[4] ?? '').startsWith('#') ?
        parseHexColor(match[4] ?? '#000000')
      : (parseRgbaColor(match[4] ?? '') ?? { r: 0, g: 0, b: 0, a: 1 }),
  };
}

// ---------------------------------------------------------------------------
// Clip-path parsing helpers
// ---------------------------------------------------------------------------

/** Parse polygon() clip-path to knots. */
function parsePolygonClipPath(clip: string, width: number, height: number): BezierKnot[] | null {
  const match = /polygon\(([^)]+)\)/.exec(clip);

  if (!match) {
    return null;
  }

  const pointsStr = match[1] ?? '';
  const pairs = pointsStr.split(',').map((p) => p.trim());
  const knots: BezierKnot[] = [];

  for (const pair of pairs) {
    const parts = pair.split(/\s+/);
    const xStr = parts[0] ?? '0';
    const yStr = parts[1] ?? '0';

    let x: number;
    let y: number;

    if (xStr.endsWith('%')) {
      x = (parseFloat(xStr) / 100) * width;
    } else {
      x = parseFloat(xStr);
    }

    if (yStr.endsWith('%')) {
      y = (parseFloat(yStr) / 100) * height;
    } else {
      y = parseFloat(yStr);
    }

    const nx = x / width;
    const ny = y / height;

    knots.push({
      linked: true,
      points: [ny, nx, ny, nx, ny, nx],
    });
  }

  return knots.length > 0 ? knots : null;
}

/** Parse path() clip-path to BezierPath via svgPathToPsdVectorMask. */
function parsePathClipPath(clip: string, width: number, height: number): BezierPath | null {
  const pathMatch = /path\(\s*(?:["']([^"']*)["']|([^)]+))\s*\)/.exec(clip);

  if (!pathMatch) {
    return null;
  }

  const d = (pathMatch[1] ?? pathMatch[2] ?? '').trim();

  return svgPathToPsdVectorMask(d, width, height);
}

// ---------------------------------------------------------------------------
// Build layer for element
// ---------------------------------------------------------------------------

function buildLayer(
  el: PageElement,
  docWidth: number,
  docHeight: number,
  linkedFiles: LinkedFile[],
  linkedFileCounter: { value: number },
): Layer {
  const left = mmToPx(el.position.x);
  const top = mmToPx(el.position.y);
  const right = left + mmToPx(el.width);
  const bottom = top + mmToPx(el.height);

  const layer: Layer = {
    name: el.id,
    left,
    top,
    right,
    bottom,
  };

  // --- Opacity ---
  const opacity = getStyleProp(el, 'opacity');

  if (typeof opacity === 'number') {
    layer.opacity = opacity;
  }

  // --- Blend mode ---
  const blendMode = getStyleProp(el, 'mixBlendMode');

  if (typeof blendMode === 'string' && blendMode in CSS_TO_PSD_BLEND) {
    const psdBlend = CSS_TO_PSD_BLEND[blendMode];

    if (psdBlend) {
      layer.blendMode = psdBlend;
    }
  }

  // --- Layer effects ---
  const boxShadow = getStyleProp(el, 'boxShadow');
  const filterStr = getStyleProp(el, 'filter');

  if (typeof boxShadow === 'string' || typeof filterStr === 'string') {
    const effects: Layer['effects'] = {};

    if (typeof boxShadow === 'string') {
      const shadow = parseBoxShadow(boxShadow);

      if (shadow) {
        const psdShadow: LayerEffectShadow = {
          present: true,
          enabled: true,
          color: shadow.color,
          opacity: Math.round(shadow.color.a * 255),
          distance: { units: 'Pixels', value: Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2) },
          angle: Math.round((Math.atan2(-shadow.offsetY, shadow.offsetX) * 180) / Math.PI),
          size: { units: 'Pixels', value: shadow.blur },
          blendMode: 'multiply',
        };

        effects.dropShadow = [psdShadow];
      }
    }

    if (typeof filterStr === 'string') {
      const glow = parseFilterDropShadow(filterStr);

      if (glow) {
        const outerGlow: LayerEffectsOuterGlow = {
          present: true,
          enabled: true,
          color: glow.color,
          opacity: Math.round(glow.color.a * 255),
          size: { units: 'Pixels', value: glow.blur },
          blendMode: 'screen',
        };

        effects.outerGlow = outerGlow;
      }
    }

    layer.effects = effects;
  }

  // --- Vector mask & fill for rectangle ---
  if (el.type === 'rectangle') {
    buildRectLayer(el, layer, docWidth, docHeight);
  }

  // --- Text layer ---
  if (el.type === 'text') {
    layer.text = {
      text: el.content,
      transform: [1, 0, 0, 1, left, top],
    };
  }

  // --- Image → smart object ---
  if (el.type === 'image') {
    buildImageLayer(el, layer, linkedFiles, linkedFileCounter);
  }

  // --- Path layer ---
  if (el.type === 'path') {
    buildPathLayer(el, layer);
  }

  // --- Clip-path (for all element types) ---
  const customClip = getScreenProp(el, 'customClipPath');

  if (typeof customClip === 'string' && customClip.length > 0) {
    addClipPathToLayer(el, layer, customClip);
  }

  return layer;
}

// ---------------------------------------------------------------------------
// Rectangle layer builder
// ---------------------------------------------------------------------------

function buildRectLayer(el: PageElement, layer: Layer, _docWidth: number, _docHeight: number): void {
  const bgColor = getStyleProp(el, 'backgroundColor');

  if (typeof bgColor === 'string') {
    const rgba = bgColor.startsWith('#') ? parseHexColor(bgColor) : parseRgbaColor(bgColor);

    if (rgba) {
      layer.vectorFill = {
        type: 'color',
        color: { r: rgba.r, g: rgba.g, b: rgba.b },
      };
    }
  }

  // Build rect vector mask
  const w = mmToPx(el.width);
  const h = mmToPx(el.height);
  const borderRadius = getStyleProp(el, 'borderRadius');
  const paths: BezierPath[] = [];

  if (typeof borderRadius === 'number' && borderRadius > 0) {
    // Rounded rectangle — use vector origination to store radii info
    const rectPath = buildRectBezierPath(w, h);

    paths.push(rectPath);

    const radiusPx = mmToPx(borderRadius);

    layer.vectorOrigination = {
      keyDescriptorList: [
        {
          keyOriginType: 1, // rounded rectangle
          keyOriginRRectRadii: {
            topRight: { units: 'Pixels', value: radiusPx },
            topLeft: { units: 'Pixels', value: radiusPx },
            bottomLeft: { units: 'Pixels', value: radiusPx },
            bottomRight: { units: 'Pixels', value: radiusPx },
          },
          keyOriginShapeBoundingBox: {
            top: { units: 'Pixels', value: 0 },
            left: { units: 'Pixels', value: 0 },
            bottom: { units: 'Pixels', value: h },
            right: { units: 'Pixels', value: w },
          },
        },
      ],
    };
  } else {
    const rectPath = buildRectBezierPath(w, h);

    paths.push(rectPath);
  }

  layer.vectorMask = { paths };
}

/** Build a simple rectangular BezierPath for a rect of w×h pixels. */
function buildRectBezierPath(w: number, h: number): BezierPath {
  // Normalize to [0, 1] range within the layer's bounds
  // PSD coordinates for vector masks are absolute fractions of document size,
  // but within the layer scope, we express them relative to the layer.
  // Note: ag-psd handles the coordinate system — we provide absolute pixel coords.
  return {
    open: false,
    operation: 'combine',
    knots: [
      { linked: true, points: [0, 0, 0, 0, 0, 0] },
      { linked: true, points: [0, w, 0, w, 0, w] },
      { linked: true, points: [h, w, h, w, h, w] },
      { linked: true, points: [h, 0, h, 0, h, 0] },
    ],
    fillRule: 'even-odd',
  };
}

// ---------------------------------------------------------------------------
// Image (smart object) layer builder
// ---------------------------------------------------------------------------

function buildImageLayer(el: PageElement, layer: Layer, linkedFiles: LinkedFile[], counter: { value: number }): void {
  const base64Match = /^data:image\/([^;]+);base64,(.+)$/s.exec(el.content);

  if (!base64Match) {
    return;
  }

  const fileId = generateGuid(counter.value);

  counter.value += 1;

  const b64 = base64Match[2] ?? '';
  const ext = base64Match[1] ?? 'png';

  // Decode base64 to Uint8Array
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const linkedFile: LinkedFile = {
    id: fileId,
    name: `${el.id}.${ext}`,
    data: bytes,
  };

  linkedFiles.push(linkedFile);

  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;

  layer.placedLayer = {
    id: fileId,
    type: 'raster',
    transform: [left, top, right, top, right, bottom, left, bottom],
    width: right - left,
    height: bottom - top,
  };
}

// ---------------------------------------------------------------------------
// Path layer builder
// ---------------------------------------------------------------------------

function buildPathLayer(el: PageElement, layer: Layer): void {
  const pathData = el.content;
  const bezierPath = svgPathToPsdVectorMask(pathData, el.width, el.height);

  if (!bezierPath) {
    return;
  }

  layer.vectorMask = {
    paths: [bezierPath],
  };

  // Stroke-only for open paths
  if (bezierPath.open) {
    layer.vectorStroke = {
      strokeEnabled: true,
      fillEnabled: false,
      lineWidth: { units: 'Pixels', value: 1 },
    };
  }
}

// ---------------------------------------------------------------------------
// Clip-path addition
// ---------------------------------------------------------------------------

function addClipPathToLayer(el: PageElement, layer: Layer, clipStr: string): void {
  const w = el.width;
  const h = el.height;

  // Try polygon()
  const polygonKnots = parsePolygonClipPath(clipStr, w, h);

  if (polygonKnots) {
    const clipPath: BezierPath = {
      open: false,
      operation: 'intersect',
      knots: polygonKnots,
      fillRule: 'even-odd',
    };

    if (layer.vectorMask) {
      layer.vectorMask.paths.push(clipPath);
    } else {
      layer.vectorMask = { paths: [clipPath] };
    }

    return;
  }

  // Try path()
  const pathResult = parsePathClipPath(clipStr, w, h);

  if (pathResult) {
    const clipPath: BezierPath = {
      ...pathResult,
      operation: 'intersect',
    };

    if (layer.vectorMask) {
      layer.vectorMask.paths.push(clipPath);
    } else {
      layer.vectorMask = { paths: [clipPath] };
    }
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export a BroadsetDocument to PSD format (Uint8Array).
 *
 * @param doc - The document to export
 * @returns Uint8Array of the PSD file
 */
export function exportPsd(doc: BroadsetDocument): Uint8Array {
  const docW = mmToPx(doc.canvas.width);
  const docH = mmToPx(doc.canvas.height);

  const linkedFiles: LinkedFile[] = [];
  const linkedFileCounter = { value: 1 };
  const hasMultiplePages = doc.pages.length > 1;

  const children: Layer[] = [];

  for (const page of doc.pages) {
    const pageLayers: Layer[] = [];

    for (const el of page.elements) {
      const layer = buildLayer(el, docW, docH, linkedFiles, linkedFileCounter);

      pageLayers.push(layer);
    }

    if (hasMultiplePages) {
      // Wrap in artboard group
      const artboardLayer: Layer = {
        name: page.id,
        children: pageLayers,
        opened: true,
        artboard: {
          rect: { top: 0, left: 0, bottom: docH, right: docW },
        },
      };

      children.push(artboardLayer);
    } else {
      children.push(...pageLayers);
    }
  }

  const psd: Psd = {
    width: docW,
    height: docH,
    children,
  };

  if (linkedFiles.length > 0) {
    psd.linkedFiles = linkedFiles;
  }

  if (hasMultiplePages) {
    psd.artboards = {
      count: doc.pages.length,
    };
  }

  return writePsdUint8Array(psd, {
    generateThumbnail: false,
    trimImageData: false,
  });
}

// ---------------------------------------------------------------------------
// Re-exports from psd-import
// ---------------------------------------------------------------------------

export type { ImportedPsdDocument, ImportedPsdElement, ImportedPsdPage } from './psd-import';
export { importPsd } from './psd-import';
