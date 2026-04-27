/**
 * P7.7o — Tool-ecosystem SVG fixture coverage (real-tool exports).
 *
 * The earlier real-world fixtures (`real-world-fixtures.test.ts`)
 * pinned icon-dispenser shapes (Material, Heroicons, Bootstrap)
 * and the W3C reference samples. This unit broadens coverage to
 * the **authoring-tool** ecosystem the production importer
 * actually faces in user uploads, using **license-clean real
 * exports** from each tool (see `__fixtures__/MANIFEST.md` for
 * commit-pinned source URLs):
 *
 * | Fixture                              | Source / License | Surface |
 * | ------------------------------------ | ---------------- | ------- |
 * | `d3-elm-visualization.svg`           | gampleman/elm-visualization (MIT) | d3-shape axis output: `<path class="domain">`, `<g class="tick">` per tick, programmatic translates |
 * | `chrome-outerhtml.svg`               | Broadset (MIT)   | Browser `element.outerHTML` canonical form |
 * | `illustrator-cordova-bug.svg`        | apache/cordova-docs (Apache-2.0) | Real Adobe Illustrator 19.1.0 export — `<style>` CSS-class system |
 * | `illustrator-switch-wrapper.svg`     | Broadset (MIT, synthetic) | Illustrator `<switch>` / `<foreignObject>` Adobe wrapper |
 * | `figma-adobe-spectrum.svg`           | adobe/react-spectrum (Apache-2.0) | Real Figma export — `data-name`, dual-rect stroke, `var(--…)` fills |
 * | `sketch-wikimedia-adguard.svg`       | Wikimedia AdGuard.svg (CC-BY-SA + PD-textlogo) | Real Sketch 52.2 export — Generator comment, `<title>`/`<desc>`, cascading null paint |
 * | `affinity-jimschubert-hi.svg`        | jimschubert/hi (Apache-2.0) | Real Affinity Designer export — `xmlns:serif`, miterlimit:1.41421, top-level `<clipPath>` |
 *
 * Each test asserts native geometry (no opaque-svg fallback for
 * shapes the spec promises native), no spurious sanitisation
 * warnings on benign inputs, and chain round-trip preserves at
 * least one native element.
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
   * @description d3-shape axis idiom (real elm-visualization
   * output, byte-equivalent to d3): nested `<g>` with `class`,
   * programmatic `translate()` per tick, `<path class="domain">`,
   * `<line>` siblings + `<text>` labels per tick. The importer
   * MUST hydrate the path + tick lines + labels as native
   * geometry, not collapse the `<g class="tick">` hierarchy or
   * fall back to opaque-svg. d3 emits a LOT of nested groups; the
   * group-walker handles them without warnings.
   */
  it('d3 axis (real export): tick groups + lines + text hydrate natively', () => {
    const svg = loadFixture('d3-elm-visualization.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    // d3 emits axis-domain as `<path>`, ticks as `<line>` (which
    // we hydrate as `path`), and labels as `<text>`.
    expect(types).toContain('path');
    expect(types).toContain('text');
    expect(types).not.toContain('svg'); // no opaque fallback

    // Benign authoring-tool input — no namespace / sanitisation
    // warnings expected.
    expect(warnings).toEqual([]);
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
   * @description Real Adobe Illustrator 19.1.0 export
   * (apache/cordova-docs `bug_icon.svg`, Apache-2.0). Has the
   * canonical `Generator: Adobe Illustrator` comment + a
   * `<style type="text/css">` block carrying `.stN` class
   * definitions, with shapes referencing them via `class="stN"`.
   * The importer MUST:
   * - Drop the top-level `<style>` element silently (the CSS
   *   resolver consumes it before the walk)
   * - Apply the class rules so shapes get their fills resolved
   *   (`.st1{fill:#3892AB}` → solid fill on the polygon)
   * - Hydrate rects + polygons + paths natively (no opaque-svg).
   */
  it('Illustrator (real export): <style> CSS-class system applies fills natively', () => {
    const svg = loadFixture('illustrator-cordova-bug.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);
    const filledPath = document.elements.find(
      (el) => el.type === 'path' && typeof el.style.fill === 'object' && el.style.fill.kind === 'solid',
    );

    expect(types).toContain('rectangle');
    expect(types).toContain('path'); // polygons → paths
    expect(types).not.toContain('svg'); // no opaque fallback
    expect(filledPath).toBeDefined(); // CSS .stN rule resolved to a real fill
    expect(warnings).toEqual([]);
  });

  /**
   * @description Synthetic Illustrator `<switch>` / `<foreignObject>`
   * wrapper coverage. The Illustrator-CS through CC envelope
   * places a `<foreignObject requiredExtensions="ns_ai">` first
   * child (sanitiser strips the foreignObject) followed by a
   * `<g i:extraneous="self">` carrying the real geometry. We
   * could not find a small (<10 KB) MIT/Apache/CC0 real export
   * with this exact wrapper, so the surface stays synthetic. The
   * importer MUST unwrap the `<switch>` per SVG 1.1 §5.8 and
   * recurse into the first child without an unsupported
   * `requiredExtensions` constraint.
   */
  it('Illustrator <switch> wrapper: foreignObject sibling unwraps to native geometry', () => {
    const svg = loadFixture('illustrator-switch-wrapper.svg');
    const { document } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    expect(types).toContain('rectangle');
    expect(types).toContain('ellipse'); // <circle>
    expect(types).not.toContain('svg');
  });

  /**
   * @description Real Figma export (adobe/react-spectrum
   * `ListBox.svg`, Apache-2.0). Has `data-name` attrs on every
   * grouping element (the Figma layer-name surface), the
   * distinctive **dual-`<rect>` stroke pattern** (one fill rect +
   * one stroke rect with a 0.5-px offset to render strokes
   * crisply on retina), and `fill="var(--…)"` references to CSS
   * custom properties. The importer MUST:
   * - NOT confuse `data-name` with Broadset's `data-bs-id`
   * - Hydrate the dual rects natively (no opaque-svg fallback)
   * - Preserve `<text>` / `<tspan>` content
   * - Pass through unknown CSS-variable fills as opaque strings
   *   (renderer will resolve them at render time).
   */
  it('Figma (real export): data-name + dual-rect stroke + var(--) fills hydrate natively', () => {
    const svg = loadFixture('figma-adobe-spectrum.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);

    expect(types).toContain('path');
    expect(types).toContain('rectangle');
    expect(types).toContain('text');
    // No spurious sanitisation warnings — `data-name` and CSS
    // variable refs are benign.
    expect(warnings).toEqual([]);
  });

  /**
   * @description Real Sketch 52.2 export (Wikimedia AdGuard.svg,
   * CC-BY-SA 4.0 + PD-textlogo). Has the `Generator: Sketch 52.2`
   * comment, `<title>logo@2x</title>` + `<desc>Created with
   * Sketch.</desc>` blocks, a `<g id="logo">` wrapper with
   * cascading `stroke="none" fill="none" fill-rule="evenodd"`
   * (children override with explicit fills), and the canonical
   * Sketch nested-group hierarchy (`Group-10 → Group-9 → Group-8 → Group-7`).
   * The importer MUST:
   * - Drop `<title>` / `<desc>` silently
   * - Hydrate paths + rect natively, with the cascading null
   *   paint correctly inherited and child fills overriding.
   */
  it('Sketch (real export): <title>/<desc> dropped, native geometry with cascading paint', () => {
    const svg = loadFixture('sketch-wikimedia-adguard.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const path = document.elements.find((el) => el.type === 'path');

    expect(rect).toBeDefined();
    expect(path).toBeDefined();

    // <title> / <desc> are NOT misimported as Broadset text elements.
    const textEls = document.elements.filter((el) => el.type === 'text');

    expect(textEls).toHaveLength(0);
    expect(warnings).toEqual([]);
  });

  /**
   * @description Real Affinity Designer export (jimschubert/hi
   * `assets/icon.svg`, Apache-2.0). Has the `<!-- Export settings
   * for Affinity Designer: ... -->` comment, `xmlns:serif="…/serif"`
   * namespace, root `style="…stroke-miterlimit:1.41421;"` (Affinity's
   * distinctive √2 default miterlimit), and a top-level
   * `<clipPath>` element (Affinity emits clipPaths OUTSIDE
   * `<defs>`). The importer MUST:
   * - Drop the top-level `<clipPath>` silently (defs-only element;
   *   `buildDefsBundle` already extracted the path data)
   * - Hydrate paths + ellipses natively
   * - Resolve `style="…"` attribute paint values applied at the
   *   root via inheritance.
   */
  it('Affinity (real export): top-level <clipPath> dropped silently, paths hydrate natively', () => {
    const svg = loadFixture('affinity-jimschubert-hi.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const types = document.elements.map((el) => el.type);
    const path = document.elements.find((el) => el.type === 'path');

    expect(types).toContain('path');
    expect(types).toContain('ellipse');
    expect(path).toBeDefined();
    expect(types).not.toContain('svg'); // no opaque fallback
    expect(warnings).toEqual([]);
  });

  /**
   * @description Every tool-ecosystem fixture survives the
   * import → re-export → re-import chain without losing all
   * native elements. The safety net catches a regressed exporter
   * that silently emits an empty body.
   */
  it.each([
    ['d3-elm-visualization.svg'],
    ['chrome-outerhtml.svg'],
    ['illustrator-cordova-bug.svg'],
    ['illustrator-switch-wrapper.svg'],
    ['figma-adobe-spectrum.svg'],
    ['sketch-wikimedia-adguard.svg'],
    ['affinity-jimschubert-hi.svg'],
  ])('%s: chain round-trip preserves at least one native element', async (filename) => {
    const result = await runImportReExportChain(loadFixture(filename));

    expect(result.importedTypes.length).toBeGreaterThan(0);
    expect(result.reImportedTypes.length).toBeGreaterThan(0);
    expect(result.reImportedTypes).not.toContain('svg'); // no opaque fallback after the chain
  });
});
