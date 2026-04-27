import {
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyleInput,
  type BroadsetFill,
  type BroadsetGradient,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type DataFieldBinding,
  type RepeaterConfig,
} from '@broadset/model';
import { compose as composeMatrix, type Matrix } from 'transformation-matrix';

import { applyStyleBlocks } from './import-css';
import {
  buildDefsBundle,
  type DefsBundle,
  resolveClipPath,
  resolveFilterStack,
  resolveGradientFill,
  resolveMaskPath,
  resolvePatternFill,
} from './import-defs';
import {
  importCircleElement,
  importEllipseElement,
  importImageElement,
  importPathElement,
  importPolygonElement,
  importRectElement,
} from './import-shapes';
import { importTextElement } from './import-text';
import { type ImportedElement, type ShapeBakeContext, type TransformState } from './import-types';
import { type ParsedElementMetadata, parseMetadataPacket } from './metadata';
import { type DecomposedTransform, decomposeMatrix, parseAndDecomposeTransform } from './transform';
import type { SvgFontSource, SvgImportOptions } from './types';

const USE_DEREFERENCE_DEPTH_CAP = 16;
/**
 * Element-count cap per the importer security contract
 * (`project/spec/formats/spec.md` → "Input Size, Depth, and Entry
 * Caps"). Realistic Broadset / Illustrator / Inkscape / Figma SVGs
 * never exceed a few thousand elements; 10 000 is generous for a
 * complex icon-heavy document. Above this the importer surfaces a
 * warning per IO-D-18 and stops iterating instead of allowing an
 * O(n) sanitiser × O(n) style-resolver × O(n) walker O(n³)
 * pathological run on a hostile input.
 */
const SVG_ELEMENT_COUNT_CAP = 10_000;
/**
 * Group-depth cap per the importer security contract. Bounds the
 * recursion in `importGroupElement` so a deeply nested `<g>` chain
 * cannot overflow the V8 stack. 100 levels covers any realistic
 * design-tool layer hierarchy.
 */
const SVG_GROUP_DEPTH_CAP = 100;
const TOOL_NAMESPACE_WARNINGS: readonly { readonly prefix: string; readonly label: string }[] = [
  { prefix: 'sodipodi', label: 'sodipodi' },
  { prefix: 'inkscape', label: 'inkscape' },
  { prefix: 'ai', label: 'Illustrator (ai:)' },
];

/**
 * DOMPurify config for the third-party SVG import path. Extends
 * `_shared/sanitize/`'s Broadset SVG policy with:
 *
 * - `ADD_TAGS`: `use` / `symbol` / vendor elements (`meshgradient`,
 *   `meshrow`) so `dereferenceUseElements` and opaque-payload
 *   preservation can see them. DOMPurify's default SVG profile
 *   strips these because they can reference external resources; we
 *   constrain that separately via the same-document `href="#..."`
 *   check in `dereferenceUseElements` + reference-cycle depth cap.
 * - `ALLOW_DATA_ATTR`: true, so `data-bs-*` markers (when present)
 *   survive the fallback path and reconciliation (P7.5) can still
 *   use them as fallback identity.
 *
 * `FORBID_TAGS` and `FORBID_ATTR` still enforce the importer
 * security contract floor: `<script>`, `<foreignObject>`, and
 * `on*=` event handlers are removed. `javascript:` URLs are
 * stripped by DOMPurify's built-in URL sanitizer.
 */
const FORBIDDEN_ELEMENT_NAMES = new Set(['script', 'foreignobject']);
const URL_ATTRS_TO_CHECK = ['href', 'xlink:href', 'src'];

/**
 * DOM-walk sanitizer used on the parsed XML tree. Enforces the
 * importer security contract floor — strips `<script>`,
 * `<foreignObject>`, `on*=` event handlers, and `javascript:` URLs
 * — while preserving structural elements that would be destroyed
 * by DOMPurify's aggressive SVG profile: `<use>` / `<symbol>`,
 * `<metadata>` with its `broadset:` / `rdf:` namespaced children
 * (needed by the fast-path packet parse), and arbitrary vendor
 * elements which become opaque `svg`-type preservations per
 * IO-D-18.
 *
 * DOMPurify is still the sole *re-emission* sanitization entry
 * point: `svg/export.ts` → `renderSvgPayload` calls
 * `_shared/sanitize/sanitizeSvg` on opaque `svg`-type content at
 * write-time. The DOM-walk enforcement here is narrower in scope
 * (four attack vectors only) and purpose-built for parse-time,
 * where full DOMPurify would clobber the round-trip metadata.
 *
 * Running on both the fast-path and third-party paths (post-parse,
 * pre-extract) closes the security-audit C1 fast-path bypass.
 */
interface SanitizeTally {
  readonly tags: Set<string>;
  readonly attrs: Set<string>;
  jsUrls: number;
}

function stripEventHandlerAttrsFromEl(el: Element, tally: SanitizeTally): void {
  const toRemove: string[] = [];

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];

    if (!attr) {
      continue;
    }

    const name = attr.name.toLowerCase();

    if (/^on[a-z]+$/i.test(name)) {
      toRemove.push(attr.name);
      tally.attrs.add(name);
    }
  }

  for (const name of toRemove) {
    el.removeAttribute(name);
  }
}

function stripJavascriptUrlsFromEl(el: Element, tally: SanitizeTally): void {
  for (const urlAttr of URL_ATTRS_TO_CHECK) {
    const val = el.getAttribute(urlAttr);

    if (val !== null && /^\s*javascript:/i.test(val)) {
      el.removeAttribute(urlAttr);
      tally.jsUrls += 1;
    }
  }
}

/**
 * Sanitises the parsed XML in-place and enforces the element-count
 * cap. Returns `true` when the document is within the cap (the
 * caller continues with the visual walk); returns `false` when the
 * cap was hit (a warning has been emitted and the caller should
 * still hydrate what was parsed but skip subsequent O(n) passes).
 */
function sanitizeDomInPlace(xmlDoc: Document, warnings: string[]): boolean {
  const tally: SanitizeTally = { tags: new Set(), attrs: new Set(), jsUrls: 0 };
  const all = Array.from(xmlDoc.getElementsByTagName('*'));
  const overCap = all.length > SVG_ELEMENT_COUNT_CAP;
  const limit = overCap ? SVG_ELEMENT_COUNT_CAP : all.length;

  for (let i = 0; i < limit; i++) {
    const el = all[i];

    if (!el) {
      continue;
    }

    const tag = el.tagName.toLowerCase();

    if (FORBIDDEN_ELEMENT_NAMES.has(tag)) {
      el.remove();
      tally.tags.add(tag);
      continue;
    }

    stripEventHandlerAttrsFromEl(el, tally);
    stripJavascriptUrlsFromEl(el, tally);
  }

  for (const tag of tally.tags) {
    warnings.push(`Stripped <${tag}> during sanitization (importer security contract).`);
  }

  for (const attr of tally.attrs) {
    warnings.push(`Stripped event-handler attribute ${attr} during sanitization (importer security contract).`);
  }

  if (tally.jsUrls > 0) {
    warnings.push('Stripped javascript: URL during sanitization (importer security contract).');
  }

  if (overCap) {
    warnings.push(
      `Element-count cap of ${String(SVG_ELEMENT_COUNT_CAP)} reached (input had ${String(all.length)} elements). Sanitisation truncated; remaining elements were not validated.`,
    );

    return false;
  }

  return true;
}

/**
 * Walk the sanitized DOM and dereference every `<use>` element in
 * place by substituting a clone of its referenced `<symbol>` (or
 * bare node) contents. Detects `<use>` cycles up to a bounded
 * follow depth and emits a warning per the importer security
 * contract §Reference-Cycle Caps.
 */
function collectSymbolsById(xmlDoc: Document): ReadonlyMap<string, Element> {
  const symbolById = new Map<string, Element>();
  const symbols = xmlDoc.getElementsByTagName('symbol');

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];

    if (!sym) {
      continue;
    }

    const id = sym.getAttribute('id');

    if (id !== null && id !== '') {
      symbolById.set(id, sym);
    }
  }

  return symbolById;
}

function asElementArray(collection: HTMLCollectionOf<Element>): Element[] {
  const out: Element[] = [];

  for (let i = 0; i < collection.length; i++) {
    const item = collection[i];

    if (item) {
      out.push(item);
    }
  }

  return out;
}

function buildSymbolReplacement(xmlDoc: Document, symbol: Element): Element {
  const replacement = xmlDoc.createElementNS('http://www.w3.org/2000/svg', 'g');

  for (let i = 0; i < symbol.childNodes.length; i++) {
    const child = symbol.childNodes[i];

    if (child) {
      replacement.appendChild(child.cloneNode(true));
    }
  }

  return replacement;
}

function dereferenceUseElements(xmlDoc: Document, warnings: string[]): void {
  const symbolById = collectSymbolsById(xmlDoc);

  function replaceUse(useEl: Element, seen: ReadonlySet<string>, depth: number): void {
    if (depth > USE_DEREFERENCE_DEPTH_CAP) {
      warnings.push(`<use> dereference depth cap of ${String(USE_DEREFERENCE_DEPTH_CAP)} reached; stopping recursion.`);

      return;
    }

    const href = useEl.getAttribute('href') ?? useEl.getAttribute('xlink:href');

    if (!href?.startsWith('#')) {
      return;
    }

    const id = href.slice(1);

    if (seen.has(id)) {
      warnings.push(`Detected <use> cycle at id "${id}"; skipping to avoid unbounded recursion.`);
      useEl.remove();

      return;
    }

    const symbol = symbolById.get(id);
    const parent = useEl.parentNode;

    if (symbol === undefined || parent === null) {
      return;
    }

    const nextSeen = new Set(seen).add(id);
    const replacement = buildSymbolReplacement(xmlDoc, symbol);
    const nestedList = asElementArray(replacement.getElementsByTagName('use'));

    for (const nested of nestedList) {
      replaceUse(nested, nextSeen, depth + 1);
    }

    parent.replaceChild(replacement, useEl);
  }

  for (const u of asElementArray(xmlDoc.getElementsByTagName('use'))) {
    replaceUse(u, new Set(), 0);
  }
}


/**
 * Scan the document for attributes in recognised tool-specific
 * namespaces (`sodipodi:`, `inkscape:`, `ai:`) and emit one warning
 * per unique namespace present. The elements still import natively;
 * the warning documents the preservation for the user.
 */
function detectNamespaceOnAttribute(attrName: string, emitted: ReadonlySet<string>): string | null {
  for (const ns of TOOL_NAMESPACE_WARNINGS) {
    if (attrName.startsWith(`${ns.prefix}:`) && !emitted.has(ns.label)) {
      return ns.label;
    }
  }

  return null;
}

function checkElementNamespaces(el: Element, emitted: Set<string>, warnings: string[]): void {
  for (let j = 0; j < el.attributes.length; j++) {
    const attr = el.attributes[j];

    if (!attr) {
      continue;
    }

    const label = detectNamespaceOnAttribute(attr.name, emitted);

    if (label !== null) {
      warnings.push(
        `Preserved ${label} namespace attributes on native elements; vendor metadata is not natively mapped.`,
      );
      emitted.add(label);
    }
  }
}

function warnToolNamespaces(xmlDoc: Document, warnings: string[]): void {
  const emitted = new Set<string>();
  const all = xmlDoc.getElementsByTagName('*');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];

    if (el) {
      checkElementNamespaces(el, emitted, warnings);
    }
  }
}

/**
 * Scan the raw input string for tool-specific namespace prefixes
 * before sanitization strips them. DOMPurify's SVG profile removes
 * namespaced attributes whose namespace isn't declared on an
 * allowed list, so by the time we walk the sanitized DOM those
 * attrs are gone. A source-text regex scan catches them first and
 * emits the preservation warning.
 */
function warnRawToolNamespaces(input: string, warnings: string[]): void {
  const emitted = new Set<string>();

  for (const ns of TOOL_NAMESPACE_WARNINGS) {
    // Look for `<tag prefix:attr=` or ` prefix:attr=` anywhere in
    // the source. Linear time per IO-D regex safety rule.
    const pattern = new RegExp(`(?:<|\\s)${ns.prefix}:[a-zA-Z][a-zA-Z0-9-]*\\s*=`);

    if (pattern.test(input) && !emitted.has(ns.label)) {
      warnings.push(
        `Preserved ${ns.label} namespace attributes on native elements; vendor metadata is not natively mapped.`,
      );
      emitted.add(ns.label);
    }
  }
}

export interface SvgImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

export interface SvgDocumentImportResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function parseTransform(transformStr: string): {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly requiresBake: boolean;
  readonly matrix: DecomposedTransform['matrix'];
} {
  const decomposed = parseAndDecomposeTransform(transformStr);

  return {
    x: decomposed.tx,
    y: decomposed.ty,
    rotation: decomposed.rotation,
    requiresBake: decomposed.requiresBake,
    matrix: decomposed.matrix,
  };
}

function combineTransform(base: TransformState, next: TransformState): TransformState {
  // Always compose matrices and re-decompose. The previous
  // additive fast-path (when neither side baked) silently dropped
  // the cumulative matrix to identity, causing ancestor translates
  // to vanish the moment a descendant baked (P7 review finding).
  // Matrix composition is cheap and the decomposition pipeline is
  // shared with `parseAndDecomposeTransform` so the skew / NaN
  // logic lives in one place.
  const composed = composeMatrix(base.matrix, next.matrix);
  const decomposed = decomposeMatrix(composed);

  return {
    x: decomposed.tx,
    y: decomposed.ty,
    rotation: decomposed.rotation,
    matrix: decomposed.matrix,
    // The CUMULATIVE matrix is the source of truth — its
    // `requiresBake` flag captures whether the composed scale /
    // skew survives. ORing in `base.requiresBake` was wrong: a
    // `<g scale(2)><g scale(0.5)>` chain composes to identity, no
    // bake needed, but the sticky OR baked the leaf to a path
    // anyway (P7 review finding). Trust the decomposition.
    requiresBake: decomposed.requiresBake,
  };
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/**
 * Look up `name` on `el`; if absent, walk `parentElement` up
 * until a value is found or the root is hit. Implements SVG 1.1
 * presentation-attribute inheritance (§6.4 / §11.4) — without
 * this, real-world icon fixtures (Heroicons, Material Icons,
 * etc.) lose root-level `stroke` / `fill` / `stroke-width`
 * declared on the wrapping `<svg>`.
 */
function getInheritedAttr(el: Element, name: string): string | null {
  let cursor: Element | null = el;

  while (cursor !== null) {
    const value = cursor.getAttribute(name);

    if (value !== null && value !== '') {
      return value;
    }

    cursor = cursor.parentElement;
  }

  return null;
}

/**
 * Read inherited stroke style overrides (`stroke-width`,
 * `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`,
 * `stroke-dasharray`, `stroke-dashoffset`) from the element or
 * any ancestor. Each maps to the camelCase Broadset style key.
 * Returns an object that's spread into the importer's
 * `baseStyle`; absent attrs are omitted entirely.
 */
function readInheritedStrokeStyle(el: Element): Partial<BroadsetElementStyleInput> {
  const out: Record<string, string | number> = {};
  const widthRaw = getInheritedAttr(el, 'stroke-width');
  const linecap = getInheritedAttr(el, 'stroke-linecap');
  const linejoin = getInheritedAttr(el, 'stroke-linejoin');
  const miterRaw = getInheritedAttr(el, 'stroke-miterlimit');
  const dasharray = getInheritedAttr(el, 'stroke-dasharray');
  const dashoffsetRaw = getInheritedAttr(el, 'stroke-dashoffset');

  if (widthRaw !== null) {
    const width = parseFloat(widthRaw);

    if (Number.isFinite(width)) out['strokeWidth'] = width;
  }

  if (linecap === 'butt' || linecap === 'round' || linecap === 'square') {
    out['strokeLinecap'] = linecap;
  }

  if (linejoin === 'miter' || linejoin === 'round' || linejoin === 'bevel') {
    out['strokeLinejoin'] = linejoin;
  }

  if (miterRaw !== null) {
    const miter = parseFloat(miterRaw);

    if (Number.isFinite(miter)) out['strokeMiterlimit'] = miter;
  }

  if (dasharray !== null && dasharray !== '') {
    out['strokeDasharray'] = dasharray;
  }

  if (dashoffsetRaw !== null) {
    const dashoffset = parseFloat(dashoffsetRaw);

    if (Number.isFinite(dashoffset)) out['strokeDashoffset'] = dashoffset;
  }

  return out as Partial<BroadsetElementStyleInput>;
}

function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}


function importUnsupportedElement(el: Element, transform: TransformState, warnings: string[]): ImportedElement {
  const tagName = el.tagName.toLowerCase();

  warnings.push(`Preserved unsupported SVG element as payload: <${tagName}>`);

  return {
    type: 'svg',
    content: el.outerHTML,
    position: { x: transform.x, y: transform.y },
    width: getNumAttr(el, 'width', 0),
    height: getNumAttr(el, 'height', 0),
    rotation: transform.rotation,
    style: {},
  };
}

interface GroupImportContext {
  readonly transformStr: string;
  readonly transform: TransformState;
  readonly baseStyle: Partial<BroadsetElementStyleInput>;
  readonly ownDataBsId: string | undefined;
  readonly ownDataBsKind: string | undefined;
  readonly tagMeta: Readonly<{
    readonly dataBsId?: string;
    readonly dataBsKind?: string;
    readonly parentDataBsId: string | null;
  }>;
  readonly parentDataBsId: string | null;
  readonly defs: DefsBundle;
  readonly warnings: string[];
  readonly depth: number;
  readonly fontSources?: ReadonlyMap<string, SvgFontSource> | undefined;
}

/**
 * Handle the `<g>` element case during the visual walk. The group
 * descends into children and links them via `parentDataBsId`. When
 * the group's transform requires bake (scale / skew / non-
 * decomposable matrix), the cumulative matrix is threaded down
 * through `ctx.transform.matrix` so each leaf shape pre-multiplies
 * its geometry instead of trying to store an unrepresentable
 * transform on the group itself (Broadset has no group-level scale
 * / skew per IO-D-02).
 *
 * Tagged groups (`data-bs-id`) emit a `'group'` element so the
 * round-trip fast path can rebuild the parent tree; the group's
 * own position is taken from the cumulative translate so an
 * inherited bake-transform still leaves the group anchor at the
 * correct point.
 */
function importGroupElement(el: Element, ctx: GroupImportContext): ImportedElement[] {
  if (ctx.depth >= SVG_GROUP_DEPTH_CAP) {
    ctx.warnings.push(
      `Group depth cap of ${String(SVG_GROUP_DEPTH_CAP)} reached; deeper nesting was not imported (recursion bounded for safety).`,
    );

    return [];
  }

  // Spec §"Group-Preserving Import": EVERY <g> produces a
  // 'group' element with children linked via parentId. Earlier
  // loops only emitted a group when the source DOM carried an
  // identity attribute (data-bs-id or id), which silently flattened
  // unnamed groups from Figma / Illustrator / Inkscape. We now
  // synthesise a stable ID derived from the element's DOM path
  // when neither is present so the parentId chain survives.
  const groupId = ctx.ownDataBsId ?? synthesiseGroupId(el);
  const importedChildren: ImportedElement[] = [];

  importedChildren.push({
    type: ctx.ownDataBsKind ?? 'group',
    content: '',
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    // When the cumulative transform requires bake, rotation is
    // baked into children's geometry — keep the group's stored
    // rotation at zero to avoid double-applying it.
    rotation: ctx.transform.requiresBake ? 0 : ctx.transform.rotation,
    style: ctx.baseStyle,
    dataBsId: groupId,
    ...(ctx.ownDataBsKind !== undefined ? { dataBsKind: ctx.ownDataBsKind } : {}),
    parentDataBsId: ctx.parentDataBsId,
  });

  const children = el.children;
  const childParentId = groupId;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    importedChildren.push(
      ...importElement(
        child,
        ctx.defs,
        ctx.warnings,
        ctx.transform,
        childParentId,
        ctx.depth + 1,
        ctx.fontSources,
      ),
    );
  }

  return importedChildren;
}

/**
 * Stable synthetic id prefix for `<g>` elements that source DOM
 * carries no explicit identity for. The path-from-root encoding
 * survives byte-stable round-trips while keeping the id format
 * grep-friendly. Used by `isSyntheticGroupId` so the layer panel
 * can display a friendly name instead of the structural path.
 */
/**
 * Stable synthetic-id prefix for `<g>` elements that lack a
 * source DOM identity. Uses the `__bs-` Broadset-internal
 * sentinel so the regex used by `isSyntheticGroupId` cannot
 * collide with user-authored ids like `<g id="g-3">` (common in
 * d3 / hand-authored / Inkscape outputs). Closes the P7.7i
 * review #5 collision finding.
 */
const SYNTHETIC_GROUP_ID_PREFIX = '__bs-g-';

/**
 * Produce a stable synthetic id for a `<g>` whose source DOM has
 * neither `data-bs-id` nor `id`. The id encodes the element's path
 * from the document root (`g-<idx>-<idx>-…`) so re-imports of the
 * same byte stream produce the same parentId chain — a property
 * the chain-round-trip suite depends on.
 */
function synthesiseGroupId(el: Element): string {
  const segments: string[] = [];
  let cursor: Element = el;

  for (;;) {
    const parent: Element | null = cursor.parentElement;

    if (parent === null) break;

    const siblings = parent.children;
    let index = 0;

    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i] === cursor) {
        index = i;
        break;
      }
    }

    segments.unshift(String(index));
    cursor = parent;
  }

  return `${SYNTHETIC_GROUP_ID_PREFIX}${segments.join('-')}`;
}

/**
 * `true` when an id was produced by `synthesiseGroupId`. Lets
 * the hydrator use a friendly display `name` for these groups
 * (`'Group'`) rather than the structural path id, so the layer
 * panel shows readable names for unnamed third-party groups.
 */
function isSyntheticGroupId(id: string): boolean {
  // Match the exact `__bs-g-N(-N)*` shape `synthesiseGroupId`
  // emits. The `__bs-` sentinel is not a legal Broadset element
  // id pattern in user-authored SVGs, so this regex never fires
  // a false positive on a third-party `<g id="g-3">`.
  return /^__bs-g-\d+(-\d+)*$/.test(id);
}


function importElement(
  el: Element,
  defs: DefsBundle,
  warnings: string[],
  inheritedTransform: TransformState,
  parentDataBsId: string | null = null,
  depth = 0,
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defs.clipPaths);
  // Presentation attributes inherit from ancestor elements per
  // SVG 1.1 §6.4 / §11.4 (e.g., `<svg stroke="currentColor"
  // stroke-width="1.5">` cascades to every `<path>` descendant).
  // `getInheritedAttr` walks `parentElement` up until it finds
  // a value or hits the root — without this, real-world icon
  // fixtures (Heroicons, Material Icons, etc.) lose their root-
  // level stroke / fill.
  const fill = getInheritedAttr(el, 'fill');
  const stroke = getInheritedAttr(el, 'stroke');
  // P7.7l: resolve `<filter>`, `<mask>`, and `<pattern>` defs so
  // re-importing a Broadset-exported SVG round-trips the filter
  // stack, mask geometry, and pattern fills (export emits these,
  // import had been ignoring them). Pattern fill resolution wins
  // over gradient when both match — the importer mirrors the
  // exporter's def-id discriminator (gradient vs pattern).
  const gradient = resolveGradientFill(fill, defs.gradients);
  const pattern = resolvePatternFill(fill, defs.patterns);
  const filterStack = resolveFilterStack(getInheritedAttr(el, 'filter'), defs.filters);
  const maskPath = resolveMaskPath(getAttr(el, 'mask'), defs.masks);
  const strokeStyle = readInheritedStrokeStyle(el);
  // Mask path takes precedence over clip-path: an element carrying
  // both is rare, and the export pipeline only emits one. The
  // importer mirrors that — either is stored as `customClipPath`,
  // and the `maskType` flag distinguishes the two on round-trip.
  const effectiveClipPath = maskPath ?? clipPath;
  const isFillFromGradientOrPattern = gradient !== undefined || pattern !== undefined;
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(effectiveClipPath !== undefined ? { customClipPath: effectiveClipPath } : undefined),
    ...(maskPath !== undefined ? { maskType: 'alpha' } : undefined),
    ...(pattern !== undefined ? { fill: pattern } : undefined),
    ...(fill !== null && !isFillFromGradientOrPattern ? { fill } : undefined),
    ...(stroke !== null ? { stroke } : undefined),
    ...(gradient !== undefined ? { backgroundGradient: gradient } : undefined),
    ...(filterStack !== undefined ? { filter: filterStack } : undefined),
    ...strokeStyle,
  };
  const ownDataBsId = el.getAttribute('data-bs-id') ?? undefined;
  const ownDataBsKind = el.getAttribute('data-bs-kind') ?? undefined;
  // When `data-bs-id` is absent (third-party SVGs from Illustrator
  // / Inkscape / Figma), fall back to the source DOM `id` so
  // group hierarchy survives the walk and the third-party hydrator
  // can rebuild `parentId` chains. The fast-path metadata gate
  // (`parseMetadataPacket` returns null for non-Broadset SVGs) is
  // checked before this code path uses the value as a metadata key,
  // so the two namespaces never collide.
  const sourceId = el.getAttribute('id') ?? undefined;
  const effectiveId = ownDataBsId ?? sourceId;
  const tagMeta = {
    ...(effectiveId !== undefined ? { dataBsId: effectiveId } : {}),
    ...(ownDataBsKind !== undefined ? { dataBsKind: ownDataBsKind } : {}),
    parentDataBsId,
  } as const;

  const shapeCtx: ShapeBakeContext = { transform, baseStyle, tagMeta };
  // For tagged leaf elements only: capture the source DOM
  // `outerHTML` so the exporter can re-emit byte-identical markup
  // when `extensions.svg.dirty === false`. Groups are excluded —
  // their preservation would double-render children since the
  // children also carry their own preserved markup.
  const preservedOuterHTML = effectiveId !== undefined && tagName !== 'g' ? el.outerHTML : undefined;
  const withPreserved = (result: readonly ImportedElement[]): ImportedElement[] => {
    if (preservedOuterHTML === undefined) return [...result];

    return result.map((r) => ({ ...r, preservedOuterHTML }));
  };

  switch (tagName) {
    case 'rect':
      return withPreserved([importRectElement(el, shapeCtx)]);

    case 'path':
      return withPreserved([importPathElement(el, shapeCtx)]);

    case 'ellipse':
      return withPreserved([importEllipseElement(el, shapeCtx)]);

    case 'circle':
      return withPreserved([importCircleElement(el, shapeCtx)]);

    case 'polygon':
      return withPreserved([importPolygonElement(el, shapeCtx, true)]);

    case 'polyline':
      return withPreserved([importPolygonElement(el, shapeCtx, false)]);

    case 'text':
      return withPreserved([importTextElement(el, shapeCtx, warnings, fontSources)]);

    case 'image':
      return withPreserved([importImageElement(el, shapeCtx, warnings)]);

    case 'g':
      return importGroupElement(el, {
        transformStr,
        transform,
        baseStyle,
        ownDataBsId: effectiveId,
        ownDataBsKind,
        tagMeta,
        parentDataBsId,
        defs,
        warnings,
        depth,
        fontSources,
      });

    // `<foreignObject>` is always stripped by `sanitizeDomInPlace`
    // before `importElement` runs. The branch that previously
    // preserved `el.outerHTML` as an opaque `svg`-type payload is
    // removed; if a future regression lets `<foreignObject>` reach
    // this switch, the `default` branch emits a safer
    // `importUnsupportedElement` fallback that does not carry the
    // unsanitized outerHTML into the Broadset document.

    default:
      return [{ ...importUnsupportedElement(el, transform, warnings), ...tagMeta }];
  }
}

export function importSvg(input: string): SvgImportResult {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');

  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

  return walkSvgDocument(xmlDoc);
}

function walkSvgDocument(xmlDoc: Document, fontSources?: ReadonlyMap<string, SvgFontSource>): SvgImportResult {
  const svgRoot = xmlDoc.documentElement;

  let canvasWidth = 800;
  let canvasHeight = 600;

  const widthAttr = svgRoot.getAttribute('width');
  const heightAttr = svgRoot.getAttribute('height');

  if (widthAttr && heightAttr) {
    canvasWidth = parseFloat(widthAttr);
    canvasHeight = parseFloat(heightAttr);
  } else {
    const viewBox = svgRoot.getAttribute('viewBox');

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);

      canvasWidth = parseFloat(parts[2] ?? '800');
      canvasHeight = parseFloat(parts[3] ?? '600');
    }
  }

  const defs = buildDefsBundle(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0, matrix: IDENTITY_MATRIX, requiresBake: false };
  // Bound the visual walk by the same element-count cap that gates
  // sanitisation. A hostile SVG with millions of root children would
  // otherwise still walk the whole tree once sanitisation truncates.
  const limit = Math.min(children.length, SVG_ELEMENT_COUNT_CAP);

  for (let i = 0; i < limit; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    elements.push(...importElement(child, defs, warnings, rootTransform, null, 0, fontSources));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}

/**
 * High-level SVG import entry point. Wraps the primitive element
 * extractor `importSvg` and produces a full `BroadsetDocument` plus a
 * warnings list that the demo surfaces through
 * `FormatImportWarningsModal`. Phase 7.1 threads existing behaviour
 * through this shape so `import-document.ts` can consume the svg
 * module via its public API. Phase 7.4 replaces the body with the
 * metadata-fast-path and arbitrary-source logic.
 */
export function importSvgDocument(
  input: string,
  fileName = 'Imported SVG',
  options?: SvgImportOptions,
): SvgDocumentImportResult {
  const fontSources = options?.fontSources;
  const warnings: string[] = [];

  // Detect tool-specific namespaces on the raw input before the
  // in-place sanitiser rewrites the DOM (namespace declarations on
  // the root element are preserved by the sanitiser, but a pre-parse
  // regex scan is more robust across DOMParser quirks).
  warnRawToolNamespaces(input, warnings);

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(input, 'image/svg+xml');
  const parseError = xmlDoc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`SVG import failed: invalid XML — ${parseError.textContent}`);
  }

  // Security-contract sanitisation runs on EVERY path — fast-path
  // and third-party fallback both consume the sanitised DOM.
  // Closes the fast-path bypass (security audit C1) where a
  // malicious SVG could declare the Broadset XMP namespace to route
  // hostile `<script>` / `on*=` / `javascript:` / `<foreignObject>`
  // content unsanitised. The walk preserves `<metadata>` /
  // `broadset:` / `rdf:` children so the round-trip packet parser
  // still sees the Broadset packet on the fast path.
  const withinCap = sanitizeDomInPlace(xmlDoc, warnings);

  const metadata = parseMetadataPacket(xmlDoc);

  if (metadata !== null) {
    return hydrateFastPath(xmlDoc, metadata, fileName, warnings, fontSources);
  }

  return hydrateThirdPartyFallbackFromDoc(xmlDoc, fileName, warnings, withinCap, fontSources);
}

/**
 * Hydrate a single tagged element (one with `data-bs-id`) using
 * the metadata packet's overrides and the visually-extracted
 * shape. Extracted from `hydrateFastPath` to keep that function's
 * cognitive complexity below the sonarjs threshold.
 */
function hydrateTaggedElement(
  visualEl: ImportedElement,
  metadataById: ReadonlyMap<string, ParsedElementMetadata>,
): BroadsetElement {
  const dataBsId = visualEl.dataBsId;

  if (dataBsId === undefined) {
    throw new Error('hydrateTaggedElement called with untagged visual element');
  }

  const sourceKind = visualEl.dataBsKind ?? pickDefaultKindFromVisual(visualEl.type);
  const meta = metadataById.get(dataBsId);
  const style = applyMetadataOverrides(visualEl.style, meta);
  const bindings = parseDataBindingMetadata(meta);
  const parentId = visualEl.parentDataBsId ?? null;
  const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

  return createDefaultElement(sourceKind, {
    id: dataBsId,
    name: resolveFriendlyName(meta?.name, dataBsId, sourceKind),
    position: { x: visualEl.position.x, y: visualEl.position.y },
    width: meta?.width ?? visualEl.width,
    height: meta?.height ?? visualEl.height,
    rotation: visualEl.rotation,
    content: visualEl.content,
    style,
    ...parentField,
    ...(visualEl.textPathElementId !== undefined ? { textPathElementId: visualEl.textPathElementId } : {}),
    ...(bindings.dataField !== undefined ? { dataField: bindings.dataField } : {}),
    ...(bindings.visibleWhen !== undefined ? { visibleWhen: bindings.visibleWhen } : {}),
    ...(bindings.repeater !== undefined ? { repeater: bindings.repeater } : {}),
    extensions: { svg: buildSvgExtensions(visualEl) },
  });
}

/**
 * Resolve the display `name` for a hydrated element. Prefers the
 * metadata-supplied `name`; falls back to the id but masks
 * synthetic group ids (`g-0-2-1`) with a friendly `'Group'` so
 * the layer panel doesn't expose internal path-derived noise.
 */
function resolveFriendlyName(metaName: string | undefined, dataBsId: string, sourceKind: string): string {
  if (typeof metaName === 'string' && metaName !== '') {
    return metaName;
  }

  if (sourceKind === 'group' && isSyntheticGroupId(dataBsId)) {
    return 'Group';
  }

  return dataBsId;
}

/**
 * Display name for an element on the third-party hydration path
 * (no metadata packet). Synthetic groups show "Group"; user-named
 * groups (and other elements with a `dataBsId`) use that id as
 * the name; everything else falls back to "Element N".
 */
function resolveImportedName(element: ImportedElement, id: string, sourceKind: string, index: number): string {
  if (sourceKind === 'group' && isSyntheticGroupId(id)) {
    return 'Group';
  }

  if (element.dataBsId !== undefined) {
    return element.dataBsId;
  }

  return `Element ${String(index + 1)}`;
}

/**
 * Build the `extensions.svg` payload for an imported element.
 * Always sets `dirty: false`; populates `preserved` when the
 * importer captured the source `outerHTML` so the exporter can
 * re-emit byte-identical markup for unchanged elements
 * (`SvgPreservedData` per `svgPreservedDataSchema`).
 */
function buildSvgExtensions(visualEl: ImportedElement): {
  readonly dirty: boolean;
  readonly preserved?: { readonly mime: string; readonly raw: string };
} {
  if (visualEl.preservedOuterHTML === undefined) {
    return { dirty: false };
  }

  return {
    dirty: false,
    preserved: { mime: 'image/svg+xml', raw: encodeBase64Utf8(visualEl.preservedOuterHTML) },
  };
}

/**
 * Encode a UTF-8 string as base64. Uses Node's `Buffer` when
 * available (test / build environments) and falls back to the
 * `btoa(unescape(encodeURIComponent(...)))` trick on the
 * browser. The roundtrip is symmetric with the exporter's
 * decoder so the cached bytes survive.
 */
function encodeBase64Utf8(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64');
  }

  // Browser path: UTF-8-encode the string into bytes, then
  // ASCII-stringify each byte for `btoa`. Avoids the deprecated
  // `escape` / `unescape` legacy helpers.
  const bytes = new TextEncoder().encode(s);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  return btoa(binary);
}

/**
 * Hydrate an untagged visual element using a synthesised id. Used
 * when the fast-path metadata packet is present but the element
 * itself has no `data-bs-id` (e.g., a shape inside a Broadset
 * group whose own tag survived but the child's tag was stripped).
 */
function hydrateUntaggedElement(visualEl: ImportedElement, fallbackIndex: number): BroadsetElement {
  const parentId = visualEl.parentDataBsId ?? null;
  const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

  return createDefaultElement(pickDefaultKindFromVisual(visualEl.type), {
    id: `imported-${String(fallbackIndex)}`,
    name: `Element ${String(fallbackIndex + 1)}`,
    position: { x: visualEl.position.x, y: visualEl.position.y },
    width: visualEl.width,
    height: visualEl.height,
    rotation: visualEl.rotation,
    content: visualEl.content,
    style: visualEl.style,
    ...parentField,
    ...(visualEl.textPathElementId !== undefined ? { textPathElementId: visualEl.textPathElementId } : {}),
    extensions: { svg: { dirty: false } },
  });
}

/**
 * Hydrate a Broadset-exported SVG via the fast path per
 * `project/spec/formats/svg.md` §"Standards-Only Round-Trip" —
 * preserve document id, canvas unit/dpi, element ids, structured
 * colour/gradient metadata, and initialise `extensions.svg.dirty`
 * to `false` per IO-D-11.
 */
function hydrateFastPath(
  xmlDoc: Document,
  metadata: ReturnType<typeof parseMetadataPacket> & object,
  fileName: string,
  warnings: string[],
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): SvgDocumentImportResult {
  const visualExtract = importSvgFromXmlDoc(xmlDoc, fontSources);
  const metadataById = new Map<string, ParsedElementMetadata>(
    metadata.elements.map((entry) => [entry.elementId, entry]),
  );
  const canvasWidth = visualExtract.canvasWidth;
  const canvasHeight = visualExtract.canvasHeight;
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...visualExtract.warnings);

  const hydrated: BroadsetElement[] = [];
  let fallbackIndex = 0;

  for (const visualEl of visualExtract.elements) {
    if (visualEl.dataBsId !== undefined) {
      hydrated.push(hydrateTaggedElement(visualEl, metadataById));
    } else {
      hydrated.push(hydrateUntaggedElement(visualEl, fallbackIndex));
      fallbackIndex += 1;
    }
  }

  const document: BroadsetDocument = {
    ...emptyDoc,
    id: metadata.documentId,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: {
      ...emptyDoc.canvas,
      width: canvasWidth,
      height: canvasHeight,
      unit: metadata.canvasUnit,
      dpi: metadata.canvasDpi,
    },
    elements: hydrated,
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document, warnings };
}

/**
 * Third-party fallback path. Caller has already sanitized the input
 * and parsed it via DOMParser — we run CSS-style + `<use>` deref +
 * namespace warnings on the sanitized DOM and walk elements.
 */
function hydrateThirdPartyFallbackFromDoc(
  xmlDoc: Document,
  fileName: string,
  warnings: string[],
  withinCap: boolean,
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): SvgDocumentImportResult {
  // Skip the O(n) third-party passes when we already hit the
  // element-count cap during sanitisation — the warning already
  // documents the truncation.
  if (withinCap) {
    applyStyleBlocks(xmlDoc, warnings);
    dereferenceUseElements(xmlDoc, warnings);
    warnToolNamespaces(xmlDoc, warnings);
  }

  const result = walkSvgDocument(xmlDoc, fontSources);
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...result.warnings);

  // Build a stable source-id → Broadset-id map so child elements
  // can reference their parent group via `parentId`. When the
  // visual walker captured a `dataBsId` (either the Broadset
  // `data-bs-id` or the source DOM `id`), we keep it as the new
  // Broadset id; otherwise we synthesise `imported-${index}`.
  // Closes the third-party group-hierarchy gap surfaced in the
  // P7.7 review.
  const sourceIdToBroadsetId = new Map<string, string>();

  result.elements.forEach((element, index) => {
    const newId = element.dataBsId ?? `imported-${String(index)}`;

    if (element.dataBsId !== undefined) {
      sourceIdToBroadsetId.set(element.dataBsId, newId);
    }
  });

  const document: BroadsetDocument = {
    ...emptyDoc,
    name: fileName.replace(/\.svg$/i, ''),
    canvas: { ...emptyDoc.canvas, width: result.canvasWidth, height: result.canvasHeight },
    elements: result.elements.map((element, index) => {
      const id = element.dataBsId ?? `imported-${String(index)}`;
      const parentSourceId = element.parentDataBsId;
      const resolvedParentId =
        typeof parentSourceId === 'string' && parentSourceId !== '' ?
          (sourceIdToBroadsetId.get(parentSourceId) ?? null)
        : null;
      const sourceKind = pickDefaultKindFromVisual(element.type);
      const friendlyName = resolveImportedName(element, id, sourceKind, index);

      return createDefaultElement(sourceKind, {
        id,
        name: friendlyName,
        position: { x: element.position.x, y: element.position.y },
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        content: element.content,
        style: element.style,
        ...(resolvedParentId !== null ? { parentId: resolvedParentId } : {}),
        ...(element.textPathElementId !== undefined ? { textPathElementId: element.textPathElementId } : {}),
        extensions: { svg: buildSvgExtensions(element) },
      });
    }),
  };

  if (document.elements.length === 0) {
    warnings.push(
      'SVG import produced no elements. Unsupported content may have been skipped; verify the source file and mapping coverage.',
    );
  }

  return { document, warnings };
}

function pickDefaultKindFromVisual(source: string): string {
  const allowed = new Set([
    'text',
    'image',
    'svg',
    'path',
    'rectangle',
    'ellipse',
    'qrcode',
    'group',
    'video',
    'clock',
    'ticker',
  ]);

  return allowed.has(source) ? source : 'svg';
}

function applyMetadataOverrides(
  style: Partial<BroadsetElementStyleInput>,
  meta: ParsedElementMetadata | undefined,
): Partial<BroadsetElementStyleInput> {
  if (meta === undefined) {
    return style;
  }

  const fillOverride =
    meta.originalColor !== undefined ? applyOriginalColorToFill(style.fill, meta.originalColor) : undefined;
  const parsedConic = meta.conicGradient !== undefined ? safeParseConicGradient(meta.conicGradient) : undefined;

  return {
    ...style,
    ...(fillOverride !== undefined ? { fill: fillOverride } : {}),
    ...(parsedConic !== undefined ? { backgroundGradient: parsedConic } : {}),
  };
}

interface ParsedDataBindings {
  readonly dataField?: DataFieldBinding | undefined;
  readonly visibleWhen?: string | undefined;
  readonly repeater?: RepeaterConfig | undefined;
}

/**
 * Decode the JSON-stringified `broadset:dataField` /
 * `broadset:repeater` metadata attrs the exporter writes, plus the
 * plain `broadset:visibleWhen` expression. Malformed payloads
 * silently degrade to `undefined` so a partly-corrupted packet
 * still imports per IO-D-18.
 */
function parseDataBindingMetadata(meta: ParsedElementMetadata | undefined): ParsedDataBindings {
  if (meta === undefined) {
    return {};
  }

  const dataField = parseJsonOrNull(meta.dataField);
  const repeater = parseJsonOrNull(meta.repeater);

  return {
    ...(isDataFieldBinding(dataField) ? { dataField } : {}),
    ...(typeof meta.visibleWhen === 'string' && meta.visibleWhen !== '' ? { visibleWhen: meta.visibleWhen } : {}),
    ...(isRepeaterConfig(repeater) ? { repeater } : {}),
  };
}

function parseJsonOrNull(raw: string | undefined): unknown {
  if (raw === undefined) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isDataFieldBinding(value: unknown): value is DataFieldBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fieldName' in value &&
    typeof (value as { fieldName: unknown }).fieldName === 'string'
  );
}

function isRepeaterConfig(value: unknown): value is RepeaterConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dataArrayField' in value &&
    typeof (value as { dataArrayField: unknown }).dataArrayField === 'string'
  );
}

function applyOriginalColorToFill(
  fill: BroadsetElementStyleInput['fill'] | undefined,
  originalColor: string,
): BroadsetFill {
  const sourceColor = extractSolidColorOrDefault(fill);
  const space = detectColorSpace(originalColor);
  const color: BroadsetColor = {
    kind: 'rgb',
    hex: sourceColor,
    originalColor,
    ...(space !== undefined ? { space } : {}),
  };

  return { kind: 'solid', color };
}

function extractSolidColorOrDefault(fill: BroadsetElementStyleInput['fill'] | undefined): `#${string}` {
  if (typeof fill === 'object' && 'kind' in fill && fill.kind === 'solid') {
    const color = fill.color;

    if (color.kind === 'rgb') {
      return color.hex;
    }
  }

  if (typeof fill === 'string') {
    const parsed = parseHexFromString(fill);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return '#000000';
}

function parseHexFromString(input: string): `#${string}` | undefined {
  if (/^#[0-9a-fA-F]{6}$/.test(input) || /^#[0-9a-fA-F]{8}$/.test(input)) {
    return input.toLowerCase() as `#${string}`;
  }

  return undefined;
}

function detectColorSpace(source: string): 'display-p3' | 'oklch' | 'oklab' | undefined {
  if (source.includes('display-p3')) return 'display-p3';
  if (source.includes('oklch')) return 'oklch';
  if (source.includes('oklab')) return 'oklab';

  return undefined;
}

function safeParseConicGradient(serialised: string): BroadsetGradient | undefined {
  try {
    const parsed: unknown = JSON.parse(serialised);

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    if (!('type' in parsed) || (parsed as { type?: unknown }).type !== 'conic') {
      return undefined;
    }

    return parsed as BroadsetGradient;
  } catch {
    return undefined;
  }
}

interface VisualImportResult {
  readonly elements: readonly ImportedElement[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

/**
 * Alternate entry point used by the fast-path importer: walks an
 * already-parsed DOM tree (so callers that did their own
 * `parseMetadataPacket(xmlDoc)` don't re-parse). Each emitted
 * `ImportedElement` carries its OWN `dataBsId` / `dataBsKind` /
 * `parentDataBsId` so nested group children preserve their own
 * identity and the fast path reconstructs the parent tree.
 */
function importSvgFromXmlDoc(xmlDoc: Document, fontSources?: ReadonlyMap<string, SvgFontSource>): VisualImportResult {
  const svgRoot = xmlDoc.documentElement;
  let canvasWidth = 800;
  let canvasHeight = 600;
  const widthAttr = svgRoot.getAttribute('width');
  const heightAttr = svgRoot.getAttribute('height');

  if (widthAttr && heightAttr) {
    canvasWidth = parseFloat(widthAttr);
    canvasHeight = parseFloat(heightAttr);
  } else {
    const viewBox = svgRoot.getAttribute('viewBox');

    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);

      canvasWidth = parseFloat(parts[2] ?? '800');
      canvasHeight = parseFloat(parts[3] ?? '600');
    }
  }

  const defs = buildDefsBundle(xmlDoc);
  const warnings: string[] = [];
  const elements: ImportedElement[] = [];
  const children = svgRoot.children;
  const rootTransform: TransformState = { x: 0, y: 0, rotation: 0, matrix: IDENTITY_MATRIX, requiresBake: false };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child) {
      continue;
    }

    const tag = child.tagName.toLowerCase();

    if (tag === 'defs' || tag === 'metadata') {
      continue;
    }

    elements.push(...importElement(child, defs, warnings, rootTransform, null, 0, fontSources));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}
