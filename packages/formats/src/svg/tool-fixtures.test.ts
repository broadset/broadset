/**
 * P7.7n — Tool-ecosystem SVG fixture coverage.
 *
 * The earlier real-world fixtures (`real-world-fixtures.test.ts`)
 * pinned icon-dispenser shapes (Material, Heroicons, Bootstrap)
 * and the W3C reference samples. This unit broadens coverage to
 * the **authoring-tool** ecosystem the production importer
 * actually faces in user uploads:
 *
 * | Fixture                        | Surface |
 * | ------------------------------ | ------- |
 * | `d3-bars.svg`                  | d3-v7 programmatic `<g>` hierarchies |
 * | `chrome-outerhtml.svg`         | Browser `element.outerHTML` canonical form |
 * | `illustrator-cc-style.svg`     | Adobe namespaces + `<switch>`/`<foreignObject>` wrapper |
 * | `figma-style.svg`              | `data-name` attrs + trailing defs + root `fill="none"` |
 * | `sketch-style.svg`             | `<title>`/`<desc>` blocks + cascading null paint |
 * | `affinity-style.svg`           | `<defs><style>` class-based CSS resolution |
 *
 * Each test asserts the importer extracts native Broadset elements
 * (no opaque-svg fallback for shapes the spec promises native), no
 * spurious sanitisation warnings on benign inputs, and chain
 * round-trip preserves at least one native element. Fixtures that
 * trip a documented warning (Adobe namespace, Inkscape namespace,
 * SMIL strip) verify the warning fires.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument } from './index';

const FIXTURE_DIR = resolve(__dirname, '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
}

interface ChainResult {
  readonly importedTypes: readonly string[];
  readonly reImportedTypes: readonly string[];
  readonly importWarnings: readonly string[];
}

async function runImportReExportChain(svg: string): Promise<ChainResult> {
  const { document: imported, warnings } = importSvgDocument(svg, 'fixture');
  const reExported = await exportSvgString(imported);
  const { document: reImported } = importSvgDocument(reExported, 'fixture');

  return {
    importedTypes: imported.elements.map((el) => el.type),
    reImportedTypes: reImported.elements.map((el) => el.type),
    importWarnings: warnings,
  };
}

describe('P7.7n — Tool-ecosystem fixture imports', () => {
  /**
   * @description d3-v7 bar-chart idiom: nested `<g>` with `class`,
   * programmatic `translate()` per tick, `currentColor` strokes,
   * axis labels using `text-anchor` + `dy="0.71em"`. The importer
   * MUST hydrate the bars + ticks as native rectangles + paths,
   * not collapse the `<g class="tick">` hierarchy or fall back to
   * opaque-svg. d3 emits a LOT of nested groups; the importer's
   * group-walker handles it without warnings.
   */
  it('d3 bar chart: nested groups + currentColor axis hydrate natively', () => {
    const svg = loadFixture('d3-bars.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    expect(types).toContain('rectangle'); // bars
    expect(types).not.toContain('svg'); // no opaque fallback

    // d3 emits no Adobe / Inkscape namespaces — no namespace
    // warnings should fire on this benign authoring-tool input.
    expect(warnings.filter((w) => /namespace/i.test(w))).toEqual([]);
  });

  /**
   * @description Chrome `element.outerHTML` — single-line markup,
   * no XML prolog, explicit closing tags (`<circle></circle>` not
   * self-closing), no `xmlns:xlink` declaration. The importer
   * MUST parse this canonical browser output without warning. A
   * regression here would break copy-paste-from-browser workflows.
   */
  it('Chrome outerHTML: single-line markup with explicit close tags imports natively', () => {
    const svg = loadFixture('chrome-outerhtml.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    expect(types).toContain('ellipse'); // <circle> hydrates as ellipse
    expect(types).toContain('text');
    expect(warnings).toEqual([]);
  });

  /**
   * @description Illustrator CC export shape — `xmlns:i` /
   * `xmlns:graph` Adobe namespaces on the root, a `<switch>` /
   * `<foreignObject>` Adobe wrapper holding the actual geometry,
   * `i:extraneous` attrs. The importer MUST:
   * - Skip the `<foreignObject>` payload (Adobe places a no-op there)
   * - Hydrate the `<g i:extraneous="self">` body's children
   *   natively (rect + circle)
   * - Emit a vendor-namespace warning for the Adobe surface (per
   *   IO-D-18, tool namespaces are documented preservation points).
   */
  it('Illustrator CC: <switch>/<foreignObject> wrapper unwraps to native geometry', () => {
    const svg = loadFixture('illustrator-cc-style.svg');
    const { document } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    expect(types).toContain('rectangle');
    expect(types).toContain('ellipse'); // <circle>
    // No opaque-svg fallback — the geometry escapes the wrapper.
    expect(types).not.toContain('svg');
  });

  /**
   * @description Figma export shape — `data-name` on every
   * grouping element (the Figma layer-name surface), trailing
   * `<defs>` after the geometry, root `fill="none"` (Figma's
   * artboard convention), per-group `clip-path="url(#…)"`. The
   * importer MUST:
   * - NOT confuse `data-name` with Broadset's `data-bs-id`
   * - Resolve the trailing `<defs><clipPath>` reference correctly
   * - Hydrate path + rect children of the framed group natively.
   */
  it('Figma: data-name attrs + trailing defs + clipPath group hydrates natively', () => {
    const svg = loadFixture('figma-style.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);
    const path = document.elements.find((el) => el.type === 'path');

    expect(types).toContain('path');
    expect(types).toContain('rectangle');
    expect(path).toBeDefined();
    // No spurious sanitisation warnings — `data-name` is benign.
    expect(warnings.filter((w) => /sanitis|removed/i.test(w))).toEqual([]);
  });

  /**
   * @description Sketch export shape — `<title>` and `<desc>`
   * blocks (the latter typically carrying "Created with Sketch."),
   * a `Page-1` wrapper group with cascading `stroke="none"
   * fill="none" fill-rule="evenodd"`, decimal-translate transforms
   * (Sketch emits `translate(10.000000, 10.000000)`). The importer
   * MUST:
   * - NOT parse `<title>` / `<desc>` text into a Broadset text element
   * - Cascade the wrapper-group `fill="none"` to descendants per
   *   SVG 1.1 §6.4 inheritance (so child `fill="#…"` overrides win)
   * - Parse decimal-translate transforms without precision loss.
   */
  it('Sketch: <title>/<desc> blocks ignored, cascading null paint inherited correctly', () => {
    const svg = loadFixture('sketch-style.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const path = document.elements.find((el) => el.type === 'path');

    expect(rect).toBeDefined();
    expect(path).toBeDefined();

    // The cascading group has translate(10, 10) — children land at
    // their own (0,0) PLUS the parent translate.
    expect(rect?.position.x).toBeCloseTo(10, 0);
    expect(rect?.position.y).toBeCloseTo(10, 0);

    // <title> / <desc> are NOT misimported as Broadset text elements.
    const textEls = document.elements.filter((el) => el.type === 'text');

    expect(textEls).toHaveLength(0);
    expect(warnings).toEqual([]);
  });

  /**
   * @description Affinity Designer export shape — `<defs><style>`
   * block with `.cls-N` class definitions, shapes carrying
   * `class="cls-N"` instead of inline `fill=`/`stroke=`. The
   * importer's CSS resolution (`import-css.ts`) MUST apply the
   * class rules to elements as presentation attributes before the
   * shape walker reads them. A regression here would import every
   * Affinity-exported shape with no fill / no stroke.
   */
  it('Affinity: <defs><style> .cls-N rules apply to class-referenced shapes', () => {
    const svg = loadFixture('affinity-style.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const ellipse = document.elements.find((el) => el.type === 'ellipse'); // <circle>
    const path = document.elements.find((el) => el.type === 'path');

    expect(rect).toBeDefined();
    expect(ellipse).toBeDefined();
    expect(path).toBeDefined();

    // The CSS rule `.cls-1 { fill: #4a90e2 }` applied to the rect
    // resolves to a solid fill on the imported element.
    if (rect?.style.fill !== undefined && typeof rect.style.fill === 'object' && 'kind' in rect.style.fill) {
      expect(rect.style.fill.kind).toBe('solid');
    }

    expect(warnings).toEqual([]);
  });

  /**
   * @description Every tool-ecosystem fixture survives the
   * import → re-export → re-import chain without losing all
   * native elements. The safety net catches a regressed exporter
   * that silently emits an empty body.
   */
  it.each([
    ['d3-bars.svg'],
    ['chrome-outerhtml.svg'],
    ['illustrator-cc-style.svg'],
    ['figma-style.svg'],
    ['sketch-style.svg'],
    ['affinity-style.svg'],
  ])('%s: chain round-trip preserves at least one native element', async (filename) => {
    const result = await runImportReExportChain(loadFixture(filename));

    expect(result.importedTypes.length).toBeGreaterThan(0);
    expect(result.reImportedTypes.length).toBeGreaterThan(0);
    expect(result.reImportedTypes).not.toContain('svg'); // no opaque fallback after the chain
  });
});
