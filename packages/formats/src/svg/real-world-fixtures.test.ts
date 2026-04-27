/**
 * P7.7k — Real-world SVG fixture integration tests.
 *
 * The synthetic fixtures in `chain-round-trip.test.ts` exercise
 * the importer against shapes we *expected* to see; these
 * fixtures exercise the importer against shapes the dominant
 * icon dispensers and authoring tools actually produce. Each
 * fixture pins a distinct surface — see `__fixtures__/MANIFEST.md`
 * for the provenance + license matrix.
 *
 * Pattern: import the fixture, run the chain (re-export →
 * re-import), assert structural equivalence (element counts,
 * types, no opaque-svg fallback for shapes the spec promises
 * native, no spurious "scale dropped" / sanitisation warnings).
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

describe('P7.7k — Real-world SVG fixture import', () => {
  /**
   * @description Material Icons `home` — bare-path icon (the
   * dominant shape across icon dispensers). MUST hydrate as a
   * single Broadset `path` element with no opaque-svg
   * fallback, no sanitisation warnings, and survive the chain.
   */
  it('Material Icons home: bare path round-trips natively', async () => {
    const result = await runImportReExportChain(loadFixture('material-home.svg'));

    expect(result.importedTypes).toContain('path');
    expect(result.importedTypes).not.toContain('svg'); // no opaque fallback
    expect(result.reImportedTypes).toContain('path');
    expect(result.importWarnings).toEqual([]);
  });

  /**
   * @description Heroicons `pencil` outline — stroke-only icon.
   * The element imports as a `path` and the stroke properties
   * survive (`stroke-width`, `stroke-linecap`, `stroke-linejoin`)
   * via the style.
   */
  it('Heroicons pencil: stroke-only path keeps stroke properties', () => {
    const svg = loadFixture('heroicons-pencil.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const path = document.elements.find((el) => el.type === 'path');

    expect(path).toBeDefined();
    expect(path?.style.strokeWidth).toBeDefined();
    expect(path?.style.strokeLinecap).toBeDefined();
    expect(path?.style.strokeLinejoin).toBeDefined();
    expect(warnings).toEqual([]);
  });

  /**
   * @description Bootstrap Icons `gear-fill` — multi-subpath
   * `<path>` (outer ring + inner cutout). The baker MUST keep
   * BOTH sub-paths in the resulting `d`; collapsing to the
   * outer ring loses the gear teeth's empty centre.
   */
  it('Bootstrap gear: multi-subpath d survives import', () => {
    const svg = loadFixture('bootstrap-gear.svg');
    const { document } = importSvgDocument(svg, 'fixture');
    const path = document.elements.find((el) => el.type === 'path');
    const dStr = typeof path?.content === 'string' ? path.content : '';

    expect(path).toBeDefined();

    // Multi-subpath shape: at least two `M` commands (one per sub-path).
    const moveCommandCount = (dStr.match(/M/g) ?? []).length;

    expect(moveCommandCount).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description W3C linearGradient sample — the `<rect
   * fill="url(#grad-w3c)">` MUST hydrate as a Broadset
   * gradient fill (not flatten to a single solid colour from
   * the first stop).
   */
  it('W3C linearGradient: rect imports with gradient fill', () => {
    const svg = loadFixture('w3c-gradient.svg');
    const { document } = importSvgDocument(svg, 'fixture');
    const rect = document.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
    expect(rect?.style.fill.kind).toBe('gradient');

    if (rect?.style.fill.kind === 'gradient') {
      expect(rect.style.fill.gradient.stops.length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * @description Inkscape-shape sample — the importer surfaces
   * a warning naming the `inkscape:` (or `sodipodi:`) namespace
   * but otherwise hydrates the rect + circle natively. The
   * tool-namespace warning is the documented round-trip story.
   */
  it('Inkscape shapes: native shapes import + namespace warning fires', () => {
    const svg = loadFixture('inkscape-shapes.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const ellipse = document.elements.find((el) => el.type === 'ellipse');

    expect(rect).toBeDefined();
    expect(ellipse).toBeDefined();
    // Vendor namespace surfaces a warning per IO-D-18.
    expect(warnings.some((w) => /inkscape|sodipodi/i.test(w))).toBe(true);
  });

  /**
   * @description Complex hand-authored fixture — exercises the
   * full integration: `<tspan>` runs, group hierarchy with
   * transforms, positional `<rect x y>`, `<polygon>`, and
   * `<use>` dereferencing. Single test catches interactions
   * single-feature fixtures miss.
   */
  it('Complex document: tspan + groups + polygon + use round-trip together', () => {
    const svg = loadFixture('complex-document.svg');
    const { document, warnings } = importSvgDocument(svg, 'fixture');
    const text = document.elements.find((el) => el.type === 'text');
    const rect = document.elements.find((el) => el.type === 'rectangle');
    const path = document.elements.find((el) => el.type === 'path'); // polygon → path
    const groups = document.elements.filter((el) => el.type === 'group');

    expect(text).toBeDefined();
    expect(rect).toBeDefined();
    expect(path).toBeDefined();
    // Two `<g id>` parents in the source → two Broadset groups.
    expect(groups.length).toBeGreaterThanOrEqual(2);

    // <text> with <tspan>s hydrates as a structured TextBody (not
    // a flattened plain string).
    if (text !== undefined && typeof text.content !== 'string') {
      expect(text.content.paragraphs[0]?.runs.length).toBeGreaterThanOrEqual(2);
    } else {
      throw new Error('expected complex-document <text> to hydrate as a TextBody');
    }

    // The rect under `<g transform="translate(20, 100)">` lands
    // at the parent's translate offset (rect's own x="0" y="0"
    // adds zero, so position = (20, 100)).
    expect(rect?.position.x).toBeCloseTo(20, 0);
    expect(rect?.position.y).toBeCloseTo(100, 0);

    // No "scale dropped" warning — none of the transforms in
    // the fixture are baking transforms (translate-only).
    expect(warnings.some((w) => /scale\/skew on a <text>/i.test(w))).toBe(false);
  });

  /**
   * @description Every real-world fixture survives the
   * import → re-export → re-import chain without losing all
   * native elements (a no-op exporter would silently break
   * this; the assertion is the safety net).
   */
  it.each([
    ['material-home.svg'],
    ['heroicons-pencil.svg'],
    ['bootstrap-gear.svg'],
    ['w3c-gradient.svg'],
    ['inkscape-shapes.svg'],
    ['complex-document.svg'],
  ])('%s: chain round-trip preserves at least one native element', async (filename) => {
    const result = await runImportReExportChain(loadFixture(filename));

    expect(result.importedTypes.length).toBeGreaterThan(0);
    expect(result.reImportedTypes.length).toBeGreaterThan(0);
  });
});
