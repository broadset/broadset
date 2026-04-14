import type { BroadsetElement } from '@broadset/model';
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

  if (el.style.mixBlendMode) {
    const psdMode = BLEND_MODE_MAP[el.style.mixBlendMode];

    if (psdMode) {
      layer.blendMode = psdMode;
    }
  }

  if (el.style.borderRadius) {
    const [a, b, c, d] = el.style.borderRadius;
    const maskPath = buildRoundedRectMask(el.width, el.height, [a, b, c, d]);

    layer.vectorMask = { paths: [maskPath] };
  }

  if (el.style.customClipPath) {
    const polyMatch = el.style.customClipPath.match(/polygon\(([^)]+)\)/);

    if (polyMatch) {
      const clipPath = polygonToVectorMask(polyMatch[1] ?? '', el.width, el.height);

      if (clipPath) {
        const existing = layer.vectorMask?.paths ?? [];

        layer.vectorMask = {
          paths: [...existing, { ...clipPath, operation: 'intersect' }],
        };
      }
    }
  }

  if (el.style.boxShadow) {
    const shadow = parseBoxShadow(el.style.boxShadow);

    if (shadow) {
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
  }

  if (el.style.filter) {
    const glow = parseFilterGlow(el.style.filter);

    if (glow) {
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
  }

  switch (el.type) {
    case 'text': {
      const color = el.style.fontColor ? parseHexColor(el.style.fontColor) : undefined;

      layer.text = {
        text: el.content,
        style: color ? { fontSize: el.style.fontSize ?? 12, fillColor: color } : { fontSize: el.style.fontSize ?? 12 },
      };
      break;
    }

    case 'image':
      if (el.content) {
        const decoded = decodeDataUri(el.content);
        const urlContent = exportState.prefetchedUrlImages.get(el.id);
        const imageBytes = decoded ?? urlContent;

        if (imageBytes) {
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
      }

      break;

    case 'path':
      if (el.content) {
        const pathMask = svgPathToPsdVectorMask(el.content, el.width, el.height);

        if (pathMask) {
          const isOpen = pathMask.open;

          layer.vectorMask = { paths: [pathMask] };

          if (isOpen) {
            layer.vectorStroke = {
              fillEnabled: false,
              strokeEnabled: true,
            };

            if (el.style.borderColor) {
              const strokeColor = parseHexColor(el.style.borderColor);

              if (strokeColor) {
                layer.vectorFill = {
                  type: 'color',
                  color: strokeColor,
                };
              }
            }
          }
        }
      }

      break;

    case 'rectangle':
    case 'ellipse':
      if (el.style.backgroundColor) {
        const color = parseHexColor(el.style.backgroundColor);
        const w = Math.max(1, Math.round(el.width));
        const h = Math.max(1, Math.round(el.height));

        if (color) {
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
      }

      break;

    default:
      break;
  }

  return layer;
}
