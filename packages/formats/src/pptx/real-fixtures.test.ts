import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importAndAssert } from './fixture-harness';

/**
 * @description Real-world `.pptx` corpus harness — user-dropped local files.
 *
 * Drop licensed PowerPoint / Keynote / Google Slides / LibreOffice /
 * Canva exports into `packages/formats/test-fixtures/pptx/real/` (the
 * directory is git-ignored so corporate / proprietary content never
 * lands in the repo). This suite picks them up and runs the importer
 * + a re-export sanity check against each one via `importAndAssert`.
 *
 * For permissively-licensed real-world fixtures (Apache POI / Tika /
 * python-pptx) see the parallel `corpus.test.ts` harness, which fetches
 * its inputs from upstream raw GitHub URLs pinned by SHA.
 *
 * The harness skips cleanly when the directory is empty, so CI stays
 * green for contributors who can't ship licensed fixtures. Run locally
 * via `npm run test -- pptx/real-fixtures` once you've populated the
 * directory.
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

describe('real-world PPTX corpus (user-dropped)', () => {
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
    it(`survives import + re-export: ${fixture.name}`, async () => {
      const result = await importAndAssert(fixture.name, fixture.bytes);

      expect(result.reExportedBytes).toBeGreaterThan(0);
    });
  }
});
