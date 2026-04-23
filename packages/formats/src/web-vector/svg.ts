import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetGradient,
  colorToCss,
  getGradientFillGradient,
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFillToSvgPaint,
} from '@broadset/model';

import { generateQrSvgFragment } from '../interchange';
import { escapeXml } from './shared';

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';

/* ------------------------------------------------------------------ */
/*  Gradient Defs                                                     */
/* ------------------------------------------------------------------ */

function renderGradientDef(elementId: string, gradient: BroadsetGradient): { id: string; def: string } | null {
  const gradId = `grad-${elementId}`;
  const stops = gradient.stops
    .map((s) => `<stop offset="${String(s.position * 100)}%" stop-color="${escapeXml(colorToCss(s.color))}"/>`)
    .join('');

  if (gradient.type === 'linear') {
    const angle = gradient.angle ?? 0;
    const rad = (angle * Math.PI) / 180;
    const x2 = Math.round((Math.cos(rad) * 0.5 + 0.5) * 100) / 100;
    const y2 = Math.round((Math.sin(rad) * 0.5 + 0.5) * 100) / 100;
    const x1 = 1 - x2;
    const y1 = 1 - y2;

    return {
      id: gradId,
      def: `<linearGradient id="${gradId}" x1="${String(x1)}" y1="${String(y1)}" x2="${String(x2)}" y2="${String(y2)}">${stops}</linearGradient>`,
    };
  }

  if (gradient.type === 'radial') {
    const cx = (gradient.center?.[0] ?? 50) / 100;
    const cy = (gradient.center?.[1] ?? 50) / 100;

    return {
      id: gradId,
      def: `<radialGradient id="${gradId}" cx="${String(cx)}" cy="${String(cy)}" r="0.5">${stops}</radialGradient>`,
    };
  }

  // Conic gradients have no SVG equivalent — skip
  return null;
}

/* ------------------------------------------------------------------ */
/*  Box-Shadow → SVG Filter Approximation                            */
/* ------------------------------------------------------------------ */

function renderShadowFilter(elementId: string, shadow: string): { id: string; def: string } | null {
  // Parse simple box-shadow: <x>px <y>px <blur>px <color>
  const match = /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(.+)$/.exec(shadow.trim());

  if (match === null) {
    return null;
  }

  const filterId = `shadow-${elementId}`;
  const dx = match[1];
  const dy = match[2];
  const blur = match[3];
  const color = match[4];

  if (dx === undefined || dy === undefined || blur === undefined || color === undefined) {
    return null;
  }

  return {
    id: filterId,
    def: `<filter id="${filterId}"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${String(Number(blur) / 2)}" flood-color="${escapeXml(color.trim())}"/></filter>`,
  };
}

/* ------------------------------------------------------------------ */
/*  Object-Fit → preserveAspectRatio Mapping                         */
/* ------------------------------------------------------------------ */

function objectFitToPreserveAspectRatio(objectFit: string | undefined): string {
  switch (objectFit) {
    case 'contain':
      return 'xMidYMid meet';
    case 'cover':
      return 'xMidYMid slice';
    case 'fill':
      return 'none';
    case 'none':
      return 'xMidYMid meet';
    case 'scale-down':
      return 'xMidYMid meet';
    default:
      return 'xMidYMid slice'; // default to cover
  }
}

function buildTransform(el: BroadsetElement): string {
  const parts: string[] = [];

  if (el.position.x !== 0 || el.position.y !== 0) {
    parts.push(`translate(${String(el.position.x)},${String(el.position.y)})`);
  }

  if (el.rotation !== 0) {
    parts.push(`rotate(${String(el.rotation)},${String(el.width / 2)},${String(el.height / 2)})`);
  }

  return parts.length > 0 ? ` transform="${parts.join(' ')}"` : '';
}

function buildStyleAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  // Only emit solid fill colors directly. Gradient fills are emitted via
  // <defs> references elsewhere; pattern / picture fills require asset-
  // registry plumbing that lands in Phase 4, so they are intentionally
  // left to the caller's <defs> path — emitting a broken `url(#…)` here
  // would hide the missing implementation behind an invalid SVG.
  if (style.fill.kind === 'solid') {
    const fillCss = resolveStyleFillToSvgPaint(style.fill, { resolveTheme: false });

    attrs.push(`fill="${escapeXml(fillCss)}"`);
  }

  const strokeCss = resolveStyleColor(style.stroke, { resolveTheme: false });

  if (strokeCss !== undefined) {
    attrs.push(`stroke="${escapeXml(strokeCss)}"`);
  }

  if (style.strokeWidth !== undefined) {
    attrs.push(`stroke-width="${String(style.strokeWidth)}"`);
  }

  if (style.fillOpacity !== undefined) {
    attrs.push(`fill-opacity="${String(style.fillOpacity)}"`);
  }

  if (style.strokeOpacity !== undefined) {
    attrs.push(`stroke-opacity="${String(style.strokeOpacity)}"`);
  }

  if (style.opacity !== 1) {
    attrs.push(`opacity="${String(style.opacity)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function renderClipPathDef(elementId: string, clipPath: string): string {
  const clipId = `clip-${elementId}`;

  return `<clipPath id="${clipId}"><path d="${escapeXml(clipPath)}"/></clipPath>`;
}

function textAnchorForAlignment(alignment: string): string {
  if (alignment === 'left') return 'start';
  if (alignment === 'right') return 'end';

  return 'middle';
}

function buildTextAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  if (style.fontFamily) {
    attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  }

  if (style.fontSize) {
    attrs.push(`font-size="${String(style.fontSize)}"`);
  }

  const fontColorCss = resolveStyleColor(style.fontColor, { resolveTheme: false });

  if (fontColorCss !== undefined) {
    attrs.push(`fill="${escapeXml(fontColorCss)}"`);
  }

  if (style.fontWeight && style.fontWeight !== 400) {
    attrs.push(`font-weight="${String(style.fontWeight)}"`);
  }

  if (style.fontStyle) {
    attrs.push(`font-style="${escapeXml(style.fontStyle)}"`);
  }

  if (style.textAlignment) {
    attrs.push(`text-anchor="${textAnchorForAlignment(style.textAlignment)}"`);
  }

  if (style.textDecoration) {
    attrs.push(`text-decoration="${escapeXml(style.textDecoration)}"`);
  }

  if (style.letterSpacing !== undefined) {
    attrs.push(`letter-spacing="${String(style.letterSpacing)}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function renderSvgPayload(el: BroadsetElement, transform: string): string {
  const content = resolveContentAsPlainString(el.content);

  if (!content) {
    return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }

  const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(content);
  const inner = innerMatch?.[1] ?? content;

  return `<g id="${escapeXml(el.id)}"${transform}>${inner}</g>`;
}

function renderElement(el: BroadsetElement, defs: string[]): string {
  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  let clipAttr = '';
  let fillOverride = '';
  let filterAttr = '';

  if (el.style.customClipPath) {
    const clipId = `clip-${el.id}`;

    defs.push(renderClipPathDef(el.id, el.style.customClipPath));
    clipAttr = ` clip-path="url(#${clipId})"`;
  }

  // Gradient fill
  const gradientFill = getGradientFillGradient(el.style.fill);

  if (gradientFill !== undefined) {
    const grad = renderGradientDef(el.id, gradientFill);

    if (grad !== null) {
      defs.push(grad.def);
      fillOverride = ` fill="url(#${grad.id})"`;
    }
  }

  // Box-shadow filter
  if (el.style.boxShadow) {
    const shadow = renderShadowFilter(el.id, el.style.boxShadow);

    if (shadow !== null) {
      defs.push(shadow.def);
      filterAttr = ` filter="url(#${shadow.id})"`;
    }
  }

  const extras = clipAttr + filterAttr;

  switch (el.type) {
    case 'path':
      return `<path id="${escapeXml(el.id)}" d="${escapeXml(resolveContentAsPlainString(el.content))}"${styleAttrs}${fillOverride}${transform}${extras}/>`;

    case 'rectangle':
      return `<rect id="${escapeXml(el.id)}" width="${String(el.width)}" height="${String(el.height)}"${styleAttrs}${fillOverride}${transform}${extras}/>`;

    case 'ellipse':
      return `<ellipse id="${escapeXml(el.id)}" cx="${String(el.width / 2)}" cy="${String(el.height / 2)}" rx="${String(el.width / 2)}" ry="${String(el.height / 2)}"${styleAttrs}${fillOverride}${transform}${extras}/>`;

    case 'text':
      return `<text id="${escapeXml(el.id)}"${buildTextAttrs(el.style)}${transform}${extras}>${escapeXml(resolveContentAsPlainString(el.content))}</text>`;

    case 'image': {
      const par = objectFitToPreserveAspectRatio(el.style.objectFit);

      return `<image id="${escapeXml(el.id)}" href="${escapeXml(resolveContentAsPlainString(el.content))}" width="${String(el.width)}" height="${String(el.height)}" preserveAspectRatio="${par}"${transform}${extras}/>`;
    }

    case 'svg':
      return renderSvgPayload(el, transform + styleAttrs + extras);

    case 'qrcode': {
      const qrSvg = generateQrSvgFragment(resolveContentAsPlainString(el.content));

      if (qrSvg === null) {
        return `<g id="${escapeXml(el.id)}"${transform}/>`;
      }

      // Extract SVG inner content from the fragment
      const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(qrSvg);
      const inner = innerMatch?.[1] ?? qrSvg;

      return `<g id="${escapeXml(el.id)}"${transform}>${inner}</g>`;
    }

    case 'group':
      return `<g id="${escapeXml(el.id)}"${transform}${extras}/>`;

    default:
      return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }
}

export function exportSvg(doc: BroadsetDocument): string {
  const defs: string[] = [];
  const elementNodes = doc.elements.map((el) => renderElement(el, defs));

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  return [
    `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}" width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`,
    defsBlock,
    ...elementNodes,
    '</svg>',
  ].join('\n');
}
