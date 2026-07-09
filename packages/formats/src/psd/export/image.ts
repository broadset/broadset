import type { BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { decodeDataUri } from '../data-uri';
import { elementIdToGuid, getPrefetchedUrlImages, pushPendingLinkedFile } from './state';

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

function resolvePreservedSmartObjectGuid(el: BroadsetElement): string | undefined {
  const psdExt = (el.extensions as { readonly psd?: { readonly smartObject?: { readonly guid?: unknown } } } | undefined)?.psd;
  const guid = psdExt?.smartObject?.guid;

  return typeof guid === 'string' && guid.length > 0 ? guid : undefined;
}

export function applyImageContent(layer: Layer, el: BroadsetElement): void {
  const contentText = resolveContentAsPlainString(el.content);

  if (!contentText) return;

  const decoded = decodeDataUri(contentText);
  const urlContent = getPrefetchedUrlImages().get(el.id);
  const imageBytes = decoded ?? urlContent;

  if (!imageBytes) return;

  const w = Math.max(1, Math.round(el.width));
  const h = Math.max(1, Math.round(el.height));
  // Preserve the round-trip GUID when the element carries a prior
  // linked-smart-object identity (P5.3c). A stable GUID keeps
  // Photoshop's "Update linked file" resolving after re-export.
  const guid = resolvePreservedSmartObjectGuid(el) ?? elementIdToGuid(el.id);

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

  pushPendingLinkedFile({
    id: guid,
    name: el.name || 'image',
    data: imageBytes.bytes,
    type: imageBytes.mime,
  });
}
