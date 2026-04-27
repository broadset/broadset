import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  getGradientFillGradient,
  getSolidFillColor,
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFillToSvgPaint,
} from '@broadset/model';

import { fingerprintElement } from '../_shared/fingerprint';
import { sanitizeSvg } from '../_shared/sanitize';
import { generateQrSvgFragment } from '../interchange';
import {
  objectFitToPreserveAspectRatio,
  renderFilterStackDef,
  renderGradientDef,
  renderMarkerDef,
  renderMaskDef,
  renderPatternDef,
  renderShadowFilter,
} from './export-defs';
import { type FontEmbedPlan, planFontEmbedding } from './export-fonts';
import { buildTextAttrs, renderTextInner } from './export-text';
import { escapeXml, isAllowedImageUrlScheme } from './shared';
import { SVG_BROADSET_NAMESPACE, type SvgExportOptions } from './types';

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';
const RDF_XMLNS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';


function buildTransformAttr(value: string): string {
  return value.length > 0 ? ` transform="${value}"` : '';
}

function buildTransformValue(el: BroadsetElement): string {
  const parts: string[] = [];

  if (el.position.x !== 0 || el.position.y !== 0) {
    parts.push(`translate(${String(el.position.x)},${String(el.position.y)})`);
  }

  if (el.rotation !== 0) {
    parts.push(`rotate(${String(el.rotation)},${String(el.width / 2)},${String(el.height / 2)})`);
  }

  return parts.join(' ');
}

function mergeTransformValues(parent: string, child: string): string {
  if (parent === '') return child;
  if (child === '') return parent;

  return `${parent} ${child}`;
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

/**
 * Content-addressed collector for `<defs>` entries (gradients,
 * clip-paths, filters, markers). Each `register` call hashes the
 * supplied key into a short stable id; multiple elements using the
 * same gradient / clip-path / shadow share a single `<defs>` node
 * rather than emitting one per element. Closes the P7 review #4
 * finding that the matrix claim "Shared <defs> entries are
 * deduplicated by content-hash" wasn't actually delivered.
 */
class DefsCollector {
  private readonly defs: string[] = [];
  private readonly idsByKey = new Map<string, string>();

  /**
   * Register a def under a content-derived `key`. The factory only
   * runs the first time `key` is registered; subsequent calls
   * return the same id without emitting a duplicate def.
   */
  register(prefix: string, key: string, factory: (id: string) => string): string {
    const cached = this.idsByKey.get(key);

    if (cached !== undefined) return cached;

    const id = `${prefix}-${shortHash(key)}`;

    this.idsByKey.set(key, id);
    this.defs.push(factory(id));

    return id;
  }

  toArray(): readonly string[] {
    return this.defs;
  }
}

/**
 * Short, stable hash used as a `<defs>` entry id. djb2-style — fast,
 * no crypto needed (collisions in this domain just mean two
 * different gradients share an id, which would be visually wrong;
 * the input space is the gradient / clip / filter content string,
 * not attacker-influenced).
 */
function shortHash(input: string): string {
  let hash = 5381;

  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }

  return (hash >>> 0).toString(36);
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

function collectClipAttr(el: BroadsetElement, defs: DefsCollector): string {
  if (!el.style.customClipPath) {
    return '';
  }

  const customClipPath = el.style.customClipPath;
  const id = defs.register(
    'clip',
    `clip:${customClipPath}`,
    (clipId) => `<clipPath id="${clipId}"><path d="${escapeXml(customClipPath)}"/></clipPath>`,
  );

  return ` clip-path="url(#${id})"`;
}

function collectGradientFillOverride(el: BroadsetElement, defs: DefsCollector): string {
  const gradientFill = getGradientFillGradient(el.style.fill);

  if (gradientFill === undefined) {
    return '';
  }

  const id = defs.register('grad', `grad:${JSON.stringify(gradientFill)}`, (gradId) =>
    renderGradientDef(gradId, gradientFill),
  );

  return ` fill="url(#${id})"`;
}

/**
 * Pattern / picture fill: emit a `<pattern>` def referencing the
 * asset id; element gets `fill="url(#…)"`. Picture fills with
 * `mode === 'stretch'` use `preserveAspectRatio="none"` so the
 * single image fills the box without tiling.
 */
function collectPatternFillOverride(
  el: BroadsetElement,
  defs: DefsCollector,
  assetResolver?: (assetId: string) => string | undefined,
): string {
  const fill = el.style.fill;

  if (fill.kind !== 'pattern' && fill.kind !== 'picture') {
    return '';
  }

  // Include the resolved href in the cache key so two patterns
  // that share `assetId` but resolve to different URLs (e.g.,
  // one with bytes prefetched, one without) still dedupe by
  // their final emitted markup.
  const resolvedHref = assetResolver?.(fill.assetId) ?? fill.assetId;
  const key = `pattern:${JSON.stringify(fill)}:${resolvedHref}:${String(el.width)}:${String(el.height)}`;
  const id = defs.register('pattern', key, (patternId) =>
    renderPatternDef(patternId, fill, el.width, el.height, assetResolver),
  );

  return ` fill="url(#${id})"`;
}

/**
 * `<mask>` for elements that declare both a `customClipPath` and
 * a non-`none` `maskType`. The mask def carries the path with a
 * white fill (visible) so the resulting alpha follows the path
 * geometry. Plain `customClipPath` (no `maskType`) still uses the
 * `<clipPath>` path via `collectClipAttr`.
 */
function collectMaskAttr(el: BroadsetElement, defs: DefsCollector): string {
  const maskType = el.style.maskType;
  const maskPath = el.style.customClipPath;

  if (maskType === undefined || maskType === 'none' || typeof maskPath !== 'string' || maskPath === '') {
    return '';
  }

  // SVG mask convention: white = visible, black = hidden. Both
  // alpha and luminance mask types produce a path filled with
  // white so the masked shape shows through where the path
  // covers — luminance just samples brightness instead of alpha.
  const fillCss = '#ffffff';
  const id = defs.register('mask', `mask:${maskType}:${maskPath}`, (maskId) =>
    renderMaskDef(maskId, maskPath, fillCss),
  );

  return ` mask="url(#${id})"`;
}

function collectStructuredFilterAttr(el: BroadsetElement, defs: DefsCollector): string {
  const stack = el.style.filter;

  if (stack === undefined || !Array.isArray(stack) || stack.length === 0) {
    return '';
  }

  const id = defs.register('filter', `filter:${JSON.stringify(stack)}`, (filterId) =>
    renderFilterStackDef(filterId, stack),
  );

  return ` filter="url(#${id})"`;
}

function collectShadowFilterAttr(el: BroadsetElement, defs: DefsCollector): string {
  if (!el.style.boxShadow) {
    return '';
  }

  const shadowSpec = el.style.boxShadow;
  const id = defs.register('shadow', `shadow:${shadowSpec}`, (filterId) => renderShadowFilter(filterId, shadowSpec));

  return ` filter="url(#${id})"`;
}

function collectArrowMarkerAttrs(el: BroadsetElement, defs: DefsCollector): string {
  const strokeCss = resolveStyleColor(el.style.stroke, { resolveTheme: false }) ?? '#000000';
  const parts: string[] = [];
  const head = el.style.strokeHeadEnd;
  const tail = el.style.strokeTailEnd;

  if (head !== undefined && head.shape !== 'none') {
    const id = defs.register('marker-start', `marker:${JSON.stringify(head)}:${strokeCss}`, (markerId) =>
      renderMarkerDef(markerId, head, strokeCss),
    );

    parts.push(` marker-start="url(#${id})"`);
  }

  if (tail !== undefined && tail.shape !== 'none') {
    const id = defs.register('marker-end', `marker:${JSON.stringify(tail)}:${strokeCss}`, (markerId) =>
      renderMarkerDef(markerId, tail, strokeCss),
    );

    parts.push(` marker-end="url(#${id})"`);
  }

  return parts.join('');
}

interface RenderElementOptions {
  readonly includeElementTagging: boolean;
  readonly flattenedTextElements: ReadonlyMap<string, string>;
  readonly flattenGroups: boolean;
  readonly assetResolver?: ((assetId: string) => string | undefined) | undefined;
}

interface RenderElementContext {
  readonly defs: DefsCollector;
  readonly childrenByParent: ReadonlyMap<string, readonly BroadsetElement[]>;
  readonly fingerprints: ReadonlyMap<string, string>;
  readonly options: RenderElementOptions;
  readonly inheritedTransform: string;
}

/**
 * Return the cached source markup for `el` when the importer
 * captured one AND the user hasn't modified the element
 * (`extensions.svg.dirty === false`). Returns `null` when the
 * element should re-render from current state.
 */
/**
 * Resolve the `href` for an `<image>` element. Prefers the
 * explicit `content` URL when set (legacy / direct-URL fixtures).
 * Falls back to `assetResolver(assetId)` for assetId-only
 * elements so standalone SVG viewers see a valid `<image href>`
 * instead of a bare Broadset asset id. Returns `''` when neither
 * is available — the SVG is structurally correct but the image
 * won't render in standalone viewers.
 */
function resolveImageHref(
  el: BroadsetElement,
  assetResolver: ((assetId: string) => string | undefined) | undefined,
): string {
  const contentStr = resolveContentAsPlainString(el.content);

  if (contentStr !== '') {
    return isAllowedImageUrlScheme(contentStr) ? contentStr : '';
  }

  if (el.assetId !== null) {
    const resolved = assetResolver?.(el.assetId) ?? el.assetId;

    return isAllowedImageUrlScheme(resolved) ? resolved : '';
  }

  return '';
}

function preservedMarkupFor(el: BroadsetElement): string | null {
  const ext = el.extensions as
    | {
        readonly svg?: {
          readonly dirty?: boolean;
          readonly preserved?: { readonly raw?: string; readonly mime?: string };
        };
      }
    | undefined;
  const svg = ext?.svg;

  if (svg === undefined) return null;
  if (svg.dirty !== false) return null;

  const raw = svg.preserved?.raw;

  if (typeof raw !== 'string' || raw === '') return null;

  return decodeBase64Utf8(raw);
}

function decodeBase64Utf8(raw: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw, 'base64').toString('utf8');
  }

  // Browser path: decode base64 → bytes → UTF-8 string. Avoids
  // the deprecated `escape` / `unescape` legacy helpers.
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder('utf-8').decode(bytes);
}

function renderFlattenedTextSubstitute(el: BroadsetElement, context: RenderElementContext): string | null {
  const flatSubstitute = context.options.flattenedTextElements.get(el.id);

  if (flatSubstitute === undefined) {
    return null;
  }

  if (context.options.flattenGroups && context.inheritedTransform !== '') {
    return `<g transform="${context.inheritedTransform}">${flatSubstitute}</g>`;
  }

  return flatSubstitute;
}

function renderGroupElement(
  el: BroadsetElement,
  context: RenderElementContext,
  effectiveTransform: string,
  transform: string,
  extras: string,
  tagAttrs: string,
): string {
  const children = context.childrenByParent.get(el.id) ?? [];
  const childInheritedTransform = context.options.flattenGroups ? effectiveTransform : '';
  const childMarkup = children
    .map((child) => renderElement(child, { ...context, inheritedTransform: childInheritedTransform }))
    .join('');
  const groupTransform = context.options.flattenGroups ? '' : transform;

  return `<g id="${escapeXml(el.id)}"${groupTransform}${extras}${tagAttrs}>${childMarkup}</g>`;
}

function renderElement(
  el: BroadsetElement,
  context: RenderElementContext,
): string {
  const ownTransform = buildTransformValue(el);
  const effectiveTransform =
    context.options.flattenGroups ? mergeTransformValues(context.inheritedTransform, ownTransform) : ownTransform;
  const transform = buildTransformAttr(effectiveTransform);
  const flatSubstitute = renderFlattenedTextSubstitute(el, context);

  if (flatSubstitute !== null) {
    return flatSubstitute;
  }

  // Byte preservation fast path: if the element's
  // `extensions.svg.dirty` is false AND the importer captured a
  // `preserved.raw` blob (base64 outerHTML), re-emit the cached
  // markup verbatim. Closes the spec acceptance "Re-exporting an
  // untouched document produces output with preserved elements
  // identical to the source".
  const preserved = preservedMarkupFor(el);

  if (preserved !== null) {
    return preserved;
  }

  const styleAttrs = buildStyleAttrs(el.style);
  const clipAttr = collectClipAttr(el, context.defs);
  const maskAttr = collectMaskAttr(el, context.defs);
  const gradientFill = collectGradientFillOverride(el, context.defs);
  const patternFill = collectPatternFillOverride(el, context.defs, context.options.assetResolver);
  const fillOverride = gradientFill !== '' ? gradientFill : patternFill;
  // `style.filter` (structured FilterStack) is the modern path;
  // `style.boxShadow` is the legacy CSS shadow string. The
  // structured filter wins when both are present — `boxShadow`
  // is folded into the same `<feDropShadow>` primitive on import.
  const structuredFilterAttr = collectStructuredFilterAttr(el, context.defs);
  const shadowFilterAttr = collectShadowFilterAttr(el, context.defs);
  const filterAttr = structuredFilterAttr !== '' ? structuredFilterAttr : shadowFilterAttr;
  const markerAttrs = collectArrowMarkerAttrs(el, context.defs);
  const tagAttrs =
    context.options.includeElementTagging ?
      buildElementTagAttrs(el, resolveFingerprint(context.fingerprints, el.id))
    : '';
  // `extras` excludes `tagAttrs` so callers below append it exactly
  // once on the element's opening tag. Mixing it in here would
  // duplicate the attributes on elements whose open tag already
  // emits `tagAttrs` explicitly (group / svg / qrcode).
  const extras = clipAttr + maskAttr + filterAttr + markerAttrs;

  switch (el.type) {
    case 'path':
      return `<path id="${escapeXml(el.id)}" d="${escapeXml(resolveContentAsPlainString(el.content))}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'rectangle':
      return `<rect id="${escapeXml(el.id)}" width="${String(el.width)}" height="${String(el.height)}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'ellipse':
      return `<ellipse id="${escapeXml(el.id)}" cx="${String(el.width / 2)}" cy="${String(el.height / 2)}" rx="${String(el.width / 2)}" ry="${String(el.height / 2)}"${styleAttrs}${fillOverride}${transform}${extras}${tagAttrs}/>`;

    case 'text': {
      const textPathRef = el.textPathElementId;
      const innerBody = renderTextInner(el.content);
      const inner =
        typeof textPathRef === 'string' && textPathRef !== '' ?
          `<textPath href="#${escapeXml(textPathRef)}" xlink:href="#${escapeXml(textPathRef)}">${innerBody}</textPath>`
        : innerBody;

      return `<text id="${escapeXml(el.id)}"${buildTextAttrs(el.style)}${transform}${extras}${tagAttrs}>${inner}</text>`;
    }

    case 'image': {
      const par = objectFitToPreserveAspectRatio(el.style.objectFit);
      const resolvedHref = resolveImageHref(el, context.options.assetResolver);

      return `<image id="${escapeXml(el.id)}" href="${escapeXml(resolvedHref)}" width="${String(el.width)}" height="${String(el.height)}" preserveAspectRatio="${par}"${transform}${extras}${tagAttrs}/>`;
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
      return renderGroupElement(el, context, effectiveTransform, transform, extras, tagAttrs);
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
  const elementEntries = doc.elements.map((el) => buildElementMetadataEntry(el, fingerprints));

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

function buildElementMetadataEntry(el: BroadsetElement, fingerprints: ReadonlyMap<string, string>): string {
  const fingerprint = resolveFingerprint(fingerprints, el.id);
  const attrs: string[] = [` broadset:elementId="${escapeXml(el.id)}"`, ` broadset:fingerprint="${fingerprint}"`];

  if (typeof el.name === 'string' && el.name !== '') {
    attrs.push(` broadset:name="${escapeXml(el.name)}"`);
  }

  attrs.push(` broadset:width="${String(el.width)}"`);
  attrs.push(` broadset:height="${String(el.height)}"`);
  attrs.push(...buildColorAttrs(el));
  attrs.push(...buildDataBindingAttrs(el));

  return `<rdf:li${attrs.join('')}/>`;
}

function buildColorAttrs(el: BroadsetElement): readonly string[] {
  const attrs: string[] = [];
  const originalColor = extractOriginalColor(el.style.fill);
  const gradientFill = getGradientFillGradient(el.style.fill);
  const conicSpec = gradientFill?.type === 'conic' ? JSON.stringify(gradientFill) : undefined;

  if (originalColor !== undefined) {
    attrs.push(` broadset:originalColor="${escapeXml(originalColor)}"`);
  }

  if (conicSpec !== undefined) {
    attrs.push(` broadset:conicGradient="${escapeXml(conicSpec)}"`);
  }

  return attrs;
}

/**
 * Carry data-binding shapes as JSON in the metadata packet so a
 * Broadset → SVG → Broadset chain preserves the full structured
 * values (overflow / prefix / suffix / formatPattern / direction /
 * gap / maxItems). The `data-bs-*` element-level attrs only carry
 * the primary identifier and would lose the rest on re-import.
 */
function buildDataBindingAttrs(el: BroadsetElement): readonly string[] {
  const attrs: string[] = [];

  if (typeof el.dataField === 'object' && el.dataField !== null) {
    attrs.push(` broadset:dataField="${escapeXml(JSON.stringify(el.dataField))}"`);
  }

  if (typeof el.visibleWhen === 'string' && el.visibleWhen !== '') {
    attrs.push(` broadset:visibleWhen="${escapeXml(el.visibleWhen)}"`);
  }

  if (typeof el.repeater === 'object' && el.repeater !== null) {
    attrs.push(` broadset:repeater="${escapeXml(JSON.stringify(el.repeater))}"`);
  }

  return attrs;
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
export async function exportSvgDocument(doc: BroadsetDocument, options?: SvgExportOptions): Promise<SvgExportResult> {
  return exportSvgInternal(doc, options);
}

async function exportSvgInternal(doc: BroadsetDocument, options?: SvgExportOptions): Promise<SvgExportResult> {
  const includeMetadata = options?.includeMetadata ?? true;
  const includeElementTagging = options?.includeElementTagging ?? true;
  const flattenGroups = options?.flattenGroups ?? false;
  const fontEmbedding = options?.fontEmbedding ?? 'embed';
  const defs = new DefsCollector();
  const fontPlan: FontEmbedPlan = planFontEmbedding(doc, fontEmbedding, options?.fonts);
  const fingerprints = await computeFingerprints(doc.elements);
  const childrenByParent = buildChildrenByParent(doc.elements);
  const rootElements = doc.elements.filter((el) => !hasNonEmptyParentId(el));
  const elementNodes = rootElements.map((el) =>
    renderElement(el, {
      defs,
      childrenByParent,
      fingerprints,
      inheritedTransform: '',
      options: {
        includeElementTagging,
        flattenGroups,
        flattenedTextElements: fontPlan.flattenedTextElements,
        ...(options?.assetResolver !== undefined ? { assetResolver: options.assetResolver } : {}),
      },
    }),
  );
  const defsParts: string[] = [];

  if (fontPlan.defsStyleBlock !== '') {
    defsParts.push(fontPlan.defsStyleBlock);
  }

  const collectedDefs = defs.toArray();

  if (collectedDefs.length > 0) {
    defsParts.push(collectedDefs.join(''));
  }

  const defsBlock = defsParts.length > 0 ? `<defs>${defsParts.join('')}</defs>` : '';
  const metadataBlock = includeMetadata ? buildMetadataPacket(doc, fingerprints) : '';
  const nsDeclarations = buildRootNamespaceDeclarations({ includeMetadata, includeElementTagging });
  const rootOpen = `<svg xmlns="${SVG_XMLNS}" xmlns:xlink="${XLINK_XMLNS}"${nsDeclarations} width="${String(doc.canvas.width)}" height="${String(doc.canvas.height)}" viewBox="0 0 ${String(doc.canvas.width)} ${String(doc.canvas.height)}">`;
  const svg = [rootOpen, metadataBlock, defsBlock, ...elementNodes, '</svg>'].join('\n');

  return { svg, warnings: fontPlan.warnings };
}
