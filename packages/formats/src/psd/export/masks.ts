import type { BroadsetElement } from '@broadset/model';
import type { Layer } from 'ag-psd';

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
