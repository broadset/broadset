import {
  type ArrowEnd,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  type BroadsetGradient,
  colorToCss,
  getGradientFillGradient,
  getSolidFillColor,
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFillToSvgPaint,
} from '@broadset/model';

import { fingerprintElement } from '../_shared/fingerprint';
import { sanitizeSvg } from '../_shared/sanitize';
import { generateQrSvgFragment } from '../interchange';
import { type FontEmbedPlan, planFontEmbedding } from './export-fonts';
import { escapeXml } from './shared';
import { SVG_BROADSET_NAMESPACE, type SvgExportOptions } from './types';

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';
const RDF_XMLNS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/* ------------------------------------------------------------------ */
/*  Gradient Defs                                                     */
/* ------------------------------------------------------------------ */

function renderGradientDef(elementId: string, gradient: BroadsetGradient): { id: string; def: string } | null {
  // Conic gradients fall back to a linear approximation on the
  // visual layer; the metadata packet carries the original spec so
  // re-import recovers the true type.
  const effective = gradient.type === 'conic' ? conicFallbackGradient(gradient) : gradient;
  const gradId = `grad-${elementId}`;
  const stops = effective.stops
    .map((s) => `<stop offset="${String(s.position * 100)}%" stop-color="${escapeXml(colorToCss(s.color))}"/>`)
    .join('');

  if (effective.type === 'linear') {
    const angle = effective.angle ?? 0;
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

  if (effective.type === 'radial') {
    const cx = (effective.center?.[0] ?? 50) / 100;
    const cy = (effective.center?.[1] ?? 50) / 100;

    return {
      id: gradId,
      def: `<radialGradient id="${gradId}" cx="${String(cx)}" cy="${String(cy)}" r="0.5">${stops}</radialGradient>`,
    };
  }

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

interface RenderElementOptions {
  readonly includeElementTagging: boolean;
  readonly flattenedTextElements: ReadonlyMap<string, string>;
}

function renderElement(
  el: BroadsetElement,
  defs: string[],
  childrenByParent: ReadonlyMap<string, readonly BroadsetElement[]>,
  fingerprints: ReadonlyMap<string, string>,
  options: RenderElementOptions,
): string {
  const flatSubstitute = options.flattenedTextElements.get(el.id);

  if (flatSubstitute !== undefined) {
    return flatSubstitute;
  }

  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  const clipAttr = collectClipAttr(el, defs);
  const fillOverride = collectGradientFillOverride(el, defs);
  const filterAttr = collectShadowFilterAttr(el, defs);
  const markerAttrs = collectArrowMarkerAttrs(el, defs);
  const tagAttrs = options.includeElementTagging
    ? buildElementTagAttrs(el, resolveFingerprint(fingerprints, el.id))
    : '';
  // `extras` excludes `tagAttrs` so callers below append it exactly
  // once on the element's opening tag. Mixing it in here would
  // duplicate the attributes on elements whose open tag already
  // emits `tagAttrs` explicitly (group / svg / qrcode).
  const extras = clipAttr + filterAttr + markerAttrs;

  switch (el.type) {
    case 'path':
      return `<path id="${escapeXml(el.id)}" d="${escapeXml(resolveContentAsPlainString(el.content))}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'rectangle':
      return `<rect id="${escapeXml(el.id)}" width="${String(el.width)}" height="${String(el.height)}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'ellipse':
      return `<ellipse id="${escapeXml(el.id)}" cx="${String(el.width / 2)}" cy="${String(el.height / 2)}" rx="${String(el.width / 2)}" ry="${String(el.height / 2)}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'text': {
      const textPathRef = el.textPathElementId;
      const plainText = escapeXml(resolveContentAsPlainString(el.content));
      const inner =
        typeof textPathRef === 'string' && textPathRef !== ''
          ? `<textPath href="#${escapeXml(textPathRef)}" xlink:href="#${escapeXml(textPathRef)}">${plainText}</textPath>`
          : plainText;

      return `<text id="${escapeXml(el.id)}"${buildTextAttrs(el.style)}${transform}${extras}${tagAttrs}>${inner}</text>`;
    }

    case 'image': {
      const par = objectFitToPreserveAspectRatio(el.style.objectFit);

      return `<image id="${escapeXml(el.id)}" href="${escapeXml(resolveContentAsPlainString(el.content))}" width="${String(el.width)}" height="${String(el.height)}" preserveAspectRatio="${par}"${transform}${extras}${tagAttrs}/>`;
    }

    case 'svg':
      return renderSvgPayload(el, transform + styleAttrs + extras + tagAttrs);

    case 'qrcode': {
      const qrSvg = generateQrSvgFragment(resolveContentAsPlainString(el.content));

      if (qrSvg === null) {
        return `<g id="${escapeXml(el.id)}"${transform}${tagAttrs}/>`;
      }

      // Extract SVG inner content from the fragment
      const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(qrSvg);
      const inner = innerMatch?.[1] ?? qrSvg;

      return `<g id="${escapeXml(el.id)}"${transform}${tagAttrs}>${inner}</g>`;
    }

    case 'group': {
      const children = childrenByParent.get(el.id) ?? [];
      const childMarkup = children
        .map((child) => renderElement(child, defs, childrenByParent, fingerprints, options))
        .join('');

      return `<g id="${escapeXml(el.id)}"${transform}${extras}${tagAttrs}>${childMarkup}</g>`;
    }

    default:
      return `<g id="${escapeXml(el.id)}"${transform}${tagAttrs}/>`;
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

/**
 * Build the `data-bs-*` + `broadset:content-hash` attribute string
 * every rendered element carries. The `data-bs-*` attributes are
 * SVG 2 / HTML5 global so they survive Illustrator / Inkscape /
 * Figma save-roundtrips; `broadset:content-hash` rides in the
 * namespaced attribute so tag-strippers that drop `data-*` still
 * leave a fingerprint for identity recovery.
 */
function buildElementTagAttrs(el: BroadsetElement, fingerprint: string): string {
  const parts: string[] = [
    ` data-bs-id="${escapeXml(el.id)}"`,
    ` data-bs-kind="${el.type}"`,
    ` broadset:content-hash="${fingerprint}"`,
  ];

  const dataField = el.dataField;

  if (typeof dataField === 'object' && dataField !== null && typeof dataField.fieldName === 'string') {
    parts.push(` data-bs-data-field="${escapeXml(dataField.fieldName)}"`);
  }

  const visibleWhen = el.visibleWhen;

  if (typeof visibleWhen === 'string' && visibleWhen !== '') {
    parts.push(` data-bs-visible-when="${escapeXml(visibleWhen)}"`);
  }

  const repeater = el.repeater;

  if (typeof repeater === 'object' && repeater !== null && typeof repeater.dataArrayField === 'string') {
    parts.push(` data-bs-repeater="${escapeXml(repeater.dataArrayField)}"`);
  }

  return parts.join('');
}

/**
 * Extract `originalColor` strings from solid-fill colours so the
 * document `<metadata>` packet can carry the source colour spec.
 * sRGB-only colours return undefined so the caller skips them.
 */
function extractOriginalColor(fill: BroadsetFill): string | undefined {
  const color = getSolidFillColor(fill);

  if (color?.kind !== 'rgb') {
    return undefined;
  }

  return color.originalColor;
}

/**
 * The fill used by the visual layer when a conic gradient is
 * requested. Conic has no SVG 2 primitive, so we emit a many-stop
 * linear approximation — the true spec rides in `<metadata>` and is
 * recovered on re-import.
 */
function conicFallbackGradient(conic: BroadsetGradient): BroadsetGradient {
  return {
    type: 'linear',
    angle: conic.startAngle ?? 0,
    stops: conic.stops,
  };
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
/**
 * Build the document-level `<metadata>` RDF/XML packet. Carries
 * Broadset-native state that SVG primitives cannot express visually:
 * document id, canvas unit + dpi, per-element identity list with
 * fingerprints and optional `originalColor` / conic-gradient specs.
 *
 * The namespace URI is the shared Broadset XMP URI from IO-D-08 so
 * reconciliation treats a single namespace across PSD / PDF / PPTX /
 * SVG. The RDF/XML encoding is the W3C-recommended metadata form
 * that Illustrator and Inkscape preserve across save.
 */
function buildMetadataPacket(doc: BroadsetDocument, fingerprints: ReadonlyMap<string, string>): string {
  const elementEntries: string[] = [];

  for (const el of doc.elements) {
    const fingerprint = resolveFingerprint(fingerprints, el.id);
    const originalColor = extractOriginalColor(el.style.fill);
    const gradientFill = getGradientFillGradient(el.style.fill);
    const conicSpec = gradientFill?.type === 'conic' ? JSON.stringify(gradientFill) : undefined;
    const attrs: string[] = [` broadset:elementId="${escapeXml(el.id)}"`, ` broadset:fingerprint="${fingerprint}"`];

    if (typeof el.name === 'string' && el.name !== '') {
      attrs.push(` broadset:name="${escapeXml(el.name)}"`);
    }

    attrs.push(` broadset:width="${String(el.width)}"`);
    attrs.push(` broadset:height="${String(el.height)}"`);

    if (originalColor !== undefined) {
      attrs.push(` broadset:originalColor="${escapeXml(originalColor)}"`);
    }

    if (conicSpec !== undefined) {
      attrs.push(` broadset:conicGradient="${escapeXml(conicSpec)}"`);
    }

    elementEntries.push(`<rdf:li${attrs.join('')}/>`);
  }

  return [
    '<metadata>',
    `<rdf:RDF xmlns:rdf="${RDF_XMLNS}" xmlns:broadset="${SVG_BROADSET_NAMESPACE}">`,
    `<rdf:Description rdf:about="" broadset:canvasUnit="${doc.canvas.unit}" broadset:canvasDpi="${String(doc.canvas.dpi)}">`,
    `<broadset:documentId>${escapeXml(doc.id)}</broadset:documentId>`,
    '<broadset:elements>',
    '<rdf:Seq>',
    ...elementEntries,
    '</rdf:Seq>',
    '</broadset:elements>',
    '</rdf:Description>',
    '</rdf:RDF>',
    '</metadata>',
  ].join('');
}

function buildRootNamespaceDeclarations(opts: { includeMetadata: boolean; includeElementTagging: boolean }): string {
  if (opts.includeMetadata) {
    return ` xmlns:broadset="${SVG_BROADSET_NAMESPACE}" xmlns:rdf="${RDF_XMLNS}"`;
  }

  if (opts.includeElementTagging) {
    return ` xmlns:broadset="${SVG_BROADSET_NAMESPACE}"`;
  }

  return '';
}

async function computeFingerprints(elements: readonly BroadsetElement[]): Promise<ReadonlyMap<string, string>> {
  const map = new Map<string, string>();

  for (const el of elements) {
    const fp = await fingerprintElement(el);

    if (fp.length !== 16) {
      throw new Error(`fingerprintElement produced an invalid digest for element "${el.id}": ${fp}`);
    }

    map.set(el.id, fp);
  }

  return map;
}

function resolveFingerprint(fingerprints: ReadonlyMap<string, string>, elementId: string): string {
  const fp = fingerprints.get(elementId);

  if (fp === undefined) {
    throw new Error(`Fingerprint missing for element "${elementId}" during SVG export`);
  }

  return fp;
}

/**
 * Serialises a `BroadsetDocument` into an SVG markup string. Async
 * because per-element fingerprinting runs through xxhash-wasm
 * (the WASM runtime initialises lazily on first call).
 *
 * Phase 7.3 adds: `data-bs-*` tagging on every rendered element,
 * namespaced `broadset:content-hash` for identity recovery,
 * document `<metadata>` RDF packet, conic-gradient fallback with
 * metadata preservation, and `BroadsetColor.originalColor`
 * preservation for non-sRGB fills.
 */
export async function exportSvgString(doc: BroadsetDocument, options?: SvgExportOptions): Promise<string> {
  const result = await exportSvgInternal(doc, options);

  return result.svg;
}

export interface SvgExportResult {
  readonly svg: string;
  readonly warnings: readonly string[];
}

/**
 * High-level export entry point: returns the SVG string plus any
 * warnings raised during export. Phase 7.7d threads font-embedding
 * preflight warnings through `warnings` (missing bytes, restricted
 * permissions, fallback to `'reference'`).
 */
export async function exportSvgDocument(
  doc: BroadsetDocument,
  options?: SvgExportOptions,
): Promise<SvgExportResult> {
  return exportSvgInternal(doc, options);
}

async function exportSvgInternal(doc: BroadsetDocument, options?: SvgExportOptions): Promise<SvgExportResult> {
  const includeMetadata = options?.includeMetadata ?? true;
  const includeElementTagging = options?.includeElementTagging ?? true;
  const fontEmbedding = options?.fontEmbedding ?? 'embed';
  const defs: string[] = [];
  const fontPlan: FontEmbedPlan = planFontEmbedding(doc, fontEmbedding, options?.fonts);
  const fingerprints = await computeFingerprints(doc.elements);
  const childrenByParent = buildChildrenByParent(doc.elements);
  const rootElements = doc.elements.filter((el) => !hasNonEmptyParentId(el));
  const elementNodes = rootElements.map((el) =>
    renderElement(el, defs, childrenByParent, fingerprints, {
      includeElementTagging,
      flattenedTextElements: fontPlan.flattenedTextElements,
    }),
  );
  const defsParts: string[] = [];

  if (fontPlan.defsStyleBlock !== '') {
    defsParts.push(fontPlan.defsStyleBlock);
  }

  if (defs.length > 0) {
    defsParts.push(defs.join(''));
  }

  const defsBlock = defsParts.length > 0 ? `<defs>${defsParts.join('')}</defs>` : '';
  const metadataBlock = includeMetadata ? buildMetadataPacket(doc, fingerprints) : '';
  const nsDeclarations = buildRootNamespaceDeclarations({ includeMetadata, includeElementTagging });
  const rootOpen = `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}"${nsDeclarations} width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`;
  const svg = [rootOpen, metadataBlock, defsBlock, ...elementNodes, '</svg>'].join('\n');

  return { svg, warnings: fontPlan.warnings };
}

