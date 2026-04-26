import {
  type BroadsetColor,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyleInput,
  type BroadsetFill,
  type BroadsetGradient,
  type BroadsetGradientStop,
  createDefaultElement,
  createEmptyBroadsetDocument,
  rgbColor,
} from '@broadset/model';
import * as CssTree from 'css-tree';
import svgpath from 'svgpath';
import { compose as composeMatrix, type Matrix } from 'transformation-matrix';

import { type ParsedElementMetadata, parseMetadataPacket } from './metadata';
import {
  type DecomposedTransform,
  ellipseAsPathD,
  parseAndDecomposeTransform,
  polygonAsPathD,
  rectAsPathD,
} from './transform';
import type { SvgImportOptions } from './types';

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
 * Parse `<style>` blocks in the SVG document and apply their
 * declarations to matching elements via a simple type / class / id
 * selector matcher. Inline `style=""` attributes already on the
 * element are preserved (CSS 2.1 specificity — inline wins over
 * `<style>` rules).
 */
interface CssRule {
  readonly selector: string;
  readonly body: string;
  /** Specificity triple: [id-count, class/attr/pseudo-count, type-count] per CSS 2.1 §6.4.3. */
  readonly specificity: readonly [number, number, number];
  /** Source order within the document — ties break by order (later wins). */
  readonly order: number;
}

/**
 * Hard cap on the number of CSS rules we collect from `<style>`
 * blocks. The element-by-element resolver runs O(rules × elements)
 * after this — even at the 10 000-element document cap, 100 000
 * rules drives 10⁹ matcher invocations. Realistic third-party SVGs
 * carry a few hundred rules at most; 5 000 leaves an order-of-
 * magnitude headroom while bounding the worst case to manageable
 * size. Closes the P7.7 review CSS-rule unboundedness finding.
 */
const SVG_CSS_RULE_CAP = 5_000;

function collectStylesheetRules(xmlDoc: Document, warnings: string[]): readonly CssRule[] {
  const rules: CssRule[] = [];
  const styleEls = xmlDoc.getElementsByTagName('style');
  let order = 0;
  let truncated = false;

  outer: for (let i = 0; i < styleEls.length; i++) {
    const styleEl = styleEls[i];

    if (!styleEl) {
      continue;
    }

    for (const rule of parseRulesViaCssTree(styleEl.textContent, warnings)) {
      if (rules.length >= SVG_CSS_RULE_CAP) {
        truncated = true;
        break outer;
      }

      rules.push({ ...rule, order });
      order += 1;
    }
  }

  if (truncated) {
    warnings.push(
      `CSS rule cap of ${String(SVG_CSS_RULE_CAP)} reached; later <style> rules were not applied (resource cap per importer security contract).`,
    );
  }

  return rules;
}

function applyRulesToElement(el: Element, rules: readonly CssRule[]): void {
  const inlineStyle = el.getAttribute('style') ?? '';
  const matching: CssRule[] = [];

  for (const rule of rules) {
    if (ruleMatchesElement(rule, el)) {
      matching.push(rule);
    }
  }

  if (matching.length === 0) {
    return;
  }

  // Sort by specificity ascending, then by source order ascending.
  // Combined string concatenation puts higher-specificity rules
  // LATER so their declarations win in `applyStylePresentation`'s
  // last-wins resolver.
  matching.sort((a, b) => compareSpecificity(a.specificity, b.specificity) || a.order - b.order);

  const applied = matching.map((r) => r.body);
  // Combine in CSS precedence order: stylesheet rules first (by
  // ascending specificity + source order), inline `style=""` last
  // (inline wins per CSS 2.1).
  const combined = [...applied, inlineStyle].filter((s) => s.trim() !== '').join(';');

  el.setAttribute('style', combined);
  applyStylePresentation(el, combined);
}

function compareSpecificity(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];

  return a[2] - b[2];
}

function applyStyleBlocks(xmlDoc: Document, warnings: string[]): void {
  const rules = collectStylesheetRules(xmlDoc, warnings);

  if (rules.length === 0) {
    return;
  }

  const all = xmlDoc.getElementsByTagName('*');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];

    if (el) {
      applyRulesToElement(el, rules);
    }
  }
}

interface ParsedRuleWithoutOrder {
  readonly selector: string;
  readonly body: string;
  readonly specificity: readonly [number, number, number];
}

interface SelectorAnalysis {
  readonly ids: readonly string[];
  readonly classes: readonly string[];
  readonly types: readonly string[];
  readonly pseudoClasses: readonly string[];
  readonly attributes: readonly string[];
  readonly hasCombinator: boolean;
  readonly specificity: readonly [number, number, number];
}

/**
 * Parse a `<style>` block with `css-tree` and return one
 * `ParsedRuleWithoutOrder` per `selector { body }` pair. Selector
 * lists (`a, b`) split into separate rules so each carries its own
 * specificity. Unsupported selectors (pseudo-classes other than
 * a narrow allow-list, combinators) surface as warnings and the
 * caller falls back to matching on the base id/class/type triple;
 * this is the "best-effort" posture svg.md § Pseudo-class and
 * attribute-selector resolution documents.
 */
function parseRulesViaCssTree(css: string | null, warnings: string[]): readonly ParsedRuleWithoutOrder[] {
  if (css === null || css === '') {
    return [];
  }

  const out: ParsedRuleWithoutOrder[] = [];
  let ast: CssTree.CssNode;

  try {
    ast = CssTree.parse(css, { positions: false, onParseError: () => undefined });
  } catch {
    warnings.push('CSS <style> block could not be parsed; rules were skipped.');

    return out;
  }

  CssTree.walk(ast, {
    visit: 'Rule',
    enter(node: CssTree.CssNode) {
      processRuleNode(node as CssTree.Rule, out, warnings);
    },
  });

  return out;
}

function processRuleNode(
  rule: CssTree.Rule,
  out: ParsedRuleWithoutOrder[],
  warnings: string[],
): void {
  const body = CssTree.generate(rule.block).replace(/^\{|\}$/g, '').trim();

  if (body === '') {
    return;
  }

  // Selector lists: emit one rule per top-level comma-separated
  // selector. Iterate the SelectorList's direct children rather
  // than `walk(visit: 'Selector')` so we don't recurse INTO
  // `:not(...)`'s own inner Selector nodes — that recursion would
  // surface the inner compound (e.g. `.skip`) as a standalone
  // rule, doubling the match.
  if (rule.prelude.type === 'SelectorList') {
    rule.prelude.children.forEach((selectorNode) => {
      if (selectorNode.type === 'Selector') {
        pushSelectorRule(selectorNode, body, out, warnings);
      }
    });
  }
}

function pushSelectorRule(
  selectorNode: CssTree.Selector,
  body: string,
  out: ParsedRuleWithoutOrder[],
  warnings: string[],
): void {
  const selector = CssTree.generate(selectorNode).trim();
  const analysis = analyseSelector(selectorNode);

  // Combinators (`>` / `+` / `~` / descendant) are resolved against
  // the live DOM in `ruleMatchesElement`; no warning needed.
  // Pseudo-classes / pseudo-elements remain unresolvable against a
  // static tree — surface a warning so the user knows their dynamic
  // rules were skipped.
  if (analysis.pseudoClasses.length > 0) {
    warnings.push(
      `CSS pseudo-class selector "${selector}" is not resolved; falling back to base matching (see svg.md Spec Gaps).`,
    );
  }

  out.push({ selector, body, specificity: analysis.specificity });
}

function analyseSelector(selector: CssTree.Selector): SelectorAnalysis {
  const ids: string[] = [];
  const classes: string[] = [];
  const types: string[] = [];
  const pseudoClasses: string[] = [];
  const attributes: string[] = [];
  let hasCombinator = false;

  CssTree.walk(selector, {
    enter(node: CssTree.CssNode) {
      if (node.type === 'IdSelector') {
        ids.push(node.name);
      } else if (node.type === 'ClassSelector') {
        classes.push(node.name);
      } else if (node.type === 'TypeSelector') {
        types.push(node.name.toLowerCase());
      } else if (node.type === 'AttributeSelector') {
        attributes.push(node.name.name);
      } else if (node.type === 'PseudoClassSelector' || node.type === 'PseudoElementSelector') {
        // `:not()` is statically resolvable via recursive
        // `matchCompound` — don't flag it for warning. Other
        // pseudo-classes (`:hover`, `:nth-child`) remain
        // unresolved.
        if (node.name !== 'not') {
          pseudoClasses.push(node.name);
        }
      } else if (node.type === 'Combinator') {
        hasCombinator = true;
      }
    },
  });

  // CSS 2.1 specificity: (a, b, c)
  //   a = count of ID selectors
  //   b = count of class / attribute / pseudo-class selectors
  //   c = count of element / pseudo-element selectors
  const specificity: [number, number, number] = [
    ids.length,
    classes.length + attributes.length + pseudoClasses.length,
    types.length,
  ];

  return { ids, classes, types, pseudoClasses, attributes, hasCombinator, specificity };
}

/**
 * Hard cap on the number of compound tokens in a single CSS
 * selector. Right-to-left matching with descendant / sibling
 * combinators is super-linear in token count × tree depth — without
 * a cap a hostile stylesheet like `a a a a a … {}` can drive
 * exponential walking. Real-world selectors rarely exceed 6 tokens;
 * 16 leaves generous headroom. Closes the security audit C2 finding.
 */
const SELECTOR_TOKEN_CAP = 16;

function ruleMatchesElement(rule: CssRule, el: Element): boolean {
  // Tokenise the selector into a sequence of compound selectors
  // separated by combinators (`>` / `+` / `~` / descendant space).
  // Match right-to-left: rightmost compound on `el`, then walk up
  // via the combinator to find a matching ancestor / sibling.
  const tokens = tokeniseSelector(rule.selector);

  if (tokens.length === 0 || tokens.length > SELECTOR_TOKEN_CAP) {
    return false;
  }

  return matchTokensFromRight(tokens, el);
}

type SelectorCombinator = ' ' | '>' | '+' | '~';

interface SelectorToken {
  readonly compound: string;
  readonly combinator: SelectorCombinator | null;
}

/**
 * Split a selector string into compounds + combinators. Whitespace
 * around `>` / `+` / `~` is a combinator, not a descendant. Bare
 * whitespace inside the selector is the descendant combinator.
 *
 * Example: `g > div .foo` → [
 *   { compound: 'g', combinator: '>' },
 *   { compound: 'div', combinator: ' ' },
 *   { compound: '.foo', combinator: null },
 * ]
 */
interface TokeniserState {
  buf: string;
  pendingCombinator: SelectorCombinator | null;
  inBracket: number;
}

function isStructuralCombinator(ch: string): ch is '>' | '+' | '~' {
  return ch === '>' || ch === '+' || ch === '~';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function consumeChar(
  ch: string,
  state: TokeniserState,
  flush: (combinator: SelectorCombinator | null) => void,
): void {
  if (ch === '[') {
    state.inBracket += 1;
    state.buf += ch;

    return;
  }

  if (ch === ']') {
    state.inBracket = Math.max(0, state.inBracket - 1);
    state.buf += ch;

    return;
  }

  if (state.inBracket > 0) {
    state.buf += ch;

    return;
  }

  if (isStructuralCombinator(ch)) {
    flush(state.pendingCombinator);
    state.pendingCombinator = ch;

    return;
  }

  if (isWhitespace(ch)) {
    if (state.buf.trim() !== '') {
      flush(state.pendingCombinator);
      state.pendingCombinator = ' ';
    }

    return;
  }

  state.buf += ch;
}

function tokeniseSelector(selector: string): readonly SelectorToken[] {
  const trimmed = selector.trim();

  if (trimmed === '') {
    return [];
  }

  const tokens: SelectorToken[] = [];
  const state: TokeniserState = { buf: '', pendingCombinator: ' ', inBracket: 0 };
  const flushCompound = (combinator: SelectorCombinator | null): void => {
    const compound = state.buf.trim();

    if (compound !== '') {
      tokens.push({ compound, combinator });
      state.buf = '';
    }
  };

  for (let i = 0; i < trimmed.length; i++) {
    consumeChar(trimmed.charAt(i), state, flushCompound);
  }

  flushCompound(state.pendingCombinator);

  // Re-thread combinators so each token describes its relationship
  // to the NEXT token in document order (not the previous one).
  const out: SelectorToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const cur = tokens[i];
    const next = tokens[i + 1];

    if (!cur) {
      continue;
    }

    out.push({ compound: cur.compound, combinator: next?.combinator ?? null });
  }

  return out;
}

function matchTokensFromRight(tokens: readonly SelectorToken[], el: Element): boolean {
  const last = tokens[tokens.length - 1];

  if (!last || !matchCompound(last.compound, el)) {
    return false;
  }

  let cursor: Element | null = el;

  for (let i = tokens.length - 2; i >= 0; i--) {
    const token = tokens[i];

    if (!token) {
      continue;
    }

    const cameVia = token.combinator;
    const result = walkForCompound(token.compound, cursor, cameVia);

    if (result === null) {
      return false;
    }

    cursor = result;
  }

  return true;
}

function walkForCompound(
  compound: string,
  fromEl: Element | null,
  combinator: SelectorCombinator | null,
): Element | null {
  if (fromEl === null) {
    return null;
  }

  if (combinator === '>') return walkChildCombinator(compound, fromEl);
  if (combinator === '+') return walkAdjacentSiblingCombinator(compound, fromEl);
  if (combinator === '~') return walkGeneralSiblingCombinator(compound, fromEl);

  return walkDescendantCombinator(compound, fromEl);
}

function walkChildCombinator(compound: string, fromEl: Element): Element | null {
  const parent = fromEl.parentElement;

  return parent !== null && matchCompound(compound, parent) ? parent : null;
}

function walkAdjacentSiblingCombinator(compound: string, fromEl: Element): Element | null {
  const prev = fromEl.previousElementSibling;

  return prev !== null && matchCompound(compound, prev) ? prev : null;
}

function walkGeneralSiblingCombinator(compound: string, fromEl: Element): Element | null {
  let prev = fromEl.previousElementSibling;

  while (prev !== null) {
    if (matchCompound(compound, prev)) {
      return prev;
    }

    prev = prev.previousElementSibling;
  }

  return null;
}

function walkDescendantCombinator(compound: string, fromEl: Element): Element | null {
  let ancestor = fromEl.parentElement;

  while (ancestor !== null) {
    if (matchCompound(compound, ancestor)) {
      return ancestor;
    }

    ancestor = ancestor.parentElement;
  }

  return null;
}

interface AtomStep {
  readonly matched: boolean;
  readonly remainder: string;
}

function consumeClassAtom(remainder: string, classes: ReadonlySet<string>): AtomStep {
  const nameMatch = /^\.([a-zA-Z_][a-zA-Z0-9_-]*)/.exec(remainder);

  if (nameMatch === null) {
    return { matched: false, remainder };
  }

  const name = nameMatch[1] ?? '';

  return { matched: classes.has(name), remainder: remainder.slice(nameMatch[0].length) };
}

function consumeIdAtom(remainder: string, id: string): AtomStep {
  const nameMatch = /^#([a-zA-Z_][a-zA-Z0-9_-]*)/.exec(remainder);

  if (nameMatch === null) {
    return { matched: false, remainder };
  }

  const name = nameMatch[1] ?? '';

  return { matched: name === id, remainder: remainder.slice(nameMatch[0].length) };
}

interface AttributeMatcher {
  readonly name: string;
  readonly op: '=' | '~=' | '|=' | '^=' | '$=' | '*=' | null;
  readonly value: string;
}

function consumeAttributeAtom(remainder: string, el: Element): AtomStep {
  // [attr] | [attr=value] | [attr="value"] | [attr~=word] | [attr|=prefix]
  // [attr^=prefix] | [attr$=suffix] | [attr*=substring]
  if (!remainder.startsWith('[')) {
    return { matched: false, remainder };
  }

  const closeIdx = remainder.indexOf(']');

  if (closeIdx === -1) {
    return { matched: false, remainder };
  }

  const inner = remainder.slice(1, closeIdx).trim();
  const parsed = parseAttributeMatcher(inner);

  if (parsed === null) {
    return { matched: false, remainder };
  }

  const actual = el.getAttribute(parsed.name);

  return {
    matched: matchAttribute(parsed, actual),
    remainder: remainder.slice(closeIdx + 1),
  };
}

function parseAttributeMatcher(inner: string): AttributeMatcher | null {
  const nameMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*/.exec(inner);

  if (nameMatch === null) {
    return null;
  }

  const name = nameMatch[1] ?? '';
  const rest = inner.slice(nameMatch[0].length);

  if (rest === '') {
    return { name, op: null, value: '' };
  }

  const opMatch = /^([~|^$*]?=)\s*/.exec(rest);

  if (opMatch === null) {
    return null;
  }

  const op = (opMatch[1] ?? null) as AttributeMatcher['op'];
  const valueRaw = rest.slice(opMatch[0].length).trim();
  const value = unquoteAttributeValue(valueRaw);

  return { name, op, value };
}

function unquoteAttributeValue(raw: string): string {
  if (raw.length >= 2) {
    const first = raw.charAt(0);
    const last = raw.charAt(raw.length - 1);

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw.slice(1, -1);
    }
  }

  return raw;
}

function matchAttribute(matcher: AttributeMatcher, actual: string | null): boolean {
  if (actual === null) {
    return false;
  }

  switch (matcher.op) {
    case null:
      return true;
    case '=':
      return actual === matcher.value;
    case '~=':
      return actual.split(/\s+/).includes(matcher.value);
    case '|=':
      return actual === matcher.value || actual.startsWith(`${matcher.value}-`);
    case '^=':
      return actual.startsWith(matcher.value);
    case '$=':
      return actual.endsWith(matcher.value);
    case '*=':
      return actual.includes(matcher.value);
  }
}

function consumeNextAtom(
  remainder: string,
  classes: ReadonlySet<string>,
  id: string,
  el: Element,
): AtomStep {
  if (remainder.startsWith('.')) {
    return consumeClassAtom(remainder, classes);
  }

  if (remainder.startsWith('#')) {
    return consumeIdAtom(remainder, id);
  }

  if (remainder.startsWith('[')) {
    return consumeAttributeAtom(remainder, el);
  }

  return { matched: false, remainder };
}

/**
 * Match a single compound selector (no combinator, e.g. `g`,
 * `.foo`, `#bar`, `g[data-x="y"].foo`) against an element.
 *
 * Supports `:not(<simple>)` by recursively matching the inner
 * compound and inverting the result. Other pseudo-classes / pseudo-
 * elements are stripped (cannot be resolved against a static tree
 * — a warning surfaced at parse time documents the gap).
 */
function matchCompound(compound: string, el: Element): boolean {
  // Extract `:not(...)` clauses first — they're statically
  // resolvable by recursively matching their inner compound and
  // inverting. Multiple `:not()` clauses on the same compound
  // (e.g. `g:not(.foo):not(#bar)`) all gate the match.
  const notClauses: string[] = [];
  const withoutNot = compound.replace(/:not\(([^)]+)\)/g, (_match, inner: string) => {
    notClauses.push(inner.trim());

    return '';
  });

  for (const inner of notClauses) {
    if (matchCompound(inner, el)) {
      return false;
    }
  }

  // Strip remaining pseudo-classes / pseudo-elements — they cannot
  // be resolved against a static tree; base matching continues
  // with a warning emitted at parse time.
  const base = withoutNot.replace(/::?[a-zA-Z][a-zA-Z0-9-]*(\([^)]*\))?/g, '');
  let remainder = base.trim();

  if (remainder === '' || remainder === '*') {
    return true;
  }

  const tagName = el.tagName.toLowerCase();
  const classAttr = el.getAttribute('class') ?? '';
  const classes = new Set(classAttr.split(/\s+/).filter((c) => c !== ''));
  const id = el.getAttribute('id') ?? '';

  // Extract a leading type selector (if any) — must match tag.
  const typeMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(remainder);

  if (typeMatch !== null) {
    if (typeMatch[0].toLowerCase() !== tagName) {
      return false;
    }

    remainder = remainder.slice(typeMatch[0].length);
  }

  // Iterate remaining .class / #id / [attr] atoms.
  while (remainder !== '') {
    const step = consumeNextAtom(remainder, classes, id, el);

    if (!step.matched || step.remainder === remainder) {
      return false;
    }

    remainder = step.remainder;
  }

  return true;
}

function applyStylePresentation(el: Element, body: string): void {
  // Collect the LAST declaration of each property so CSS
  // precedence (stylesheet < inline) is honoured when the caller
  // passes a combined string.
  const paintPattern = /\b(fill|stroke|stop-color|fill-opacity|stroke-opacity|opacity|stroke-width)\s*:\s*([^;]+)/g;
  const resolved = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = paintPattern.exec(body)) !== null) {
    const prop = match[1];
    const value = match[2]?.trim();

    if (prop !== undefined && value !== undefined) {
      resolved.set(prop, value);
    }
  }

  for (const [prop, value] of resolved) {
    el.setAttribute(prop, value);
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

interface ImportedElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly style: Partial<BroadsetElementStyleInput>;
  /**
   * Captured `data-bs-id` from the source DOM node when present.
   * Populated for every element produced in the fast-path walk so
   * nested group children keep their OWN id (not the parent group's).
   */
  readonly dataBsId?: string | undefined;
  /** Captured `data-bs-kind` from the source DOM node when present. */
  readonly dataBsKind?: string | undefined;
  /** `data-bs-id` of the nearest ancestor element, or `null` at root. */
  readonly parentDataBsId?: string | null | undefined;
  /**
   * For text elements wrapping a `<textPath href="#id">`, carries
   * the referenced path element id so the Broadset model's
   * `textPathElementId` field round-trips through SVG (P7.6 gap fix).
   */
  readonly textPathElementId?: string | undefined;
}

interface TransformState {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  /**
   * Cumulative matrix from root to this element. Always populated;
   * defaults to identity. When `requiresBake` is `true` the leaf
   * shape importer pre-multiplies its geometry by this matrix
   * instead of using `x`/`y`/`rotation` (which are unreliable
   * once a bake-requiring ancestor is in the chain).
   */
  readonly matrix: Matrix;
  /**
   * `true` when the cumulative matrix carries a non-trivial scale
   * or skew that Broadset cannot represent natively (per IO-D-02).
   * Drives leaf shapes to bake geometry into a `<path>` rather than
   * keeping a native `rectangle` / `ellipse` / etc.
   */
  readonly requiresBake: boolean;
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
  // Fast-path: if neither side carries a baking transform, simple
  // additive composition keeps the plain `x`/`y`/`rotation` story
  // (and zero-allocates the matrix slot — every group descent hits
  // this branch in practice).
  if (!base.requiresBake && !next.requiresBake) {
    return {
      x: base.x + next.x,
      y: base.y + next.y,
      rotation: base.rotation + next.rotation,
      matrix: IDENTITY_MATRIX,
      requiresBake: false,
    };
  }

  // Either side bakes — promote to full matrix composition so the
  // leaf shape that eventually bakes can use the cumulative
  // transform without losing scale / skew from any ancestor.
  const composed = composeMatrix(base.matrix, next.matrix);

  return {
    x: composed.e,
    y: composed.f,
    rotation: 0,
    matrix: composed,
    requiresBake: true,
  };
}

/**
 * Bake an affine matrix into an SVG path d-string via `svgpath`.
 * Used when a non-decomposable transform (scale / skew / matrix
 * with non-identity 2x2) is applied to a shape — Broadset has no
 * native scale/skew element fields per IO-D-02, so the geometry is
 * pre-multiplied and stored as a `path`.
 */
function bakePathWithMatrix(d: string, matrix: DecomposedTransform['matrix']): string {
  if (d === '') {
    return '';
  }

  return svgpath(d).matrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]).abs().round(3).toString();
}

function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function getNumAttr(el: Element, name: string, defaultVal: number): number {
  const val = el.getAttribute(name);

  return val !== null ? parseFloat(val) : defaultVal;
}

function resolveClipPath(el: Element, defsMap: ReadonlyMap<string, string>): string | undefined {
  const clipRef = getAttr(el, 'clip-path');

  if (!clipRef) {
    return undefined;
  }

  const idMatch = /url\(#([^)]+)\)/.exec(clipRef);
  const clipId = idMatch?.[1];

  if (clipId && defsMap.has(clipId)) {
    return defsMap.get(clipId);
  }

  return clipRef;
}

function buildDefsMap(doc: Document): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const defs = doc.querySelectorAll('defs > clipPath');

  defs.forEach((clipPath) => {
    const id = clipPath.getAttribute('id');

    if (id) {
      map.set(id, clipPath.innerHTML);
    }
  });

  return map;
}

/**
 * Parse an SVG `offset` attribute (`0`, `1`, `50%`, `0.5`) into the
 * Broadset 0-100 position range. SVG 2 accepts both fractional
 * (0-1) and percentage (`0%`-`100%`) forms — we normalise both to
 * 0-100 so the model schema accepts them.
 */
function parseGradientOffset(raw: string | null): number {
  if (raw === null || raw === '') {
    return 0;
  }

  const trimmed = raw.trim();
  const hasPercent = trimmed.endsWith('%');
  const numeric = parseFloat(hasPercent ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (hasPercent) {
    return Math.max(0, Math.min(100, numeric));
  }

  // Fractional 0-1 form — convert to 0-100 percentage.
  if (numeric <= 1) {
    return Math.max(0, Math.min(100, numeric * 100));
  }

  return Math.max(0, Math.min(100, numeric));
}

/**
 * Parse the `<stop>` children of a gradient element into the
 * Broadset structured stop array. `stop-color` accepts any CSS
 * colour; unparsable values default to opaque black so the stop is
 * never silently dropped per IO-D-18.
 */
function parseGradientStops(gradientEl: Element): readonly BroadsetGradientStop[] {
  const stops: BroadsetGradientStop[] = [];
  const children = gradientEl.getElementsByTagName('stop');

  for (let i = 0; i < children.length; i++) {
    const stop = children[i];

    if (!stop) {
      continue;
    }

    const offset = parseGradientOffset(stop.getAttribute('offset'));
    const colorRaw = stop.getAttribute('stop-color') ?? '#000000';

    stops.push({ color: rgbColor(colorRaw), position: offset });
  }

  return stops;
}

/**
 * Derive a linear-gradient angle from the SVG `x1/y1/x2/y2`
 * direction. Returns degrees clockwise from the 12-o'clock
 * (0° = top), matching CSS `linear-gradient(<angle>, ...)`.
 */
function deriveLinearAngle(gradientEl: Element): number {
  const x1 = parseFloat(gradientEl.getAttribute('x1') ?? '0');
  const y1 = parseFloat(gradientEl.getAttribute('y1') ?? '0');
  const x2 = parseFloat(gradientEl.getAttribute('x2') ?? '1');
  const y2 = parseFloat(gradientEl.getAttribute('y2') ?? '0');

  const dx = x2 - x1;
  const dy = y2 - y1;

  // atan2 returns radians counter-clockwise from the positive x-axis.
  // Convert to CSS-style clockwise-from-north: 90 - atan2-degrees.
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const cssAngle = (90 - angleDeg + 360) % 360;

  return Math.round(cssAngle * 100) / 100;
}

/**
 * Build a map of gradient id → `BroadsetGradient` from every
 * `<linearGradient>` and `<radialGradient>` in the source. Both
 * top-level and `<defs>`-nested gradients are collected so inherited
 * `xlink:href` chains resolve correctly.
 */
function buildGradientsMap(doc: Document): ReadonlyMap<string, BroadsetGradient> {
  const gradients = new Map<string, BroadsetGradient>();
  const linears = doc.getElementsByTagName('linearGradient');
  const radials = doc.getElementsByTagName('radialGradient');

  for (let i = 0; i < linears.length; i++) {
    const el = linears[i];

    if (!el) {
      continue;
    }

    const id = el.getAttribute('id');

    if (id === null || id === '') {
      continue;
    }

    const stops = parseGradientStops(el);

    if (stops.length < 2) {
      continue;
    }

    gradients.set(id, { type: 'linear', angle: deriveLinearAngle(el), stops });
  }

  for (let i = 0; i < radials.length; i++) {
    const el = radials[i];

    if (!el) {
      continue;
    }

    const id = el.getAttribute('id');

    if (id === null || id === '') {
      continue;
    }

    const stops = parseGradientStops(el);

    if (stops.length < 2) {
      continue;
    }

    const cx = parseFloat(el.getAttribute('cx') ?? '0.5');
    const cy = parseFloat(el.getAttribute('cy') ?? '0.5');

    gradients.set(id, {
      type: 'radial',
      center: [cx * 100, cy * 100],
      stops,
    });
  }

  return gradients;
}

/**
 * Resolve a CSS `url(#foo)` fill reference to a structured gradient
 * if the id matches a gradient in the defs map; otherwise return
 * undefined so the caller falls back to the raw paint server string.
 */
function resolveGradientFill(
  fillAttr: string | null,
  gradients: ReadonlyMap<string, BroadsetGradient>,
): BroadsetGradient | undefined {
  if (fillAttr === null) {
    return undefined;
  }

  const match = /url\(\s*#([^)\s]+)\s*\)/.exec(fillAttr);
  const id = match?.[1];

  if (id === undefined) {
    return undefined;
  }

  return gradients.get(id);
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
  readonly defsMap: ReadonlyMap<string, string>;
  readonly gradients: ReadonlyMap<string, BroadsetGradient>;
  readonly warnings: string[];
  readonly depth: number;
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

  // A tagged group becomes a Broadset `'group'` element in the
  // output; its children then carry `parentDataBsId = ownId` so
  // the fast path reconstructs the parent tree. An untagged
  // group is a pure visual wrapper — children inherit
  // `parentDataBsId` unchanged.
  const importedChildren: ImportedElement[] = [];

  if (ctx.ownDataBsId !== undefined) {
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
      ...ctx.tagMeta,
    });
  }

  const children = el.children;
  const childParentId = ctx.ownDataBsId ?? ctx.parentDataBsId;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    if (!child || child.tagName.toLowerCase() === 'defs') {
      continue;
    }

    importedChildren.push(
      ...importElement(child, ctx.defsMap, ctx.gradients, ctx.warnings, ctx.transform, childParentId, ctx.depth + 1),
    );
  }

  return importedChildren;
}

interface ShapeBakeContext {
  readonly transform: TransformState;
  readonly ownTransform: ReturnType<typeof parseTransform>;
  readonly baseStyle: Partial<BroadsetElementStyleInput>;
  readonly tagMeta: Readonly<{
    readonly dataBsId?: string;
    readonly dataBsKind?: string;
    readonly parentDataBsId: string | null;
  }>;
}

/**
 * `true` when geometry MUST be baked into a `<path>` because either
 * the inherited cumulative transform (from ancestor `<g>` matrices)
 * or the element's own transform carries a non-trivial scale /
 * skew. Either source disqualifies a native rectangle / ellipse
 * representation per IO-D-02.
 */
function requiresBake(ctx: ShapeBakeContext): boolean {
  return ctx.transform.requiresBake || ctx.ownTransform.requiresBake;
}

function bakedPathElement(d: string, ctx: ShapeBakeContext): ImportedElement {
  // Compose the inherited cumulative matrix with the element's own
  // transform so a leaf inside `<g transform="scale(2)">` bakes via
  // (ancestor scale) ⊗ (own translate), not the own matrix alone.
  const matrix = ctx.transform.requiresBake
    ? composeMatrix(ctx.transform.matrix, ctx.ownTransform.matrix)
    : ctx.ownTransform.matrix;

  return {
    type: 'path',
    content: bakePathWithMatrix(d, matrix),
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
    rotation: 0,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importRectElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const x = getNumAttr(el, 'x', 0);
  const y = getNumAttr(el, 'y', 0);
  const w = getNumAttr(el, 'width', 0);
  const h = getNumAttr(el, 'height', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(rectAsPathD(x, y, w, h), ctx);
  }

  return {
    type: 'rectangle',
    content: '',
    position: { x: ctx.transform.x + x, y: ctx.transform.y + y },
    width: w,
    height: h,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importPathElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const dRaw = getAttr(el, 'd') ?? '';

  if (requiresBake(ctx)) {
    return bakedPathElement(dRaw, ctx);
  }

  return {
    type: 'path',
    content: dRaw,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importEllipseElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const cx = getNumAttr(el, 'cx', 0);
  const cy = getNumAttr(el, 'cy', 0);
  const rx = getNumAttr(el, 'rx', 0);
  const ry = getNumAttr(el, 'ry', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(ellipseAsPathD(cx, cy, rx, ry), ctx);
  }

  return {
    type: 'ellipse',
    content: '',
    position: { x: ctx.transform.x + cx - rx, y: ctx.transform.y + cy - ry },
    width: rx * 2,
    height: ry * 2,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importCircleElement(el: Element, ctx: ShapeBakeContext): ImportedElement {
  const cx = getNumAttr(el, 'cx', 0);
  const cy = getNumAttr(el, 'cy', 0);
  const r = getNumAttr(el, 'r', 0);

  if (requiresBake(ctx)) {
    return bakedPathElement(ellipseAsPathD(cx, cy, r, r), ctx);
  }

  return {
    type: 'ellipse',
    content: '',
    position: { x: ctx.transform.x + cx - r, y: ctx.transform.y + cy - r },
    width: r * 2,
    height: r * 2,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importPolygonElement(el: Element, ctx: ShapeBakeContext, closed: boolean): ImportedElement {
  const pointsAttr = getAttr(el, 'points') ?? '';
  const dRaw = polygonAsPathD(pointsAttr, closed);

  if (requiresBake(ctx)) {
    return bakedPathElement(dRaw, ctx);
  }

  return {
    type: 'path',
    content: dRaw,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

function importElement(
  el: Element,
  defsMap: ReadonlyMap<string, string>,
  gradients: ReadonlyMap<string, BroadsetGradient>,
  warnings: string[],
  inheritedTransform: TransformState,
  parentDataBsId: string | null = null,
  depth = 0,
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defsMap);
  const fill = getAttr(el, 'fill');
  const stroke = getAttr(el, 'stroke');
  const gradient = resolveGradientFill(fill, gradients);
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(clipPath ? { customClipPath: clipPath } : undefined),
    ...(fill && gradient === undefined ? { fill } : undefined),
    ...(stroke ? { stroke } : undefined),
    ...(gradient !== undefined ? { backgroundGradient: gradient } : undefined),
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

  const ownTransform = parseTransform(transformStr);
  const shapeCtx: ShapeBakeContext = { transform, ownTransform, baseStyle, tagMeta };

  switch (tagName) {
    case 'rect':
      return [importRectElement(el, shapeCtx)];

    case 'path':
      return [importPathElement(el, shapeCtx)];

    case 'ellipse':
      return [importEllipseElement(el, shapeCtx)];

    case 'circle':
      return [importCircleElement(el, shapeCtx)];

    case 'polygon':
      return [importPolygonElement(el, shapeCtx, true)];

    case 'polyline':
      return [importPolygonElement(el, shapeCtx, false)];

    case 'text': {
      const textPathEl = el.getElementsByTagName('textPath')[0];
      const hrefRaw = textPathEl?.getAttribute('href') ?? textPathEl?.getAttribute('xlink:href') ?? '';
      const textPathElementId =
        typeof hrefRaw === 'string' && hrefRaw.startsWith('#') && hrefRaw.length > 1 ? hrefRaw.slice(1) : undefined;
      const content = textPathEl !== undefined ? textPathEl.textContent : el.textContent;

      return [
        {
          type: 'text',
          content,
          position: { x: transform.x, y: transform.y },
          width: 0,
          height: 0,
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
          ...(textPathElementId !== undefined ? { textPathElementId } : {}),
        },
      ];
    }

    case 'image':
      return [
        {
          type: 'image',
          content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
          position: { x: transform.x, y: transform.y },
          width: getNumAttr(el, 'width', 0),
          height: getNumAttr(el, 'height', 0),
          rotation: transform.rotation,
          style: baseStyle,
          ...tagMeta,
        },
      ];

    case 'g':
      return importGroupElement(el, {
        transformStr,
        transform,
        baseStyle,
        ownDataBsId: effectiveId,
        ownDataBsKind,
        tagMeta,
        parentDataBsId,
        defsMap,
        gradients,
        warnings,
        depth,
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

function walkSvgDocument(xmlDoc: Document): SvgImportResult {
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

  const defsMap = buildDefsMap(xmlDoc);
  const gradients = buildGradientsMap(xmlDoc);
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

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform));
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
  _options?: SvgImportOptions,
): SvgDocumentImportResult {
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
    return hydrateFastPath(xmlDoc, metadata, fileName, warnings);
  }

  return hydrateThirdPartyFallbackFromDoc(xmlDoc, fileName, warnings, withinCap);
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
): SvgDocumentImportResult {
  const visualExtract = importSvgFromXmlDoc(xmlDoc);
  const metadataById = new Map<string, ParsedElementMetadata>(metadata.elements.map((entry) => [entry.elementId, entry]));
  const canvasWidth = visualExtract.canvasWidth;
  const canvasHeight = visualExtract.canvasHeight;
  const emptyDoc = createEmptyBroadsetDocument();

  warnings.push(...visualExtract.warnings);

  const hydrated: BroadsetElement[] = [];
  let fallbackIndex = 0;

  for (const visualEl of visualExtract.elements) {
    const dataBsId = visualEl.dataBsId;
    const parentId = visualEl.parentDataBsId ?? null;
    const parentField = typeof parentId === 'string' && parentId !== '' ? { parentId } : {};

    if (dataBsId !== undefined) {
      const sourceKind = visualEl.dataBsKind ?? pickDefaultKindFromVisual(visualEl.type);
      const meta = metadataById.get(dataBsId);
      const style = applyMetadataOverrides(visualEl.style, meta);

      hydrated.push(
        createDefaultElement(sourceKind, {
          id: dataBsId,
          name: meta?.name ?? dataBsId,
          position: { x: visualEl.position.x, y: visualEl.position.y },
          width: meta?.width ?? visualEl.width,
          height: meta?.height ?? visualEl.height,
          rotation: visualEl.rotation,
          content: visualEl.content,
          style,
          ...parentField,
          ...(visualEl.textPathElementId !== undefined ? { textPathElementId: visualEl.textPathElementId } : {}),
          extensions: { svg: { dirty: false } },
        }),
      );
    } else {
      hydrated.push(
        createDefaultElement(pickDefaultKindFromVisual(visualEl.type), {
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
        }),
      );
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
): SvgDocumentImportResult {
  // Skip the O(n) third-party passes when we already hit the
  // element-count cap during sanitisation — the warning already
  // documents the truncation.
  if (withinCap) {
    applyStyleBlocks(xmlDoc, warnings);
    dereferenceUseElements(xmlDoc, warnings);
    warnToolNamespaces(xmlDoc, warnings);
  }

  const result = walkSvgDocument(xmlDoc);
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
        typeof parentSourceId === 'string' && parentSourceId !== ''
          ? sourceIdToBroadsetId.get(parentSourceId) ?? null
          : null;

      return createDefaultElement(pickDefaultKindFromVisual(element.type), {
        id,
        name: `Element ${String(index + 1)}`,
        position: { x: element.position.x, y: element.position.y },
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        content: element.content,
        style: element.style,
        ...(resolvedParentId !== null ? { parentId: resolvedParentId } : {}),
        ...(element.textPathElementId !== undefined ? { textPathElementId: element.textPathElementId } : {}),
        extensions: { svg: { dirty: false } },
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
function importSvgFromXmlDoc(xmlDoc: Document): VisualImportResult {
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

  const defsMap = buildDefsMap(xmlDoc);
  const gradients = buildGradientsMap(xmlDoc);
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

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform, null));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}
