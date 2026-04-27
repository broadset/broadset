import type { BroadsetElement } from '@broadset/model';
import { getSolidFillColor, resolveStyleColor } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { parseHexColor } from '../color-utils';
import { buildEllipseMask, buildRectangleMask } from '../vector-mask';

export function applyShapeFill(layer: Layer, el: BroadsetElement): void {
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
