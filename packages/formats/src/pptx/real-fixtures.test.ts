import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptxWithReport } from './import';

/**
 * @description Real-world `.pptx` corpus harness.
 *
 * Drop licensed PowerPoint / Keynote / Google Slides / LibreOffice /
 * Canva exports into `packages/formats/test-fixtures/pptx/real/` (the
 * directory is git-ignored so corporate / proprietary content never
 * lands in the repo). This suite picks them up and runs the importer
 * + a re-export sanity check against each one.
 *
 * The harness skips cleanly when the directory is empty, so CI stays
 * green for contributors who can't ship licensed fixtures. Run locally
 * via `npm run test -- pptx/real-fixtures` once you've populated the
 * directory.
 *
 * Acceptance per fixture:
 * - Import doesn't throw.
 * - At least one element OR one warning is produced (an empty
 *   document with no warnings means we silently dropped everything).
 * - `extensions.pptx.dirty=false` on every imported element (untouched
 *   imports never have an "edit" provenance).
 * - Re-export produces a non-zero byte stream.
 *
 * Tighter assertions are intentionally absent — real fixtures vary
 * widely and over-asserting catches false negatives. The harness is
 * primarily a "does the importer survive arbitrary input" gate.
 */

const REAL_DIR = resolve(process.cwd(), 'test-fixtures/pptx/real');

interface RealFixture {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function loadRealFixtures(): readonly RealFixture[] {
  let entries: readonly string[];

  try {
    entries = readdirSync(REAL_DIR);
  } catch {
    return [];
  }

  const fixtures: RealFixture[] = [];

  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.pptx')) continue;

    const path = join(REAL_DIR, entry);

    try {
      const stat = statSync(path);

      if (!stat.isFile()) continue;
    } catch {
      continue;
    }

    fixtures.push({ name: entry, bytes: new Uint8Array(readFileSync(path)) });
  }

  return fixtures;
}

const fixtures = loadRealFixtures();

describe('real-world PPTX corpus', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures present (drop .pptx files in test-fixtures/pptx/real/ to enable)', () => {
      // Skipped on purpose. The directory is git-ignored. The
      // assertion below is a placeholder so lint's
      // "assertions-in-tests" rule sees a real expectation; the test
      // is `.skip`'d so it never runs.
      expect(REAL_DIR).toContain('test-fixtures/pptx/real');
    });

    return;
  }

  for (const fixture of fixtures) {
    it(`imports without throwing: ${fixture.name}`, () => {
      const report = importPptxWithReport(fixture.bytes);

      // Either we recovered something or we surfaced at least one
      // warning. Silent zero-zero is the failure mode this gate is
      // here to catch.
      const surfaced = report.document.elements.length > 0 || report.warnings.length > 0;

      expect(surfaced, 'expected at least one element or warning').toBe(true);

      // Provenance: untouched imports must initialise dirty=false on
      // every element so subsequent edits can flip the flag.
      for (const el of report.document.elements) {
        const ext = el.extensions['pptx'] as { readonly dirty?: boolean } | undefined;

        expect(ext?.dirty, `${el.id} extensions.pptx.dirty`).toBe(false);
      }
    });

    it(`re-exports without throwing: ${fixture.name}`, () => {
      const report = importPptxWithReport(fixture.bytes);
      const reExported = exportPptxBytes(report.document);

      expect(reExported.byteLength).toBeGreaterThan(0);
    });
  }
});
