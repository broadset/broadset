import {
  type ArrowEnd,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetFill,
  type BroadsetGradient,
  colorToCss,
  type FilterPrimitive,
  type FilterStack,
  getGradientFillGradient,
  getSolidFillColor,
  type PatternFill,
  type PictureFill,
  resolveContentAsPlainString,
  resolveStyleColor,
  resolveStyleFillToSvgPaint,
  type Run,
  type TextBody,
} from '@broadset/model';

import { fingerprintElement } from '../_shared/fingerprint';
import { sanitizeSvg } from '../_shared/sanitize';
import { generateQrSvgFragment } from '../interchange';
import { type FontEmbedPlan, planFontEmbedding } from './export-fonts';
import { escapeXml, isAllowedImageUrlScheme } from './shared';
import { SVG_BROADSET_NAMESPACE, type SvgExportOptions } from './types';

const SVG_XMLNS = 'http://www.w3.org/2000/svg';
const XLINK_XMLNS = 'http://www.w3.org/1999/xlink';
const RDF_XMLNS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/* ------------------------------------------------------------------ */
/*  Gradient Defs                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render a gradient `<defs>` entry with the supplied `id`. The
 * caller (`DefsCollector`) owns id assignment so multiple elements
 * sharing the same gradient content reuse a single `<defs>` node.
 * Returns `''` when the gradient kind has no native SVG primitive
 * — the caller treats empty defs as a no-op fill.
 */
function renderGradientDef(id: string, gradient: BroadsetGradient): string {
  // Conic gradients fall back to a linear approximation on the
  // visual layer; the metadata packet carries the original spec so
  // re-import recovers the true type.
  const effective = gradient.type === 'conic' ? conicFallbackGradient(gradient) : gradient;
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

    return `<linearGradient id="${id}" x1="${String(x1)}" y1="${String(y1)}" x2="${String(x2)}" y2="${String(y2)}">${stops}</linearGradient>`;
  }

  if (effective.type === 'radial') {
    const cx = (effective.center?.[0] ?? 50) / 100;
    const cy = (effective.center?.[1] ?? 50) / 100;

    return `<radialGradient id="${id}" cx="${String(cx)}" cy="${String(cy)}" r="0.5">${stops}</radialGradient>`;
  }

  return '';
}

/* ------------------------------------------------------------------ */
/*  Box-Shadow → SVG Filter Approximation                            */
/* ------------------------------------------------------------------ */

function renderShadowFilter(id: string, shadow: string): string {
  // Parse simple box-shadow: <x>px <y>px <blur>px <color>
  const match = /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(.+)$/.exec(shadow.trim());

  if (match === null) {
    return '';
  }

  const dx = match[1];
  const dy = match[2];
  const blur = match[3];
  const color = match[4];

  if (dx === undefined || dy === undefined || blur === undefined || color === undefined) {
    return '';
  }

  return `<filter id="${id}"><feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${String(Number(blur) / 2)}" flood-color="${escapeXml(color.trim())}"/></filter>`;
}

/**
 * Render a structured `FilterStack` as a single `<filter>` def.
 * Each primitive emits its corresponding SVG filter primitive
 * (`<feGaussianBlur>`, `<feColorMatrix>`, `<feDropShadow>`,
 * `<feComponentTransfer>`). Empty stacks return `''` so the
 * caller skips emission and the element gets no `filter=` attr.
 */
function renderFilterStackDef(id: string, stack: FilterStack): string {
  if (stack.length === 0) {
    return '';
  }

  const primitives = stack.map(renderFilterPrimitive).filter((s) => s !== '');

  if (primitives.length === 0) {
    return '';
  }

  return `<filter id="${id}">${primitives.join('')}</filter>`;
}

function renderFilterPrimitive(primitive: FilterPrimitive): string {
  switch (primitive.kind) {
    case 'blur':
      return `<feGaussianBlur stdDeviation="${String(primitive.stdDeviation)}"/>`;

    case 'color-matrix':
      return `<feColorMatrix type="matrix" values="${primitive.matrix.join(' ')}"/>`;

    case 'drop-shadow': {
      const colorCss = colorToCss(primitive.color);

      return `<feDropShadow dx="${String(primitive.offsetX)}" dy="${String(primitive.offsetY)}" stdDeviation="${String(primitive.blur / 2)}" flood-color="${escapeXml(colorCss)}"/>`;
    }

    case 'hue-rotate':
      return `<feColorMatrix type="hueRotate" values="${String(primitive.amount)}"/>`;

    case 'saturate':
      return `<feColorMatrix type="saturate" values="${String(primitive.amount)}"/>`;

    case 'grayscale':
      return renderGrayscaleMatrix(primitive.amount);

    case 'sepia':
      return renderSepiaMatrix(primitive.amount);

    case 'invert':
      return renderInvertComponentTransfer(primitive.amount);

    case 'brightness':
      return renderBrightnessComponentTransfer(primitive.amount);

    case 'contrast':
      return renderContrastComponentTransfer(primitive.amount);

    case 'opacity':
      return `<feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${String(primitive.amount)} 0"/>`;

    case 'custom-svg':
      // Custom SVG filter primitives are sanitised at the renderer
      // boundary per FilterStack docs; emit verbatim through the
      // shared SVG sanitizer to drop any active payload.
      return sanitizeSvg(primitive.svg).ast.markup;
  }
}

/**
 * Canonical CSS-equivalent matrices for the grayscale / sepia
 * amount-based filters. The values match the W3C CSS Filter Effects
 * 1 algorithm so consumer browsers reproduce the same output as
 * `filter: grayscale(0.5)`.
 */
function renderGrayscaleMatrix(amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const r = String(0.2126 + 0.7874 * (1 - a));
  const g = String(0.7152 - 0.7152 * (1 - a));
  const b = String(0.0722 - 0.0722 * (1 - a));
  const r2 = String(0.2126 - 0.2126 * (1 - a));
  const g2 = String(0.7152 + 0.2848 * (1 - a));
  const b2 = String(0.0722 - 0.0722 * (1 - a));
  const r3 = String(0.2126 - 0.2126 * (1 - a));
  const g3 = String(0.7152 - 0.7152 * (1 - a));
  const b3 = String(0.0722 + 0.9278 * (1 - a));
  const matrix = `${r} ${g} ${b} 0 0 ${r2} ${g2} ${b2} 0 0 ${r3} ${g3} ${b3} 0 0 0 0 0 1 0`;

  return `<feColorMatrix type="matrix" values="${matrix}"/>`;
}

function renderSepiaMatrix(amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const r = String(0.393 + 0.607 * (1 - a));
  const g = String(0.769 - 0.769 * (1 - a));
  const b = String(0.189 - 0.189 * (1 - a));
  const r2 = String(0.349 - 0.349 * (1 - a));
  const g2 = String(0.686 + 0.314 * (1 - a));
  const b2 = String(0.168 - 0.168 * (1 - a));
  const r3 = String(0.272 - 0.272 * (1 - a));
  const g3 = String(0.534 - 0.534 * (1 - a));
  const b3 = String(0.131 + 0.869 * (1 - a));
  const matrix = `${r} ${g} ${b} 0 0 ${r2} ${g2} ${b2} 0 0 ${r3} ${g3} ${b3} 0 0 0 0 0 1 0`;

  return `<feColorMatrix type="matrix" values="${matrix}"/>`;
}

/**
 * `invert(a)` per CSS: out = 1 - 2a + 2a*in, clamped. Implemented
 * via `<feComponentTransfer>` with linear funcR/G/B. Same form
 * works for `brightness(a)` (slope=a, intercept=0) and
 * `contrast(a)` (slope=a, intercept=0.5*(1-a)).
 */
function renderInvertComponentTransfer(amount: number): string {
  const slope = String(1 - 2 * amount);
  const intercept = String(amount);

  return `<feComponentTransfer data-bs-filter-primitive="invert"><feFuncR type="linear" slope="${slope}" intercept="${intercept}"/><feFuncG type="linear" slope="${slope}" intercept="${intercept}"/><feFuncB type="linear" slope="${slope}" intercept="${intercept}"/></feComponentTransfer>`;
}

function renderBrightnessComponentTransfer(amount: number): string {
  const slope = String(amount);

  return `<feComponentTransfer data-bs-filter-primitive="brightness"><feFuncR type="linear" slope="${slope}"/><feFuncG type="linear" slope="${slope}"/><feFuncB type="linear" slope="${slope}"/></feComponentTransfer>`;
}

function renderContrastComponentTransfer(amount: number): string {
  const slope = String(amount);
  const intercept = String((1 - amount) / 2);

  return `<feComponentTransfer data-bs-filter-primitive="contrast"><feFuncR type="linear" slope="${slope}" intercept="${intercept}"/><feFuncG type="linear" slope="${slope}" intercept="${intercept}"/><feFuncB type="linear" slope="${slope}" intercept="${intercept}"/></feComponentTransfer>`;
}

/**
 * Render a `<pattern>` def for `fill.kind === 'pattern'` /
 * `'picture'`. The pattern body references the asset id as the
 * `<image href>`; consumers resolve assets via their own registry.
 */
function renderPatternDef(
  id: string,
  fill: PatternFill | PictureFill,
  elementWidth: number,
  elementHeight: number,
  assetResolver?: (assetId: string) => string | undefined,
): string {
  const width = elementWidth > 0 ? elementWidth : 100;
  const height = elementHeight > 0 ? elementHeight : 100;
  // SVG pattern coords: `userSpaceOnUse` so width/height align with
  // the element's user-space box. Repeat is implicit (pattern tiles)
  // unless the caller is a `picture` fill with mode `'stretch'` —
  // the pattern matches the element exactly so a single image fills
  // the box without tiling.
  const patternUnits = 'userSpaceOnUse';
  // Resolve the asset id to a URL the consumer can fetch (data:
  // URI for embedded bytes, https: for hosted, etc.). Without a
  // resolver, fall back to the asset id verbatim — the resulting
  // SVG is structurally correct but won't render in standalone
  // viewers without an external asset registry. P7.7j adds the
  // resolver hook to close the spec line-23 contract; P7.7l
  // rejects unsafe schemes (javascript:, data:text/html) returned
  // by a malicious or compromised resolver.
  const resolved = assetResolver?.(fill.assetId) ?? fill.assetId;
  const href = isAllowedImageUrlScheme(resolved) ? resolved : '';
  const inner = `<image href="${escapeXml(href)}" xlink:href="${escapeXml(href)}" width="${String(width)}" height="${String(height)}" preserveAspectRatio="${fill.kind === 'picture' && fill.mode === 'stretch' ? 'none' : 'xMidYMid meet'}"/>`;

  return `<pattern id="${id}" patternUnits="${patternUnits}" width="${String(width)}" height="${String(height)}">${inner}</pattern>`;
}

/**
 * Render a `<mask>` def for an element with a custom mask path.
 * The mask's `<path>` carries the supplied `customClipPath` `d` value;
 * the element references it via `mask="url(#…)"`.
 */
function renderMaskDef(id: string, maskPath: string, fillCss: string): string {
  // SVG mask convention: white = visible, black = hidden. The
  // path fills with `fillCss` (white by default) so the masked
  // shape shows through the path's geometry.
  return `<mask id="${id}" maskUnits="userSpaceOnUse"><path d="${escapeXml(maskPath)}" fill="${escapeXml(fillCss)}"/></mask>`;
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
 * Render the inner body of a `<text>` element. Plain `string`
 * content emits as escaped text; structured `TextBody` content
 * emits one `<tspan>` per `Run` per `Paragraph`, carrying any
 * run-level style overrides (`font-family`, `font-size`,
 * `font-weight`, `font-style`, `fill`) so per-run styling
 * survives the export. Closes the spec feature-matrix promise
 * "Multi-run styled text → native (`<tspan>` per run)".
 */
function renderTextInner(content: string | TextBody): string {
  if (typeof content === 'string') {
    return escapeXml(content);
  }

  if (isSingleEmptyRunBody(content)) {
    return '';
  }

  const segments: string[] = [];

  for (let i = 0; i < content.paragraphs.length; i++) {
    const paragraph = content.paragraphs[i];

    if (paragraph === undefined) continue;

    segments.push(...renderParagraphRuns(paragraph.runs, i === 0));
  }

  return segments.join('');
}

function isSingleEmptyRunBody(body: TextBody): boolean {
  if (body.paragraphs.length === 0) return true;
  if (body.paragraphs.length !== 1) return false;

  const onlyPar = body.paragraphs[0];

  return onlyPar?.runs.length === 1 && (onlyPar.runs[0]?.text ?? '') === '';
}

function renderParagraphRuns(runs: readonly Run[], isFirstParagraph: boolean): readonly string[] {
  const segments: string[] = [];

  for (let r = 0; r < runs.length; r++) {
    const run = runs[r];

    if (run === undefined) continue;

    // Paragraph break: `dy="1em"` advances the baseline by one
    // line-height. The first paragraph stays at the parent
    // `<text>`'s baseline; subsequent paragraphs shift down.
    const advance = r === 0 && !isFirstParagraph ? ' x="0" dy="1em"' : '';

    segments.push(`<tspan${advance}${buildRunAttrs(run)}>${escapeXml(run.text)}</tspan>`);
  }

  return segments;
}

/**
 * Convert a `Run`'s optional style overrides (`font-family`,
 * `font-size`, `font-weight`, `font-style`, `fill` /
 * `fontColor`) into the `<tspan>`-attribute string the exporter
 * emits. Every other key on `props.style` is passed through as a
 * generic CSS `style=…` declaration so callers don't lose
 * authored overrides the schema doesn't yet narrow.
 */
/**
 * Map of `RunProps.style` camelCase keys to the equivalent SVG
 * attribute name. Keys that aren't in this map fall through to a
 * generic `style="…"` declaration so callers don't lose authored
 * overrides the schema doesn't yet narrow.
 */
const RUN_STYLE_TO_SVG_ATTR: ReadonlyMap<string, string> = new Map([
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['fontWeight', 'font-weight'],
  ['fontStyle', 'font-style'],
  ['fontColor', 'fill'],
  ['fill', 'fill'],
  ['textDecoration', 'text-decoration'],
]);

function buildRunAttrs(run: Run): string {
  const style = run.props?.style;

  if (style === undefined) return '';

  const attrs: string[] = [];
  const cssDecls: string[] = [];

  for (const [key, value] of Object.entries(style)) {
    const stringValue = stringifyRunStyleValue(value);

    if (stringValue === '') continue;

    const attrName = RUN_STYLE_TO_SVG_ATTR.get(key);

    if (attrName !== undefined) {
      attrs.push(`${attrName}="${escapeXml(stringValue)}"`);
    } else {
      cssDecls.push(`${camelToKebab(key)}:${stringValue}`);
    }
  }

  if (cssDecls.length > 0) {
    attrs.push(`style="${escapeXml(cssDecls.join(';'))}"`);
  }

  return attrs.length > 0 ? ' ' + attrs.join(' ') : '';
}

function stringifyRunStyleValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);

  return '';
}

function camelToKebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
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
  readonly assetResolver?: ((assetId: string) => string | undefined) | undefined;
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

function renderElement(
  el: BroadsetElement,
  defs: DefsCollector,
  childrenByParent: ReadonlyMap<string, readonly BroadsetElement[]>,
  fingerprints: ReadonlyMap<string, string>,
  options: RenderElementOptions,
): string {
  const flatSubstitute = options.flattenedTextElements.get(el.id);

  if (flatSubstitute !== undefined) {
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

  const transform = buildTransform(el);
  const styleAttrs = buildStyleAttrs(el.style);
  const clipAttr = collectClipAttr(el, defs);
  const maskAttr = collectMaskAttr(el, defs);
  const gradientFill = collectGradientFillOverride(el, defs);
  const patternFill = collectPatternFillOverride(el, defs, options.assetResolver);
  const fillOverride = gradientFill !== '' ? gradientFill : patternFill;
  // `style.filter` (structured FilterStack) is the modern path;
  // `style.boxShadow` is the legacy CSS shadow string. The
  // structured filter wins when both are present — `boxShadow`
  // is folded into the same `<feDropShadow>` primitive on import.
  const structuredFilterAttr = collectStructuredFilterAttr(el, defs);
  const shadowFilterAttr = collectShadowFilterAttr(el, defs);
  const filterAttr = structuredFilterAttr !== '' ? structuredFilterAttr : shadowFilterAttr;
  const markerAttrs = collectArrowMarkerAttrs(el, defs);
  const tagAttrs =
    options.includeElementTagging ? buildElementTagAttrs(el, resolveFingerprint(fingerprints, el.id)) : '';
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
      const resolvedHref = resolveImageHref(el, options.assetResolver);

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
  const fontEmbedding = options?.fontEmbedding ?? 'embed';
  const defs = new DefsCollector();
  const fontPlan: FontEmbedPlan = planFontEmbedding(doc, fontEmbedding, options?.fonts);
  const fingerprints = await computeFingerprints(doc.elements);
  const childrenByParent = buildChildrenByParent(doc.elements);
  const rootElements = doc.elements.filter((el) => !hasNonEmptyParentId(el));
  const elementNodes = rootElements.map((el) =>
    renderElement(el, defs, childrenByParent, fingerprints, {
      includeElementTagging,
      flattenedTextElements: fontPlan.flattenedTextElements,
      ...(options?.assetResolver !== undefined ? { assetResolver: options.assetResolver } : {}),
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
