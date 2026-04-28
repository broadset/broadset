import type { BroadsetElement } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { decodeBitmapMaskToLayerMask } from '../bitmap-mask';
import type { PsdBitmapMask } from '../types';
import { buildRoundedRectMask, polygonToVectorMask } from '../vector-mask';

export function applyVectorMasks(layer: Layer, el: BroadsetElement): void {
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

/**
 * Re-emit a preserved bitmap (alpha-channel) layer mask back onto the
 * ag-psd layer. The blob lives at `element.extensions.psd.bitmapMask`
 * after a prior PSD import (see `bitmap-mask.ts`). When the schema
 * key is absent or the decoded buffer length does not match the
 * declared dimensions, we leave `layer.mask` unset rather than emit a
 * partial mask — ag-psd would otherwise write a corrupt channel.
 */
export function applyBitmapMask(layer: Layer, el: BroadsetElement): void {
  const psdExt = (el.extensions as { readonly psd?: { readonly bitmapMask?: PsdBitmapMask } } | undefined)?.psd;
  const blob = psdExt?.bitmapMask;

  if (blob === undefined) return;

  const decoded = decodeBitmapMaskToLayerMask(blob);

  if (decoded === undefined) return;

  layer.mask = decoded;
}
