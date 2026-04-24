import {
  type ArrowEnd,
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

import { sanitizeSvg } from '../_shared/sanitize';
import { generateQrSvgFragment } from '../interchange';
import { escapeXml } from './shared';
import type { SvgExportOptions } from './types';

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

  if (style.strokeLinecap !== undefined) {
    attrs.push(`stroke-linecap="${style.strokeLinecap}"`);
  }

  if (style.strokeLinejoin !== undefined) {
    attrs.push(`stroke-linejoin="${style.strokeLinejoin}"`);
  }

  if (style.strokeMiterlimit !== undefined) {
    attrs.push(`stroke-miterlimit="${String(style.strokeMiterlimit)}"`);
  }

  if (style.strokeDasharray !== undefined) {
    attrs.push(`stroke-dasharray="${escapeXml(style.strokeDasharray)}"`);
  }

  if (style.strokeDashoffset !== undefined) {
    attrs.push(`stroke-dashoffset="${String(style.strokeDashoffset)}"`);
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

/**
 * Renders a `<marker>` def for a stroke arrow end. The marker uses
 * `stroke-width`-relative sizing (`markerUnits="strokeWidth"`) so the
 * arrow grows with the line. Canonical triangle / stealth / diamond /
 * oval shapes match the ArrowEndShape union in the model.
 */
function arrowEndScale(size: 'sm' | 'md' | 'lg' | undefined): number {
  if (size === 'sm') return 2;
  if (size === 'lg') return 6;

  return 4;
}

function renderMarkerDef(id: string, end: ArrowEnd, stroke: string): string {
  const widthScale = arrowEndScale(end.width);
  const lengthScale = arrowEndScale(end.length);
  let path: string;

  switch (end.shape) {
    case 'stealth':
      // Narrow swept-back arrow
      path = `<path d="M0,0 L${String(lengthScale)},${String(widthScale / 2)} L${String(
        lengthScale * 0.6,
      )},${String(widthScale / 2)} L0,${String(widthScale)} Z" fill="${stroke}"/>`;
      break;
    case 'diamond':
      path = `<path d="M0,${String(widthScale / 2)} L${String(lengthScale / 2)},0 L${String(
        lengthScale,
      )},${String(widthScale / 2)} L${String(lengthScale / 2)},${String(widthScale)} Z" fill="${stroke}"/>`;
      break;
    case 'oval':
      path = `<ellipse cx="${String(lengthScale / 2)}" cy="${String(widthScale / 2)}" rx="${String(
        lengthScale / 2,
      )}" ry="${String(widthScale / 2)}" fill="${stroke}"/>`;
      break;
    case 'none':
      return '';
    case 'triangle':
    default:
      path = `<path d="M0,0 L${String(lengthScale)},${String(widthScale / 2)} L0,${String(
        widthScale,
      )} Z" fill="${stroke}"/>`;
  }

  return `<marker id="${id}" viewBox="0 0 ${String(lengthScale)} ${String(
    widthScale,
  )}" markerUnits="strokeWidth" markerWidth="${String(lengthScale)}" markerHeight="${String(
    widthScale,
  )}" refX="${String(lengthScale)}" refY="${String(widthScale / 2)}" orient="auto">${path}</marker>`;
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

/**
 * Re-emits an opaque `svg`-type element's content, stripping any
 * active surface (`<script>`, `on*=`, `javascript:` URLs,
 * `<foreignObject>`) via the shared `_shared/sanitize` path before
 * embedding the markup. Even a hostile payload that survived a
 * previous importer cannot reach a downstream consumer as executable
 * markup.
 */
function renderSvgPayload(el: BroadsetElement, transform: string): string {
  const content = resolveContentAsPlainString(el.content);

  if (!content) {
    return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }

  const { ast } = sanitizeSvg(content);
  const sanitized = ast.markup;
  const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(sanitized);
  const inner = innerMatch?.[1] ?? sanitized;

  return `<g id="${escapeXml(el.id)}"${transform}>${inner}</g>`;
}

function collectClipAttr(el: BroadsetElement, defs: string[]): string {
  if (!el.style.customClipPath) {
    return '';
  }

  const clipId = `clip-${el.id}`;

  defs.push(renderClipPathDef(el.id, el.style.customClipPath));

  return ` clip-path="url(#${clipId})"`;
}

function collectGradientFillOverride(el: BroadsetElement, defs: string[]): string {
  const gradientFill = getGradientFillGradient(el.style.fill);

  if (gradientFill === undefined) {
    return '';
  }

  const grad = renderGradientDef(el.id, gradientFill);

  if (grad === null) {
    return '';
  }

  defs.push(grad.def);

  return ` fill="url(#${grad.id})"`;
}

function collectShadowFilterAttr(el: BroadsetElement, defs: string[]): string {
  if (!el.style.boxShadow) {
    return '';
  }

  const shadow = renderShadowFilter(el.id, el.style.boxShadow);

  if (shadow === null) {
    return '';
  }

  defs.push(shadow.def);

  return ` filter="url(#${shadow.id})"`;
}

function collectArrowMarkerAttrs(el: BroadsetElement, defs: string[]): string {
  const strokeCss = resolveStyleColor(el.style.stroke, { resolveTheme: false }) ?? '#000000';
  const parts: string[] = [];
  const head = el.style.strokeHeadEnd;
  const tail = el.style.strokeTailEnd;

  if (head !== undefined && head.shape !== 'none') {
    const markerId = `marker-start-${el.id}`;
    const markerDef = renderMarkerDef(markerId, head, strokeCss);

    if (markerDef !== '') {
      defs.push(markerDef);
      parts.push(` marker-start="url(#${markerId})"`);
    }
  }

  if (tail !== undefined && tail.shape !== 'none') {
    const markerId = `marker-end-${el.id}`;
    const markerDef = renderMarkerDef(markerId, tail, strokeCss);

    if (markerDef !== '') {
      defs.push(markerDef);
      parts.push(` marker-end="url(#${markerId})"`);
    }
  }

  return parts.join('');
}

function renderElement(
  el: BroadsetElement,
  defs: string[],
  childrenByParent: ReadonlyMap<string, readonly BroadsetElement[]>,
): string {
  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  const clipAttr = collectClipAttr(el, defs);
  const fillOverride = collectGradientFillOverride(el, defs);
  const filterAttr = collectShadowFilterAttr(el, defs);
  const markerAttrs = collectArrowMarkerAttrs(el, defs);
  const extras = clipAttr + filterAttr + markerAttrs;

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

    case 'group': {
      const children = childrenByParent.get(el.id) ?? [];
      const childMarkup = children.map((child) => renderElement(child, defs, childrenByParent)).join('');

      return `<g id="${escapeXml(el.id)}"${transform}${extras}>${childMarkup}</g>`;
    }

    default:
      return `<g id="${escapeXml(el.id)}"${transform}/>`;
  }
}

/**
 * Build a parent→children map from a flat element list. The renderer
 * iterates the top-level roots (`parentId === null`) only; every
 * group recursively pulls its children from this map. Nesting is
 * arbitrary-depth per the cross-format importer contract in
 * `project/spec/formats/spec.md`.
 */
function hasNonEmptyParentId(el: BroadsetElement): el is BroadsetElement & { readonly parentId: string } {
  return typeof el.parentId === 'string' && el.parentId !== '';
}

function buildChildrenByParent(elements: readonly BroadsetElement[]): ReadonlyMap<string, readonly BroadsetElement[]> {
  const byParent = new Map<string, BroadsetElement[]>();

  for (const el of elements) {
    if (!hasNonEmptyParentId(el)) {
      continue;
    }

    const bucket = byParent.get(el.parentId);

    if (bucket !== undefined) {
      bucket.push(el);
    } else {
      byParent.set(el.parentId, [el]);
    }
  }

  return byParent;
}

/**
 * Serialises a `BroadsetDocument` into an SVG markup string. This is
 * the Phase 7.1 baseline — the Phase 7.2 parity rebuild will replace
 * this body with a richer renderer that fixes the recursive-group
 * bug, covers every stroke property, handles full transform
 * composition, and emits the `<metadata>` RDF packet plus
 * `data-bs-*` tags. The current body preserves existing behaviour so
 * the demo keeps rendering while Phase 7.1 is landing.
 */
export function exportSvgString(doc: BroadsetDocument, _options?: SvgExportOptions): string {
  // Phase 7.2 landed the recursive group renderer + full stroke
  // coverage + opaque-payload sanitization. Phase 7.3 layers font
  // embedding, conic-gradient fallback metadata, OKLCH preservation,
  // and the <metadata> RDF packet on top.
  const defs: string[] = [];
  const childrenByParent = buildChildrenByParent(doc.elements);
  const rootElements = doc.elements.filter((el) => !hasNonEmptyParentId(el));
  const elementNodes = rootElements.map((el) => renderElement(el, defs, childrenByParent));

  const defsBlock = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : '';

  return [
    `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}" width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`,
    defsBlock,
    ...elementNodes,
    '</svg>',
  ].join('\n');
}

export interface SvgExportResult {
  readonly svg: string;
  readonly warnings: readonly string[];
}

/**
 * High-level export entry point: returns the SVG string plus any
 * warnings raised during export. Phase 7.2 populates `warnings` with
 * preflight output (missing fonts, restricted embed permissions,
 * conic-gradient fallbacks, rasterisation fallbacks); the Phase 7.1
 * baseline returns an empty list.
 */
export function exportSvgDocument(doc: BroadsetDocument, options?: SvgExportOptions): SvgExportResult {
  return { svg: exportSvgString(doc, options), warnings: [] };
}
