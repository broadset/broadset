import {
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFillToSvgPaint,
} from '@broadset/model';

import { createSimpleRenderer } from './_util/simple-renderer';
import { computeTrimPathAttributes } from './_util/trim-path';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DEFAULT_STROKE_COLOR = '#f8fafc';
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Path renderer. Emits an `<svg><path>` pair sized to the element box with
 * stroke, fill, fill-rule, line-cap/join, and trim-path attributes sourced
 * from the element style. Trim-path uses `stroke-dasharray` /
 * `stroke-dashoffset` under the hood, computed from the element's total
 * path length when trim values deviate from defaults.
 */
export const createPathRenderer = createSimpleRenderer((host, element) => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');

  svg.setAttribute('viewBox', `0 0 ${String(Math.max(element.width, 1))} ${String(Math.max(element.height, 1))}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.pointerEvents = 'auto';
  path.setAttribute('d', resolveContentAsPlainString(element.content));
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.setAttribute('stroke', resolveStyleColor(element.style.stroke, { resolveTheme: false }) ?? DEFAULT_STROKE_COLOR);
  path.setAttribute('stroke-width', String(element.style.strokeWidth ?? DEFAULT_STROKE_WIDTH));
  path.setAttribute('fill', resolveStyleFillToSvgPaint(element.style.fill, { resolveTheme: false }));
  path.style.pointerEvents = 'visiblePainted';

  if (element.style.strokeOpacity !== undefined) {
    path.setAttribute('stroke-opacity', String(element.style.strokeOpacity));
  }

  if (element.style.fillOpacity !== undefined) {
    path.setAttribute('fill-opacity', String(element.style.fillOpacity));
  }

  if (element.style.strokeLinecap !== undefined) {
    path.setAttribute('stroke-linecap', element.style.strokeLinecap);
  }

  if (element.style.strokeLinejoin !== undefined) {
    path.setAttribute('stroke-linejoin', element.style.strokeLinejoin);
  }

  if (element.style.fillRule !== undefined) {
    path.setAttribute('fill-rule', element.style.fillRule);
  }

  if (element.style.strokeDasharray !== undefined) {
    path.setAttribute('stroke-dasharray', element.style.strokeDasharray);
  }

  const trimStart = element.style.trimStart ?? 0;
  const trimEnd = element.style.trimEnd ?? 1;
  const trimOffset = element.style.trimOffset ?? 0;

  if (trimStart !== 0 || trimEnd !== 1 || trimOffset !== 0) {
    const totalLength = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
    const trimAttrs = computeTrimPathAttributes(totalLength, trimStart, trimEnd, trimOffset);

    if (trimAttrs !== null) {
      path.setAttribute('stroke-dasharray', trimAttrs.dasharray);
      path.setAttribute('stroke-dashoffset', trimAttrs.dashoffset);
    }
  }

  svg.appendChild(path);
  host.replaceChildren(svg);
});
