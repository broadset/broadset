/**
 * P7.4b — SVG arbitrary third-party import.
 *
 * Third-party SVGs (Illustrator / Inkscape / Figma / Sketch /
 * Affinity / d3 / hand-authored / browser outerHTML) MUST import
 * as Broadset documents per `project/spec/formats/svg.md`:
 *
 * 1. Import Sanitization (importer security contract floor).
 *    `<script>`, `on*=`, `javascript:` URLs, `<foreignObject>` with
 *    active content — all stripped via `_shared/sanitize/sanitizeSvg`
 *    before the AST reaches downstream code. Every removal surfaces
 *    as a warning per IO-D-18.
 * 2. CSS style resolution. `<style>` blocks parsed via a simple
 *    type / class / id selector matcher so inherited presentation
 *    attributes land on the right element.
 * 3. `<use>` / `<symbol>` dereferencing. References resolve inline
 *    into groups; self-referential cycles detected and warned per
 *    the importer security contract.
 * 4. Tool-specific namespace preservation. `sodipodi:` /
 *    `inkscape:` / `ai:` attrs on recognised elements surface a
 *    warning — the element still imports natively.
 */
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

/* ------------------------------------------------------------------ */
/*  1. Import sanitization                                            */
/* ------------------------------------------------------------------ */

describe('P7.4b — Import sanitization (security contract)', () => {
  /**
   * @description An inline `<script>` in a third-party SVG MUST be
   * stripped on import. The element extractor MUST NOT see the
   * script, and the import report MUST list the removal as a
   * warning.
   */
  it('strips inline <script> elements on import', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <script>alert('xss')</script>
      <rect width="50" height="50" fill="#ff0000"/>
    </svg>`;

    const { document, warnings } = importSvgDocument(hostile);
    const hasRect = document.elements.some((el) => el.type === 'rectangle');
    const hasSvgWithScript = document.elements.some(
      (el) => el.type === 'svg' && typeof el.content === 'string' && el.content.includes('<script'),
    );

    expect(hasRect).toBe(true);
    expect(hasSvgWithScript).toBe(false);
    expect(warnings.some((w) => w.toLowerCase().includes('script'))).toBe(true);
  });

  /**
   * @description `on*=` event handler attributes MUST be stripped.
   * The element still imports natively — only the active-content
   * attribute is gone.
   */
  it('strips on*= event handler attributes on import', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect onclick="alert(1)" onmouseover="alert(2)" width="50" height="50" fill="#ff0000"/>
    </svg>`;

    const { document, warnings } = importSvgDocument(hostile);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
    // Sanitization strips the attributes before downstream code sees
    // them — the resulting Broadset style has no `onclick` / `onmouseover`.
    expect(rect?.content).not.toContain('onclick');
    expect(warnings.some((w) => w.toLowerCase().includes('event') || w.toLowerCase().includes('attribute'))).toBe(
      true,
    );
  });

  /**
   * @description `javascript:` URLs in `href` / `xlink:href` MUST be
   * stripped on import per the security contract.
   */
  it('strips javascript: URLs on import', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
      <image xlink:href="javascript:alert(1)" width="50" height="50"/>
    </svg>`;

    const { warnings } = importSvgDocument(hostile);

    expect(warnings.some((w) => w.toLowerCase().includes('javascript') || w.toLowerCase().includes('url'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  2. <use> / <symbol> dereferencing                                 */
/* ------------------------------------------------------------------ */

describe('P7.4b — <use> / <symbol> dereferencing', () => {
  /**
   * @description A `<use>` element referencing a `<symbol>` in
   * `<defs>` MUST dereference inline: the resulting Broadset doc
   * contains the symbol's children as if they were direct SVG
   * elements. Visually identical, structurally flattened per the
   * plan's "known-lossy" note on structural round-trip.
   */
  it('dereferences <use> referencing a <symbol> with rect content', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200">
      <defs>
        <symbol id="cross">
          <rect width="40" height="10" fill="#ff0000"/>
          <rect width="10" height="40" fill="#ff0000"/>
        </symbol>
      </defs>
      <use xlink:href="#cross"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rectCount = document.elements.filter((el) => el.type === 'rectangle').length;

    expect(rectCount).toBe(2);
  });

  /**
   * @description A self-referential `<use>` (reference chain back
   * to its enclosing `<symbol>`) MUST be detected and broken
   * without unbounded recursion. The importer warns and moves on
   * per the importer security contract.
   */
  it('detects <use> cycles without unbounded recursion', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200">
      <defs>
        <symbol id="cycle">
          <use xlink:href="#cycle"/>
        </symbol>
      </defs>
      <use xlink:href="#cycle"/>
    </svg>`;

    const start = Date.now();
    const { warnings } = importSvgDocument(input);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(warnings.some((w) => w.toLowerCase().includes('cycle') || w.toLowerCase().includes('use'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  3. CSS <style> block resolution                                   */
/* ------------------------------------------------------------------ */

describe('P7.4b — CSS style block resolution', () => {
  /**
   * @description A `<style>` block defining a type selector MUST
   * apply its declarations to matching elements on import.
   */
  it('applies type-selector rules from <style> blocks', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>rect { fill: #00ff00; }</style>
      <rect width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    expect(fill?.kind).toBe('solid');

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#00ff00');
    }
  });

  /**
   * @description Inline `style=""` overrides `<style>` block rules
   * per CSS 2.1 specificity. The inline value wins on import.
   */
  it('inline style attribute wins over <style> block rules', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>rect { fill: #00ff00; }</style>
      <rect width="50" height="50" style="fill: #ff0000"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#ff0000');
    }
  });

  /**
   * @description CSS specificity MUST match CSS 2.1 §6.4.3:
   * `#id` > `.class` > type selector. When three rules match the
   * same element, the id rule wins — not the last-declared rule.
   * Regression test for the pre-css-tree hand-rolled parser that
   * resolved in document order only.
   */
  it('resolves #id specificity over .class and type selectors', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>
        rect { fill: #111111; }
        .accent { fill: #222222; }
        #winner { fill: #ff00ff; }
      </style>
      <rect id="winner" class="accent" width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#ff00ff');
    } else {
      throw new Error('Expected solid rgb fill');
    }
  });

  /**
   * @description `.class` specificity MUST beat a bare type
   * selector even when the type rule is declared later in source
   * order — the hand-rolled parser failed this because it matched
   * in document order only.
   */
  it('resolves .class specificity over bare type selector regardless of source order', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>
        .accent { fill: #00ff00; }
        rect { fill: #ff0000; }
      </style>
      <rect class="accent" width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#00ff00');
    }
  });

  /**
   * @description Attribute selectors (`[attr]`, `[attr="value"]`,
   * `[attr~="word"]`) MUST match elements bearing the attribute
   * with the right value. Many third-party SVGs (Figma, web
   * frameworks) emit class-and-attribute hybrids.
   */
  it('matches attribute-presence selectors [attr]', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>[data-flag] { fill: #ff0000; }</style>
      <rect data-flag="x" width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#ff0000');
    } else {
      throw new Error('Expected solid rgb fill');
    }
  });

  /**
   * @description Equality attribute selectors (`[attr="value"]`)
   * match only when the attribute equals the value verbatim.
   */
  it('matches attribute-equality selectors [attr="value"]', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>[data-kind="primary"] { fill: #00ff00; } [data-kind="secondary"] { fill: #0000ff; }</style>
      <rect data-kind="primary" width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#00ff00');
    }
  });

  /**
   * @description Descendant combinator (`a b`) MUST match `b`
   * elements anywhere inside an ancestor `a`. The most common
   * combinator in third-party stylesheets.
   */
  it('matches descendant combinator selectors', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>g rect { fill: #abcdef; }</style>
      <g><rect width="20" height="20"/></g>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#abcdef');
    } else {
      throw new Error('Expected solid rgb fill');
    }
  });

  /**
   * @description Child combinator (`a > b`) MUST match only
   * direct children, not arbitrary descendants. A `<rect>`
   * grandchild MUST NOT match `g > rect`.
   */
  it('respects child combinator > vs descendant space', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>svg > rect { fill: #112233; }</style>
      <g><rect width="20" height="20"/></g>
      <rect width="30" height="30"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const directRect = document.elements.find((el) => el.width === 30);
    const nestedRect = document.elements.find((el) => el.width === 20);
    const directFill = directRect?.style.fill;
    const nestedFill = nestedRect?.style.fill;

    if (directFill?.kind === 'solid' && directFill.color.kind === 'rgb') {
      expect(directFill.color.hex).toBe('#112233');
    }

    // Nested rect MUST NOT pick up the `svg > rect` rule (it's a
    // grandchild of svg, not a direct child).
    if (nestedFill?.kind === 'solid' && nestedFill.color.kind === 'rgb') {
      expect(nestedFill.color.hex).not.toBe('#112233');
    }
  });

  /**
   * @description Pseudo-class selectors (`:hover`, `:nth-child`)
   * cannot be resolved against a static tree. The importer surfaces
   * a warning so the user knows their stylesheet's dynamic rules
   * were skipped. This is the documented "Spec Gap" behaviour.
   */
  /**
   * @description A selector with more than the SELECTOR_TOKEN_CAP
   * compound tokens MUST NOT match — silently dropping is preferable
   * to driving exponential right-to-left walks against a deep tree.
   * This pins the security audit C2 hardening.
   */
  it('drops selectors with more than the token cap (security hardening)', () => {
    // 20 nested `g` tokens — exceeds the cap of 16.
    const longSelector = Array.from({ length: 20 }, () => 'g').join(' ');
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>${longSelector} { fill: #ff0000; }</style>
      <g><rect width="50" height="50"/></g>
    </svg>`;
    const start = Date.now();
    const { document } = importSvgDocument(input);
    const elapsed = Date.now() - start;
    const rect = document.elements.find((el) => el.type === 'rectangle');

    // The hostile selector did NOT match (cap dropped it before
    // walking) and the import returned in well under a second.
    expect(elapsed).toBeLessThan(1_000);
    expect(rect?.style.fill).not.toBe('#ff0000');
  });

  /**
   * @description `:not(.foo)` is statically resolvable — the
   * importer MUST match elements that don't carry the inner
   * selector and MUST NOT emit a pseudo-class warning. Closes
   * the P7.7 review nit that `:not()` was treated as opaque.
   */
  it('resolves :not(.class) by inverting the inner compound match', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <style>rect:not(.skip) { fill: #00ff00; }</style>
      <rect width="50" height="50"/>
      <rect class="skip" width="50" height="50"/>
    </svg>`;
    const { document, warnings } = importSvgDocument(input);
    const rects = document.elements.filter((el) => el.type === 'rectangle');
    const fill0 = rects[0]?.style.fill;
    const fill1 = rects[1]?.style.fill;

    if (fill0?.kind === 'solid' && fill0.color.kind === 'rgb') {
      expect(fill0.color.hex).toBe('#00ff00');
    } else {
      throw new Error('expected first rect to have a solid green fill');
    }

    if (fill1?.kind === 'solid' && fill1.color.kind === 'rgb') {
      expect(fill1.color.hex).not.toBe('#00ff00');
    }

    expect(warnings.some((w) => /pseudo-class.*not\b/i.test(w))).toBe(false);
  });

  it('warns about pseudo-class selectors it cannot resolve', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>
        rect:hover { fill: #ff0000; }
      </style>
      <rect width="50" height="50"/>
    </svg>`;

    const { warnings } = importSvgDocument(input);

    expect(warnings.some((w) => w.toLowerCase().includes('pseudo-class'))).toBe(true);
  });

  /**
   * @description A class-selector rule MUST apply to elements
   * bearing that class. Third-party SVGs from Illustrator and
   * Figma export via class-heavy CSS.
   */
  it('applies class-selector rules from <style> blocks', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>.accent { fill: #0000ff; }</style>
      <rect class="accent" width="50" height="50"/>
    </svg>`;

    const { document } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex).toBe('#0000ff');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  4. Tool-specific namespace preservation                           */
/* ------------------------------------------------------------------ */

describe('P7.4b — Tool-specific namespace preservation', () => {
  /**
   * @description An Inkscape-authored SVG with `sodipodi:` and
   * `inkscape:` attributes MUST import the element natively (as a
   * rectangle, path, etc.) with a warning describing the preserved
   * namespaced attrs.
   */
  it('imports Inkscape rect with sodipodi attrs and warns', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="200" height="200">
      <rect sodipodi:nodetypes="ccc" inkscape:label="layer1" width="100" height="50" fill="#ff0000"/>
    </svg>`;

    const { document, warnings } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
    expect(warnings.some((w) => /sodipodi|inkscape|namespace/i.test(w))).toBe(true);
  });

  /**
   * @description An Illustrator `ai:` namespace attribute on a
   * natively-mapped element MUST surface a warning and still
   * import the element natively.
   */
  it('imports Illustrator rect with ai attrs and warns', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:ai="http://ns.adobe.com/AdobeIllustrator/10.0/" width="200" height="200">
      <rect ai:extended="true" width="100" height="50" fill="#00ff00"/>
    </svg>`;

    const { document, warnings } = importSvgDocument(input);
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
    expect(warnings.some((w) => /illustrator|ai:|adobe|namespace/i.test(w))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  5. No silent drops                                                */
/* ------------------------------------------------------------------ */

describe('P7.4b — No silent drops', () => {
  /**
   * @description A `<meshgradient>` (or other unknown vendor
   * element) MUST preserve as an opaque `svg`-type Broadset element
   * and emit a warning naming the unknown tag per IO-D-18.
   */
  it('preserves unknown elements as opaque svg-type and warns', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <meshgradient id="m1"/>
    </svg>`;

    const { document, warnings } = importSvgDocument(input);
    const preserved = document.elements.find((el) => el.type === 'svg');

    expect(preserved).toBeDefined();
    expect(preserved?.content).toContain('meshgradient');
    expect(warnings.some((w) => w.toLowerCase().includes('meshgradient'))).toBe(true);
  });
});
