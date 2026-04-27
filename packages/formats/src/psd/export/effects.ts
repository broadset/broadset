import type { BroadsetElement } from '@broadset/model';
import { resolveStyleColor, resolveStyleFilter } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { parseHexColor } from '../color-utils';
import { parseBoxShadow, parseFilterGlow } from '../effects';

export function applyBoxShadow(layer: Layer, el: BroadsetElement): void {
  if (!el.style.boxShadow) return;

  const shadow = parseBoxShadow(el.style.boxShadow);

  if (!shadow) return;

  const shadowEffect = {
    present: true,
    enabled: true,
    color: { r: shadow.color.r, g: shadow.color.g, b: shadow.color.b },
    opacity: shadow.color.a,
    angle: Math.round(Math.atan2(shadow.offsetY, shadow.offsetX) * (180 / Math.PI)),
    distance: { units: 'Pixels' as const, value: Math.sqrt(shadow.offsetX ** 2 + shadow.offsetY ** 2) },
    size: { units: 'Pixels' as const, value: shadow.blur },
    ...(shadow.spread ? { choke: { units: 'Pixels' as const, value: shadow.spread } } : undefined),
  };

  if (shadow.inset) {
    // CSS `box-shadow: inset …` → PSD innerShadow layer effect
    // (IO-D-18: every effect round-trips natively where possible).
    layer.effects = { ...layer.effects, innerShadow: [shadowEffect] };

    return;
  }

  layer.effects = { ...layer.effects, dropShadow: [shadowEffect] };
}

export function applyStrokeLayerEffect(layer: Layer, el: BroadsetElement): void {
  const borderWidth = el.style.borderWidth;

  if (borderWidth === undefined || borderWidth <= 0) return;

  const borderColorCss = resolveStyleColor(el.style.borderColor, { resolveTheme: false });

  if (borderColorCss === undefined) return;

  const color = parseHexColor(borderColorCss);

  if (color === undefined) return;

  layer.effects = {
    ...layer.effects,
    stroke: [
      {
        present: true,
        enabled: true,
        size: { units: 'Pixels', value: borderWidth },
        fillType: 'color',
        color: { r: color.r, g: color.g, b: color.b },
        opacity: color.a,
        position: 'outside',
      },
    ],
  };
}

export function applyFilterGlow(layer: Layer, el: BroadsetElement): void {
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
