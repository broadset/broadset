import type { BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString, resolveStyleColor } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { parseHexColor } from '../color-utils';
import { svgPathToPsdVectorMask } from '../vector-mask';

export function applyPathContent(layer: Layer, el: BroadsetElement): void {
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
