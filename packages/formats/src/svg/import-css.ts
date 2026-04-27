/**
 * Importer-side CSS `<style>` block resolution. Owns the
 * stylesheet-rules → presentation-attribute application path
 * (CSS 2.1 specificity, selector matching, attribute matchers).
 * Self-contained — the orchestrator (`import.ts`) only calls the
 * single entry point `applyStyleBlocks` after sanitisation.
 *
 * Split out of `import.ts` in P7.7m to bring the orchestrator
 * back under the 500-line soft limit.
 */
import * as CssTree from 'css-tree';


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

export function applyStyleBlocks(xmlDoc: Document, warnings: string[]): void {
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
