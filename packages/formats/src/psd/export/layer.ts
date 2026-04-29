import type { BroadsetElement } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { BLEND_MODE_MAP } from '../constants';
import { applyRotationToVectorMask } from '../rotate-vector-mask';
import { applyBoxShadow, applyFilterGlow, applyStrokeLayerEffect } from './effects';
import { applyImageContent } from './image';
import { applyBitmapMask, applyVectorMasks } from './masks';
import { applyPathContent } from './path';
import { applyShapeFill } from './shape';
import { applyTextContent } from './text';

function applyBlendMode(layer: Layer, el: BroadsetElement): void {
  if (!el.style.mixBlendMode) return;

  const psdMode = BLEND_MODE_MAP[el.style.mixBlendMode];

  if (psdMode) {
    layer.blendMode = psdMode;
  }
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

function ensureLayerChannelBounds(layer: Layer): void {
  if (layer.imageData !== undefined) return;

  const width = Math.max(1, Math.round((layer.right ?? 0) - (layer.left ?? 0)));
  const height = Math.max(1, Math.round((layer.bottom ?? 0) - (layer.top ?? 0)));

  layer.imageData = { width, height, data: new Uint8ClampedArray(width * height * 4) };
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
  applyBitmapMask(layer, el);
  applyBoxShadow(layer, el);
  applyFilterGlow(layer, el);
  applyStrokeLayerEffect(layer, el);
  applyTypeContent(layer, el);

  // Image rotation is composed into placedLayer.transform inside
  // applyImageContent. For non-image (text, rectangle, ellipse, path)
  // layers we expand the AABB and rotate the vector-mask knots so
  // Photoshop reads back a rotated shape.
  if (el.type !== 'image') {
    applyRotationToVectorMask(layer, el.rotation);
  }

  ensureLayerChannelBounds(layer);

  return layer;
}
