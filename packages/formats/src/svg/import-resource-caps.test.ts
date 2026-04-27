/**
 * P7.7a — Explicit resource caps on the SVG importer.
 *
 * The shared importer security contract (`project/spec/formats/spec.md`
 * → "Input Size, Depth, and Entry Caps") mandates parser-recursion +
 * element-tree depth caps at 100 by default, plus an entry-count cap
 * for archive-bearing formats. The SVG importer adds:
 *
 * - Element-count cap (`SVG_ELEMENT_COUNT_CAP = 100_000`) — a hostile
 *   SVG with millions of nodes would run sanitisation, style-block
 *   resolution, and the visual walk in O(n × rules); the cap stops
 *   iteration with a single warning and continues with whatever was
 *   imported up to the boundary.
 * - Group-depth cap (`SVG_GROUP_DEPTH_CAP = 100`) — recursion into
 *   nested `<g>` is bounded so a 10 000-level nesting cannot overflow
 *   the V8 stack.
 *
 * Both caps emit warnings (per IO-D's "resource-limit failures emit
 * warnings, never exceptions") and surface in the import report so the
 * user sees what was clipped.
 */
import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';

describe('P7.7a — Element-count cap', () => {
  /**
   * @description An SVG with element count above the configured cap
   * MUST surface a warning naming the cap and the importer MUST stop
   * iterating rather than processing all elements (which is O(n) per
   * pass for sanitisation, style resolution, and the visual walk).
   */
  it('emits a warning when an SVG exceeds the element-count cap', () => {
    const N = 10_001;
    const rects = '<rect width="1" height="1"/>'.repeat(N);
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${rects}</svg>`;
    const start = Date.now();
    const { warnings } = importSvgDocument(fixture);

    expect(Date.now() - start).toBeLessThan(5_000);
    expect(warnings.some((w) => /element-count|too many|cap/i.test(w))).toBe(true);
  });

  /**
   * @description An SVG well below the cap MUST NOT emit the cap
   * warning. Pins the false-positive surface.
   */
  it('does not warn when the SVG is well below the cap', () => {
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="50" height="50"/>
    </svg>`;
    const { warnings } = importSvgDocument(fixture);

    expect(warnings.some((w) => /element-count|too many|cap/i.test(w))).toBe(false);
  });
});

describe('P7.7e — CSS rule-count cap', () => {
  /**
   * @description An SVG with more than `SVG_CSS_RULE_CAP` rules in
   * `<style>` blocks MUST emit a warning and stop collecting
   * additional rules. Closes the P7.7 review finding that
   * applyStyleBlocks ran O(rules × elements) without bound.
   */
  it('caps the number of CSS rules collected from <style> blocks', () => {
    const ruleCount = 6_000;
    const ruleText = Array.from({ length: ruleCount }, (_unused, i) => `.cls${String(i)} { fill: #fff; }`).join('\n');
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>${ruleText}</style><rect width="50" height="50"/></svg>`;
    const start = Date.now();
    const { warnings } = importSvgDocument(fixture);

    expect(Date.now() - start).toBeLessThan(5_000);
    expect(warnings.some((w) => /CSS rule cap|rule cap/i.test(w))).toBe(true);
  });

  /**
   * @description A SINGLE rule with a comma-separated selector
   * list of N entries expands to N CssRule entries. The cap MUST
   * fire mid-expansion so a hostile `.a, .a, .a, … × 50_000 { … }`
   * cannot allocate 50_000 entries before the outer collector
   * checks. Closes the second P7 review finding on this surface.
   */
  it('caps rule expansion mid-selector-list to prevent memory blow-up', () => {
    const selectorCount = 50_000;
    const selector = Array.from({ length: selectorCount }, (_unused, i) => `.cls${String(i)}`).join(', ');
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>${selector} { fill: #f00; }</style><rect width="50" height="50"/></svg>`;
    const start = Date.now();
    const { warnings } = importSvgDocument(fixture);

    expect(Date.now() - start).toBeLessThan(5_000);
    expect(warnings.some((w) => /CSS rule cap|rule cap/i.test(w))).toBe(true);
  });
});

describe('P7.7a — Group-depth cap', () => {
  /**
   * @description Nesting `<g>` elements 200 levels deep MUST hit the
   * group-depth cap (100) and emit a warning. The importer MUST NOT
   * stack-overflow.
   */
  it('emits a warning at the group-depth cap and continues', () => {
    const depth = 200;
    const opens = '<g>'.repeat(depth);
    const closes = '</g>'.repeat(depth);
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">${opens}<rect width="5" height="5"/>${closes}</svg>`;
    const { warnings } = importSvgDocument(fixture);

    expect(warnings.some((w) => /group depth|nested|recursion/i.test(w))).toBe(true);
  });

  /**
   * @description Shallow nesting (e.g. 10 levels) MUST NOT trigger
   * the group-depth warning.
   */
  it('does not warn for shallow group nesting', () => {
    const depth = 10;
    const opens = '<g>'.repeat(depth);
    const closes = '</g>'.repeat(depth);
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50">${opens}<rect width="5" height="5"/>${closes}</svg>`;
    const { warnings } = importSvgDocument(fixture);

    expect(warnings.some((w) => /group depth|nested|recursion/i.test(w))).toBe(false);
  });
});
