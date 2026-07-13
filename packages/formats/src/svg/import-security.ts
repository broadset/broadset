import { isAllowedImageUrlScheme } from './shared';

const USE_DEREFERENCE_DEPTH_CAP = 16;

/**
 * Element-count cap per the importer security contract
 * (`project/spec/formats/spec.md` -> "Input Size, Depth, and Entry
 * Caps"). Realistic Broadset / Illustrator / Inkscape / Figma SVGs
 * never exceed a few thousand elements; 10 000 is generous for a
 * complex icon-heavy document. Above this the importer surfaces a
 * warning per IO-D-18 and stops iterating instead of allowing an
 * O(n) sanitiser x O(n) style-resolver x O(n) walker O(n^3)
 * pathological run on a hostile input.
 */
export const SVG_ELEMENT_COUNT_CAP = 10_000;

const TOOL_NAMESPACE_WARNINGS: readonly { readonly prefix: string; readonly label: string }[] = [
  { prefix: 'sodipodi', label: 'sodipodi' },
  { prefix: 'inkscape', label: 'inkscape' },
  { prefix: 'ai', label: 'Illustrator (ai:)' },
];
const FORBIDDEN_ELEMENT_NAMES = new Set(['script', 'foreignobject']);
const SMIL_ANIMATION_ELEMENT_NAMES = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);
const URL_ATTRS_TO_CHECK = ['href', 'xlink:href', 'src'];

interface SvgSanitizeOptions {
  readonly allowForeignObject?: boolean | undefined;
}

/**
 * DOM-walk sanitizer used on the parsed XML tree. Enforces the
 * importer security contract floor - strips `<script>`,
 * `<foreignObject>`, `on*=` event handlers, and `javascript:` URLs
 * - while preserving structural elements that would be destroyed
 * by DOMPurify's aggressive SVG profile: `<use>` / `<symbol>`,
 * `<metadata>` with its `broadset:` / `rdf:` namespaced children
 * (needed by the fast-path packet parse), and arbitrary vendor
 * elements which become opaque `svg`-type preservations per
 * IO-D-18.
 *
 * Running on both the fast-path and third-party paths (post-parse,
 * pre-extract) closes the security-audit C1 fast-path bypass.
 */
interface SanitizeTally {
  readonly tags: Set<string>;
  readonly smilTags: Set<string>;
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
    // P7.7n security audit L3: also strip namespaced event handlers
    // (`xlink:onclick`, `ev:onload`, etc.). Modern browsers ignore
    // them, but historic SVG viewers honoured the prefix and a
    // re-export of an imported document could leak the bytes to a
    // tool that does. Local-name match catches every prefixed form.
    const localName = name.replace(/^[^:]+:/, '');

    if (/^on[a-z]+$/i.test(localName)) {
      toRemove.push(attr.name);
      tally.attrs.add(name);
    }
  }

  for (const name of toRemove) {
    el.removeAttribute(name);
  }
}

function stripJavascriptUrlsFromEl(el: Element, tally: SanitizeTally): void {
  // P7.7n security audit H1: use the same scheme allowlist as the
  // export side (`isAllowedImageUrlScheme`) so the importer rejects
  // `vbscript:`, `data:text/html`, `data:application/*`, `file:`,
  // `chrome-extension:`, etc. — not just `javascript:`. The previous
  // `^javascript:` regex left the surface asymmetric: a malicious
  // SVG carrying `<image href="vbscript:…">` survived import and
  // was persisted into the document, and the demo's renderer does
  // no scheme check before assigning to `<img>.src`.
  for (const urlAttr of URL_ATTRS_TO_CHECK) {
    const val = el.getAttribute(urlAttr);

    if (val !== null && val !== '' && !isAllowedImageUrlScheme(val.trim())) {
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
export function sanitizeDomInPlace(xmlDoc: Document, warnings: string[], options: SvgSanitizeOptions = {}): boolean {
  const tally: SanitizeTally = { tags: new Set(), smilTags: new Set(), attrs: new Set(), jsUrls: 0 };
  const all = Array.from(xmlDoc.getElementsByTagName('*'));
  const overCap = all.length > SVG_ELEMENT_COUNT_CAP;
  const limit = overCap ? SVG_ELEMENT_COUNT_CAP : all.length;

  sanitizeElementsUpToLimit(all, limit, options, tally);

  if (overCap) {
    removeUnsanitizedTail(all, limit);
  }

  emitSanitizeTallyWarnings(tally, warnings);

  if (overCap) {
    warnings.push(
      `Element-count cap of ${String(SVG_ELEMENT_COUNT_CAP)} reached (input had ${String(all.length)} elements). Elements past the cap have been removed before further import.`,
    );

    return false;
  }

  return true;
}

function sanitizeElementsUpToLimit(
  all: readonly Element[],
  limit: number,
  options: SvgSanitizeOptions,
  tally: SanitizeTally,
): void {
  for (let i = 0; i < limit; i++) {
    const el = all[i];

    if (!el) continue;

    const tag = el.tagName.toLowerCase();

    if (FORBIDDEN_ELEMENT_NAMES.has(tag) && !(tag === 'foreignobject' && options.allowForeignObject === true)) {
      el.remove();
      tally.tags.add(tag);
      continue;
    }

    if (SMIL_ANIMATION_ELEMENT_NAMES.has(tag)) {
      el.remove();
      tally.smilTags.add(tag);
      continue;
    }

    stripEventHandlerAttrsFromEl(el, tally);
    stripJavascriptUrlsFromEl(el, tally);
  }
}

function emitSanitizeTallyWarnings(tally: SanitizeTally, warnings: string[]): void {
  for (const tag of setValues(tally.tags)) {
    warnings.push(`Stripped <${tag}> during sanitization (importer security contract).`);
  }

  for (const tag of setValues(tally.smilTags)) {
    warnings.push(`Dropped SMIL animation element <${tag}> during import (IO-D-16 static SVG import).`);
  }

  for (const attr of setValues(tally.attrs)) {
    warnings.push(`Stripped event-handler attribute ${attr} during sanitization (importer security contract).`);
  }

  if (tally.jsUrls > 0) {
    warnings.push('Stripped javascript: URL during sanitization (importer security contract).');
  }
}

function setValues(values: ReadonlySet<string>): readonly string[] {
  return Array.from(values.values());
}

/**
 * P7.7n / 2026-04-28 audit fix: when the input exceeds the element
 * cap, fail closed by removing every element past the cap so the
 * downstream walk and preservation-blob capture cannot snapshot
 * unsanitized markup. Without this, `outerHTML` capture in
 * `import-walk.ts` would lift attacker-controlled descendants into
 * `extensions.svg.preserved.raw`, which the SVG exporter re-emits
 * verbatim — producing an active-content escape hatch despite the
 * sanitiser pass having flagged the cap.
 */
function removeUnsanitizedTail(all: readonly Element[], limit: number): void {
  for (let i = limit; i < all.length; i++) {
    const el = all[i];

    if (el !== undefined) {
      el.remove();
    }
  }
}

/**
 * Walk the sanitized DOM and dereference every `<use>` element in
 * place by substituting a clone of its referenced `<symbol>` (or
 * bare node) contents. Detects `<use>` cycles up to a bounded
 * follow depth and emits a warning per the importer security
 * contract section "Reference-Cycle Caps".
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

/**
 * Total invocation cap on `<use>` dereferencing across the whole
 * document. The per-chain `seen` set + depth cap stop a
 * single-chain cycle, but a fan-out tree (`s0 → 4× s1 → 4× s2 …`)
 * grows as K^N invocations even when the chain re-entry guard
 * holds (each child path has its own `seen` clone). The
 * post-walk `SVG_ELEMENT_COUNT_CAP` checks the *input* tree, not
 * the cloned output, so the expansion itself blows the CPU
 * budget before any cap fires. 5 000 invocations covers any
 * realistic design-tool icon (most stay under 100) while bounding
 * the worst case to ~1 s wall time even in slow runtimes (jsdom).
 * Closes the P7.7n security audit C1 finding.
 */
const USE_DEREFERENCE_INVOCATION_CAP = 5_000;

export function dereferenceUseElements(xmlDoc: Document, warnings: string[]): void {
  const symbolById = collectSymbolsById(xmlDoc);
  let invocationCount = 0;
  let budgetExhausted = false;

  function replaceUse(useEl: Element, seen: ReadonlySet<string>, depth: number): void {
    if (budgetExhausted) {
      useEl.remove();

      return;
    }

    invocationCount += 1;

    if (invocationCount > USE_DEREFERENCE_INVOCATION_CAP) {
      warnings.push(
        `<use> expansion exceeded budget of ${String(USE_DEREFERENCE_INVOCATION_CAP)} invocations; remaining <use> elements were skipped (fan-out bomb defence).`,
      );
      budgetExhausted = true;
      useEl.remove();

      return;
    }

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

export function warnToolNamespaces(xmlDoc: Document, warnings: string[]): void {
  const emitted = new Set<string>();
  const all = xmlDoc.getElementsByTagName('*');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];

    if (el) {
      checkElementNamespaces(el, emitted, warnings);
    }
  }
}
