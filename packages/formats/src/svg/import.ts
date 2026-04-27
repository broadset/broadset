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
  type DataFieldBinding,
  type Paragraph,
  paragraph as makeParagraph,
  type RepeaterConfig,
  rgbColor,
  type Run,
  run as makeRun,
  type RunProps,
  type TextBody,
  textBody as makeTextBody,
  textBodyToPlainString,
} from '@broadset/model';
import * as CssTree from 'css-tree';
import svgpath from 'svgpath';
import { compose as composeMatrix, type Matrix } from 'transformation-matrix';

import { layoutTextAsPathD, safeOpenFont } from './flatten-text';
import { type ParsedElementMetadata, parseMetadataPacket } from './metadata';
import {
  type DecomposedTransform,
  decomposeMatrix,
  ellipseAsPathD,
  parseAndDecomposeTransform,
  polygonAsPathD,
  rectAsPathD,
} from './transform';
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

    const remaining = SVG_CSS_RULE_CAP - rules.length;

    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const parsed = parseRulesViaCssTree(styleEl.textContent, warnings, remaining);

    if (parsed.truncated) {
      truncated = true;
    }

    for (const rule of parsed.rules) {
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
interface ParsedRulesResult {
  readonly rules: readonly ParsedRuleWithoutOrder[];
  readonly truncated: boolean;
}

/**
 * Parse a single `<style>` block's CSS via `css-tree`, expanding
 * comma-separated selector lists into per-rule entries. The
 * `budget` argument bounds total expanded rules (including those
 * spawned by selector-list children) to prevent a single hostile
 * rule like `.a, .a, .a, ... × 100_000 {}` from blowing the
 * memory cap before the outer collector check fires. Closes the
 * P7 review CSS-rule budget bypass.
 */
function parseRulesViaCssTree(css: string | null, warnings: string[], budget: number): ParsedRulesResult {
  if (css === null || css === '' || budget <= 0) {
    return { rules: [], truncated: budget <= 0 };
  }

  const out: ParsedRuleWithoutOrder[] = [];
  let ast: CssTree.CssNode;

  try {
    ast = CssTree.parse(css, { positions: false, onParseError: () => undefined });
  } catch {
    warnings.push('CSS <style> block could not be parsed; rules were skipped.');

    return { rules: out, truncated: false };
  }

  let truncated = false;

  CssTree.walk(ast, {
    visit: 'Rule',
    enter(node: CssTree.CssNode) {
      if (out.length >= budget) {
        truncated = true;

        return;
      }

      const reachedBudget = processRuleNode(node as CssTree.Rule, out, warnings, budget);

      if (reachedBudget) truncated = true;
    },
  });

  return { rules: out, truncated };
}

function processRuleNode(
  rule: CssTree.Rule,
  out: ParsedRuleWithoutOrder[],
  warnings: string[],
  budget: number,
): boolean {
  const body = CssTree.generate(rule.block)
    .replace(/^\{|\}$/g, '')
    .trim();

  if (body === '') {
    return false;
  }

  // Selector lists: emit one rule per top-level comma-separated
  // selector. Iterate the SelectorList's direct children rather
  // than `walk(visit: 'Selector')` so we don't recurse INTO
  // `:not(...)`'s own inner Selector nodes — that recursion would
  // surface the inner compound (e.g. `.skip`) as a standalone
  // rule, doubling the match. Stop emitting once `budget` is hit
  // so a single 100_000-comma rule cannot exhaust memory.
  if (rule.prelude.type !== 'SelectorList') {
    return false;
  }

  let reachedBudget = false;

  for (const selectorNode of rule.prelude.children) {
    if (out.length >= budget) {
      reachedBudget = true;
      break;
    }

    if (selectorNode.type === 'Selector') {
      pushSelectorRule(selectorNode, body, out, warnings);
    }
  }

  return reachedBudget;
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

function consumeChar(ch: string, state: TokeniserState, flush: (combinator: SelectorCombinator | null) => void): void {
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

function consumeNextAtom(remainder: string, classes: ReadonlySet<string>, id: string, el: Element): AtomStep {
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
  /**
   * Text-element content can be either a plain `string` (single
   * `<text>` body, no `<tspan>`s) or a structured `TextBody`
   * carrying paragraphs / runs with per-run style overrides
   * (built from `<tspan>` children). Other element kinds
   * (`path`, `image`, etc.) always carry a string.
   */
  readonly content: string | TextBody;
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
  /**
   * Source DOM `outerHTML` after sanitisation. Cached so the
   * exporter can re-emit byte-identical markup for elements that
   * the user didn't touch (`extensions.svg.dirty === false`).
   * Populated only for tagged elements (those with `data-bs-id`)
   * — untagged third-party elements re-render from current state
   * because we have no stable identity to anchor preservation to.
   */
  readonly preservedOuterHTML?: string | undefined;
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
        ctx.defsMap,
        ctx.gradients,
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

interface ShapeBakeContext {
  readonly transform: TransformState;
  readonly baseStyle: Partial<BroadsetElementStyleInput>;
  readonly tagMeta: Readonly<{
    readonly dataBsId?: string;
    readonly dataBsKind?: string;
    readonly parentDataBsId: string | null;
  }>;
}

/**
 * `true` when geometry MUST be baked into a `<path>` because the
 * cumulative transform (root → leaf, including own) carries a
 * non-trivial scale or skew. `ctx.transform` is the composed
 * matrix from `combineTransform`, so checking its `requiresBake`
 * flag covers both ancestor and own contributions.
 */
function requiresBake(ctx: ShapeBakeContext): boolean {
  return ctx.transform.requiresBake;
}

/**
 * `<image>` cannot bake to a `<path>`, but a pure scale+translate
 * cumulative transform CAN fold its scale factors into the
 * declared `width` / `height` so the visual result matches what
 * the source SVG showed. Skew / rotation embedded in the matrix
 * survives via `transform.rotation` (decomposed) — anything left
 * over (true skew) emits a warning so the gap is visible.
 */
function bakeImageDimensions(
  transform: TransformState,
  rawWidth: number,
  rawHeight: number,
  warnings: string[],
): { readonly width: number; readonly height: number } {
  if (!transform.requiresBake) {
    return { width: rawWidth, height: rawHeight };
  }

  // The cumulative matrix has shape { a, b, c, d, e, f }. After
  // decomposeTSR factors out rotation, a pure scale+translate would
  // satisfy b ≈ 0 and c ≈ 0; the magnitudes |a| and |d| are then
  // the X / Y scale factors. Mixed skew leaves residual b / c that
  // we can't represent on a native `<image>`.
  const m = transform.matrix;
  const cosTheta = Math.cos((transform.rotation * Math.PI) / 180);
  const sinTheta = Math.sin((transform.rotation * Math.PI) / 180);
  const sx = m.a * cosTheta + m.b * sinTheta;
  const sy = -m.c * sinTheta + m.d * cosTheta;
  const skewX = m.a * -sinTheta + m.b * cosTheta;
  const skewY = m.c * cosTheta + m.d * sinTheta;
  const skewMagnitude = Math.max(Math.abs(skewX), Math.abs(skewY));

  if (skewMagnitude > 1e-3) {
    warnings.push(
      `Skew on an <image> element was dropped on import (Broadset has no element-level image skew per IO-D-02).`,
    );
  }

  return { width: rawWidth * Math.abs(sx), height: rawHeight * Math.abs(sy) };
}

function bakedPathElement(d: string, ctx: ShapeBakeContext): ImportedElement {
  // `ctx.transform.matrix` is the FULL cumulative matrix from root
  // through this element's own transform — `combineTransform`
  // already composed it. The previous code re-composed
  // `ctx.transform.matrix × ctx.ownTransform.matrix`, double-
  // applying the leaf's own transform on every bake (P7 review
  // finding). The bake just needs the cumulative matrix as-is.
  return {
    type: 'path',
    content: bakePathWithMatrix(d, ctx.transform.matrix),
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

/**
 * Read the text content of a `<text>` (or wrapped `<textPath>`)
 * element. When the source has `<tspan>` children, build a
 * structured `TextBody` carrying each run's text plus any inline
 * style overrides (`font-family` / `font-size` / `font-weight` /
 * `font-style` / `fill` / `text-decoration`). Otherwise return
 * the plain string body — preserves the existing single-line
 * round-trip.
 *
 * The structured form lets a downstream re-export emit
 * `<tspan>` markup that round-trips the run shape (closes the
 * spec feature-matrix promise that multi-run text is native on
 * import + export).
 */
function readTextContent(source: Element): string | TextBody {
  const tspans = source.getElementsByTagName('tspan');

  if (tspans.length === 0) {
    return source.textContent;
  }

  const runs: Run[] = readTspanRuns(tspans);

  if (runs.length === 0) {
    return source.textContent;
  }

  // Single paragraph for now — SVG doesn't have explicit
  // paragraph markers (unlike DOCX), so all `<tspan>`s collapse
  // into one paragraph. Authors typically use `dy="1em"` on a
  // tspan to encode a paragraph break; that visual cue is
  // preserved in the round-trip via the metadata packet's
  // structural fingerprint, not through the TextBody shape.
  const paragraphs: Paragraph[] = [makeParagraph(runs)];

  return makeTextBody(paragraphs);
}

function readTspanRuns(tspans: HTMLCollectionOf<Element>): Run[] {
  const runs: Run[] = [];

  for (let i = 0; i < tspans.length; i++) {
    const tspan = tspans[i];

    if (tspan === undefined) continue;

    const text = tspan.textContent;

    if (text === '') continue;

    const props = readRunPropsFromTspan(tspan);

    runs.push(props !== undefined ? makeRun(text, props) : makeRun(text));
  }

  return runs;
}

/**
 * Extract per-run style overrides from a `<tspan>` element. The
 * exporter emits canonical SVG attribute names (`font-family`,
 * `font-size`, etc.); the importer maps them back to the
 * camelCase keys the model's `RunProps.style` consumes.
 */
function readRunPropsFromTspan(tspan: Element): RunProps | undefined {
  const style: Record<string, string> = {};
  const fontFamily = tspan.getAttribute('font-family');
  const fontSize = tspan.getAttribute('font-size');
  const fontWeight = tspan.getAttribute('font-weight');
  const fontStyle = tspan.getAttribute('font-style');
  const fill = tspan.getAttribute('fill');
  const textDecoration = tspan.getAttribute('text-decoration');

  if (typeof fontFamily === 'string' && fontFamily !== '') style['fontFamily'] = fontFamily;
  if (typeof fontSize === 'string' && fontSize !== '') style['fontSize'] = fontSize;
  if (typeof fontWeight === 'string' && fontWeight !== '') style['fontWeight'] = fontWeight;
  if (typeof fontStyle === 'string' && fontStyle !== '') style['fontStyle'] = fontStyle;
  if (typeof fill === 'string' && fill !== '') style['fontColor'] = fill;
  if (typeof textDecoration === 'string' && textDecoration !== '') style['textDecoration'] = textDecoration;

  if (Object.keys(style).length === 0) return undefined;

  return { style };
}

/**
 * Import a `<text>` element. When the cumulative transform
 * requires bake (scale / skew) AND `fontSources` carries bytes
 * for the referenced `font-family`, the text gets glyph-flattened
 * into a `<path>` element pre-multiplied by the cumulative matrix
 * — the visual result on re-render matches the source SVG. When
 * the font isn't available, surface a warning and keep the
 * translate-only position (lossy-but-graceful per IO-D-02).
 */
function importTextElement(
  el: Element,
  ctx: ShapeBakeContext,
  warnings: string[],
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): ImportedElement {
  const textPathEl = el.getElementsByTagName('textPath')[0];
  const hrefRaw = textPathEl?.getAttribute('href') ?? textPathEl?.getAttribute('xlink:href') ?? '';
  const textPathElementId =
    typeof hrefRaw === 'string' && hrefRaw.startsWith('#') && hrefRaw.length > 1 ? hrefRaw.slice(1) : undefined;
  const sourceForContent = textPathEl ?? el;
  const content = readTextContent(sourceForContent);

  if (ctx.transform.requiresBake) {
    // Flatten path needs a single string for fontkit layout —
    // collapse a TextBody to its plain-string projection. Per-run
    // styling is lost (the bake produces glyph paths regardless),
    // which matches the export `flatten` mode's contract.
    const plainText = typeof content === 'string' ? content : textBodyToPlainString(content);
    const flattened = tryFlattenTextOnImport(el, ctx, plainText, fontSources, warnings);

    if (flattened !== null) {
      return flattened;
    }

    warnings.push(
      `Cumulative non-trivial scale/skew on a <text> element was dropped to translate-only on import (Broadset has no element-level text scale per IO-D-02).`,
    );
  }

  return {
    type: 'text',
    content,
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: 0,
    height: 0,
    rotation: ctx.transform.rotation,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
    ...(textPathElementId !== undefined ? { textPathElementId } : {}),
  };
}

/**
 * When a `<text>` element under a baking ancestor has a known
 * font in `fontSources`, lay out its glyphs and bake them as a
 * `<path>` element pre-multiplied by the cumulative matrix. The
 * resulting Broadset `path` carries the visual fidelity of the
 * source `<text>` at the cost of font / content identity (same
 * lossy trade-off as the export `flatten` mode). Returns `null`
 * when the bake can't run — caller falls back to translate-only.
 */
function tryFlattenTextOnImport(
  el: Element,
  ctx: ShapeBakeContext,
  content: string,
  fontSources: ReadonlyMap<string, SvgFontSource> | undefined,
  warnings: string[],
): ImportedElement | null {
  if (content === '') return null;

  const family = el.getAttribute('font-family') ?? '';

  if (family === '') return null;

  if (fontSources === undefined) return null;

  const source = fontSources.get(family);

  if (source?.bytes === undefined) {
    warnings.push(
      `Cannot glyph-flatten <text font-family="${family}"> under a baking transform — font bytes for "${family}" were not supplied via importSvgDocument(options.fontSources).`,
    );

    return null;
  }

  const font = safeOpenFont(source.bytes);

  if (font === null) {
    warnings.push(`Cannot glyph-flatten <text font-family="${family}"> — fontkit could not parse the supplied bytes.`);

    return null;
  }

  const fontSize = parseFloat(el.getAttribute('font-size') ?? '16');
  const originX = parseFloat(el.getAttribute('x') ?? '0');
  const originY = parseFloat(el.getAttribute('y') ?? '0');
  const dRaw = layoutTextAsPathD(content, font, {
    fontSize: Number.isFinite(fontSize) ? fontSize : 16,
    originX: Number.isFinite(originX) ? originX : 0,
    originY: Number.isFinite(originY) ? originY : 0,
  });

  if (dRaw === '') return null;

  // Pre-multiply by the cumulative matrix (already includes the
  // baking ancestor's scale / skew) the same way every other
  // shape importer bakes geometry into the `d`.
  const baked = bakePathWithMatrix(dRaw, ctx.transform.matrix);

  return {
    type: 'path',
    content: baked,
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
    rotation: 0,
    style: ctx.baseStyle,
    ...ctx.tagMeta,
  };
}

/**
 * Import an `<image>` element. Cumulative scale folds into width /
 * height via `bakeImageDimensions`; cumulative skew emits a
 * warning (no native representation per IO-D-02).
 */
function importImageElement(el: Element, ctx: ShapeBakeContext, warnings: string[]): ImportedElement {
  const rawWidth = getNumAttr(el, 'width', 0);
  const rawHeight = getNumAttr(el, 'height', 0);
  const baked = bakeImageDimensions(ctx.transform, rawWidth, rawHeight, warnings);

  return {
    type: 'image',
    content: getAttr(el, 'href') ?? getAttr(el, 'xlink:href') ?? '',
    position: { x: ctx.transform.x, y: ctx.transform.y },
    width: baked.width,
    height: baked.height,
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
  fontSources?: ReadonlyMap<string, SvgFontSource>,
): ImportedElement[] {
  const tagName = el.tagName.toLowerCase();
  const transformStr = getAttr(el, 'transform') ?? '';
  const transform = combineTransform(inheritedTransform, parseTransform(transformStr));
  const clipPath = resolveClipPath(el, defsMap);
  // Presentation attributes inherit from ancestor elements per
  // SVG 1.1 §6.4 / §11.4 (e.g., `<svg stroke="currentColor"
  // stroke-width="1.5">` cascades to every `<path>` descendant).
  // `getInheritedAttr` walks `parentElement` up until it finds
  // a value or hits the root — without this, real-world icon
  // fixtures (Heroicons, Material Icons, etc.) lose their root-
  // level stroke / fill.
  const fill = getInheritedAttr(el, 'fill');
  const stroke = getInheritedAttr(el, 'stroke');
  const gradient = resolveGradientFill(fill, gradients);
  const strokeStyle = readInheritedStrokeStyle(el);
  const baseStyle: Partial<BroadsetElementStyleInput> = {
    ...(clipPath ? { customClipPath: clipPath } : undefined),
    ...(fill !== null && gradient === undefined ? { fill } : undefined),
    ...(stroke !== null ? { stroke } : undefined),
    ...(gradient !== undefined ? { backgroundGradient: gradient } : undefined),
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
        defsMap,
        gradients,
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

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform, null, 0, fontSources));
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

    elements.push(...importElement(child, defsMap, gradients, warnings, rootTransform, null, 0, fontSources));
  }

  return { elements, canvasWidth, canvasHeight, warnings };
}
