/**
 * @module psd-import
 * @description PSD import — recovers BroadsetDocument from PSD layers.
 */
import type { Layer, LinkedFile } from 'ag-psd';
import { readPsd } from 'ag-psd';

// ---------------------------------------------------------------------------
// Shared constants (duplicated from psd.ts to avoid circular dependency)
// ---------------------------------------------------------------------------

const PX_PER_MM = 72 / 25.4;

function pxToMm(px: number): number {
  return px / PX_PER_MM;
}

const CSS_TO_PSD_BLEND: Record<string, string> = {
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

const PSD_TO_CSS_BLEND: Record<string, string> = {};

for (const [css, psd] of Object.entries(CSS_TO_PSD_BLEND)) {
  if (psd) {
    PSD_TO_CSS_BLEND[psd] = css;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Imported element recovered from PSD. */
export interface ImportedPsdElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: {
    readonly opacity: number;
    readonly boxShadow?: string;
    readonly filter?: string;
    readonly mixBlendMode?: string;
    readonly backgroundColor?: string;
    readonly borderRadius?: number;
  };
}

/** Imported page from PSD. */
export interface ImportedPsdPage {
  readonly id: string;
  readonly elements: readonly ImportedPsdElement[];
}

/** Imported PSD document. */
export interface ImportedPsdDocument {
  readonly pages: readonly ImportedPsdPage[];
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Import elements from a PSD file.
 *
 * @param data - Uint8Array of the PSD file
 * @returns ImportedPsdDocument with recovered elements
 */
export function importPsd(data: Uint8Array): ImportedPsdDocument {
  const psd = readPsd(data.buffer as ArrayBuffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: false,
    useImageData: true,
  });

  const linkedFilesById = new Map<string, LinkedFile>();

  for (const lf of psd.linkedFiles ?? []) {
    linkedFilesById.set(lf.id, lf);
  }

  const children = psd.children ?? [];

  // Check for artboard layers
  const artboardLayers = children.filter((l) => l.artboard !== undefined);

  if (artboardLayers.length > 0) {
    const pages: ImportedPsdPage[] = artboardLayers.map((artboardLayer, idx) => {
      const artChildren = artboardLayer.children ?? [];
      const elements = artChildren.map((l) => recoverElement(l, linkedFilesById));

      return {
        id: artboardLayer.name ?? `page-${String(idx + 1)}`,
        elements,
      };
    });

    return {
      pages,
      width: pxToMm(psd.width),
      height: pxToMm(psd.height),
    };
  }

  // Single page
  const elements = children.map((l) => recoverElement(l, linkedFilesById));

  return {
    pages: [{ id: 'page-1', elements }],
    width: pxToMm(psd.width),
    height: pxToMm(psd.height),
  };
}

// ---------------------------------------------------------------------------
// Import — element recovery
// ---------------------------------------------------------------------------

function recoverElement(layer: Layer, linkedFiles: ReadonlyMap<string, LinkedFile>): ImportedPsdElement {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;

  const position = { x: pxToMm(left), y: pxToMm(top) };
  const width = pxToMm(right - left);
  const height = pxToMm(bottom - top);
  const rotation = 0;

  // Determine element type
  let type = 'rectangle';
  let content = '';

  if (layer.text) {
    type = 'text';
    content = layer.text.text;
  } else if (layer.placedLayer) {
    type = 'image';
    content = recoverSmartObjectContent(layer.placedLayer.id, linkedFiles);
  } else if (layer.vectorMask) {
    const pathsArr = layer.vectorMask.paths;
    const hasOpenPath = pathsArr.some((p) => p.open);

    if (hasOpenPath) {
      type = 'path';
    }
  }

  // Recover style properties
  const opacity = typeof layer.opacity === 'number' ? layer.opacity : 1;

  const boxShadow = recoverBoxShadow(layer);
  const filterVal = recoverFilter(layer);
  const bgColor = recoverBackgroundColor(layer);
  const radius = recoverBorderRadius(layer);
  const cssBlend = layer.blendMode ? PSD_TO_CSS_BLEND[layer.blendMode] : undefined;

  const style: ImportedPsdElement['style'] = {
    opacity,
    ...(boxShadow ? { boxShadow } : {}),
    ...(filterVal ? { filter: filterVal } : {}),
    ...(cssBlend ? { mixBlendMode: cssBlend } : {}),
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...(radius !== undefined ? { borderRadius: radius } : {}),
  };

  return { type, content, position, width, height, rotation, style };
}

function recoverSmartObjectContent(id: string, linkedFiles: ReadonlyMap<string, LinkedFile>): string {
  const lf = linkedFiles.get(id);

  if (!lf?.data) {
    return '';
  }

  // Encode bytes to base64 data URI
  const bytes = lf.data;
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  const base64 = btoa(binary);
  const ext = lf.name.split('.').pop() ?? 'png';

  return `data:image/${ext};base64,${base64}`;
}

function recoverBoxShadow(layer: Layer): string | undefined {
  const shadows = layer.effects?.dropShadow;

  if (!shadows || shadows.length === 0) {
    return undefined;
  }

  const s = shadows[0];

  if (!s?.enabled) {
    return undefined;
  }

  const distance = s.distance?.value ?? 0;
  const angle = s.angle ?? 120;
  const blur = s.size?.value ?? 0;
  const radians = (angle * Math.PI) / 180;
  const ox = Math.round(distance * Math.cos(radians));
  const oy = Math.round(-distance * Math.sin(radians));
  const color = s.color ?? { r: 0, g: 0, b: 0 };
  const a = typeof s.opacity === 'number' ? s.opacity / 255 : 1;
  const r = 'r' in color ? (color as { r: number }).r : 0;
  const g = 'g' in color ? (color as { g: number }).g : 0;
  const b = 'b' in color ? (color as { b: number }).b : 0;

  return `${String(ox)}px ${String(oy)}px ${String(Math.round(blur))}px rgba(${String(r)},${String(g)},${String(b)},${String(Math.round(a * 100) / 100)})`;
}

function recoverFilter(layer: Layer): string | undefined {
  const glow = layer.effects?.outerGlow;

  if (!glow?.enabled) {
    return undefined;
  }

  const blur = glow.size?.value ?? 0;
  const color = glow.color ?? { r: 0, g: 0, b: 0 };
  const a = typeof glow.opacity === 'number' ? glow.opacity / 255 : 1;
  const r = 'r' in color ? (color as { r: number }).r : 0;
  const g = 'g' in color ? (color as { g: number }).g : 0;
  const b = 'b' in color ? (color as { b: number }).b : 0;

  return `drop-shadow(0px 0px ${String(Math.round(blur))}px rgba(${String(r)},${String(g)},${String(b)},${String(Math.round(a * 100) / 100)}))`;
}

function recoverBackgroundColor(layer: Layer): string | undefined {
  const fill = layer.vectorFill;

  if (!fill || fill.type !== 'color') {
    return undefined;
  }

  const color = fill.color;
  const r = 'r' in color ? (color as { r: number }).r : 0;
  const g = 'g' in color ? (color as { g: number }).g : 0;
  const b = 'b' in color ? (color as { b: number }).b : 0;

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function recoverBorderRadius(layer: Layer): number | undefined {
  const origination = layer.vectorOrigination?.keyDescriptorList;

  if (!origination || origination.length === 0) {
    return undefined;
  }

  const desc = origination[0];
  const radii = desc?.keyOriginRRectRadii;

  if (!radii) {
    return undefined;
  }

  // Use top-left as representative radius, convert back to mm
  const radiusPx = radii.topLeft.value;

  return pxToMm(radiusPx);
}
