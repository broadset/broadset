/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';

import { sanitizeSvg } from './sanitize-svg';

/**
 * Phase 2 `_shared/sanitize/` — tests pin the Broadset SVG
 * sanitization policy: no execution surface reaches the renderer
 * (scripts, event handlers, foreign objects stripped), benign SVG
 * content survives intact, and empty / malformed input produces a
 * well-formed empty result without throwing.
 */
describe('sanitizeSvg', () => {
  /**
   * @description A benign SVG fragment (a rect + text element) must
   * pass through unchanged. Pins the happy path for imported SVG
   * content that contains no hostile constructs.
   */
  it('passes a benign SVG fragment through unchanged', () => {
    const result = sanitizeSvg('<rect width="100" height="50" fill="red"/>');

    expect(result.report.empty).toBe(false);
    expect(result.ast.markup).toContain('<rect');
    expect(result.ast.markup).toContain('width="100"');
    expect(result.ast.root).not.toBeNull();
  });

  /**
   * @description Inline `<script>` tags must be stripped per the
   * importer security contract — no execution surface reaches the
   * renderer. The sanitized markup is re-emitted without the script.
   */
  it('strips inline script tags', () => {
    const result = sanitizeSvg('<g><script>alert(1)</script><rect/></g>');

    expect(result.ast.markup).not.toContain('<script');
    expect(result.ast.markup).not.toContain('alert(1)');
  });

  /**
   * @description Event-handler attributes (`onload`, `onclick`, etc.)
   * must be stripped. Tests multiple common handlers.
   */
  it('strips inline event-handler attributes', () => {
    const result = sanitizeSvg('<svg><rect onclick="x()" onload="y()" onerror="z()"/></svg>');

    expect(result.ast.markup).not.toContain('onclick');
    expect(result.ast.markup).not.toContain('onload');
    expect(result.ast.markup).not.toContain('onerror');
  });

  /**
   * @description `<foreignObject>` is an execution surface for
   * embedded HTML / iframes and is banned by Broadset policy.
   */
  it('strips foreignObject elements', () => {
    const result = sanitizeSvg('<g><foreignObject><iframe src="x"/></foreignObject><rect/></g>');

    expect(result.ast.markup).not.toContain('<foreignObject');
    expect(result.ast.markup).not.toContain('<iframe');
  });

  /**
   * @description `javascript:` URLs are stripped from `href` /
   * `xlink:href` attributes. DOMPurify enforces this by default.
   */
  it('strips javascript: href URLs', () => {
    const result = sanitizeSvg('<a href="javascript:alert(1)"><rect/></a>');

    expect(result.ast.markup).not.toContain('javascript:');
  });

  /**
   * @description Empty input returns an empty-markup result with
   * `report.empty = true` — callers use this to skip re-rendering.
   */
  it('returns an empty result for empty input', () => {
    const result = sanitizeSvg('');

    expect(result.ast.markup).toBe('');
    expect(result.ast.root).toBeNull();
    expect(result.report.empty).toBe(true);
    expect(result.report.removed).toHaveLength(0);
  });

  /**
   * @description Whitespace-only input is treated as empty.
   */
  it('returns an empty result for whitespace-only input', () => {
    const result = sanitizeSvg('  \n\t  ');

    expect(result.report.empty).toBe(true);
  });

  /**
   * @description The report.removed list records what was stripped so
   * the importer can surface "this element was dropped" warnings to
   * the user per IO-D-18.
   */
  it('records removed elements and attributes in the report', () => {
    const result = sanitizeSvg('<rect onclick="x()"><script>y()</script></rect>');

    expect(result.report.removed.length).toBeGreaterThan(0);

    const hasScriptRemoval = result.report.removed.some((entry) => entry.kind === 'element' && entry.name === 'script');
    const hasOnclickRemoval = result.report.removed.some(
      (entry) => entry.kind === 'attribute' && entry.name === 'onclick',
    );

    expect(hasScriptRemoval).toBe(true);
    expect(hasOnclickRemoval).toBe(true);
  });

  /**
   * @description The sanitized markup is valid enough to re-parse
   * into a DOM — the AST root must be a real `Element` when the input
   * contains non-empty SVG content.
   */
  it('parses the sanitized markup into a DOM root element', () => {
    const result = sanitizeSvg('<rect width="10" height="10"/>');

    expect(result.ast.root).not.toBeNull();
    expect(result.ast.root?.nodeName.toLowerCase()).toBe('svg');
    expect(result.ast.root?.querySelector('rect')).not.toBeNull();
  });
});
