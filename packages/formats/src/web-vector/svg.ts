import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle } from '@broadset/model';

import { escapeXml } from './shared';

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';

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

  if (style.fill !== undefined) {
    attrs.push(`fill="${escapeXml(style.fill)}"`);
  }

  if (style.stroke !== undefined) {
    attrs.push(`stroke="${escapeXml(style.stroke)}"`);
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

function buildTextAttrs(style: BroadsetElementStyle): string {
  const attrs: string[] = [];

  if (style.fontFamily) {
    attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  }

  if (style.fontSize) {
    attrs.push(`font-size="${String(style.fontSize)}"`);
  }

  if (style.fontColor) {
    attrs.push(`fill="${escapeXml(style.fontColor)}"`);
  }

  if (style.fontWeight && style.fontWeight !== 400) {
    attrs.push(`font-weight="${String(style.fontWeight)}"`);
  }

  if (style.textAlignment) {
    const anchor =
      style.textAlignment === 'left' ? 'start'
      : style.textAlignment === 'right' ? 'end'
      : 'middle';

    attrs.push(`text-anchor="${anchor}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function renderSvgPayload(el: BroadsetElement, transform: string): string {
  const content = el.content;

  if (!content) {
    return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }

  const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(content);
  const inner = innerMatch?.[1] ?? content;

  return `<g id="${escapeXml(el.id)}"${transform}>${inner}</g>`;
}

function renderElement(el: BroadsetElement, clipDefs: string[]): string {
  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  let clipAttr = '';

  if (el.style.customClipPath) {
    const clipId = `clip-${el.id}`;

    clipDefs.push(renderClipPathDef(el.id, el.style.customClipPath));
    clipAttr = ` clip-path="url(#${clipId})"`;
  }

  switch (el.type) {
    case 'path':
      return `<path id="${escapeXml(el.id)}" d="${escapeXml(el.content)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'rectangle':
      return `<rect id="${escapeXml(el.id)}" width="${String(el.width)}" height="${String(el.height)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'ellipse':
      return `<ellipse id="${escapeXml(el.id)}" cx="${String(el.width / 2)}" cy="${String(el.height / 2)}" rx="${String(el.width / 2)}" ry="${String(el.height / 2)}"${styleAttrs}${transform}${clipAttr}/>`;

    case 'text':
      return `<text id="${escapeXml(el.id)}"${buildTextAttrs(el.style)}${transform}${clipAttr}>${escapeXml(el.content)}</text>`;

    case 'image':
      return `<image id="${escapeXml(el.id)}" href="${escapeXml(el.content)}" width="${String(el.width)}" height="${String(el.height)}"${transform}${clipAttr}/>`;

    case 'svg':
      return renderSvgPayload(el, transform + styleAttrs + clipAttr);

    case 'group':
      return `<g id="${escapeXml(el.id)}"${transform}${clipAttr}/>`;

    default:
      return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }
}

export function exportSvg(doc: BroadsetDocument): string {
  const clipDefs: string[] = [];
  const elementNodes = doc.elements.map((el) => renderElement(el, clipDefs));

  const defs = clipDefs.length > 0 ? `<defs>${clipDefs.join('')}</defs>` : '';

  return [
    `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}" width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`,
    defs,
    ...elementNodes,
    '</svg>',
  ].join('\n');
}
