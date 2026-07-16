import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCachedCorpusFixtures } from '../_shared/test-infrastructure/corpus-fixtures';
import { importAndAssert } from './fixture-harness';

/**
 * @description Permissively-licensed PPTX corpus — fetched-by-manifest.
 *
 * Reads `test-fixtures/pptx/corpus/manifest.json` (committed) and runs
 * each fixture through the same `importAndAssert` contract used by the
 * user-dropped harness in `real-fixtures.test.ts`. The fixture bytes
 * themselves live in `.cache/` (git-ignored) and are populated by
 * `npm run pptx:corpus:fetch -w @broadset/formats`.
 *
 * The harness skips cleanly when the cache is empty so CI without
 * network access (or contributors who haven't run the fetcher) still
 * pass. To enable real coverage, run the fetcher first.
 *
 * Each test verifies the cached bytes match the manifest hash before
 * exercising the importer — if upstream rewrites a fixture and a
 * stale .cache entry remains, the test fails loudly rather than
 * silently testing the wrong bytes.
 *
 * Why this exists: synthesised fixtures (`pptx/fixtures/external-tools.ts`)
 * exercise tool-specific quirks we know about. The corpus exercises
 * quirks we don't yet know about — bytes produced by real authoring
 * tools that we never anticipated.
 */

const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/pptx/corpus');
const corpus = loadCachedCorpusFixtures(CORPUS_DIR);
const cached = corpus.cached;

describe('permissive PPTX corpus', () => {
  if (cached.length === 0) {
    it.skip(`no cached fixtures (run \`npm run pptx:corpus:fetch -w @broadset/formats\` to fetch ${String(corpus.manifest.fixtures.length)} fixtures)`, () => {
      expect(corpus.manifest.fixtures.length).toBeGreaterThan(0);
    });

    return;
  }

  for (const fixture of cached) {
    it(`hash matches manifest: ${fixture.entry.name}`, () => {
      expect(fixture.actualSha256, 'cached bytes drift from manifest — re-run pptx:corpus:fetch').toBe(
        fixture.entry.sha256,
      );
      expect(fixture.actualBytes).toBe(fixture.entry.bytes);
    });

    it(`survives import + re-export: ${fixture.entry.name}`, async () => {
      const result = await importAndAssert(fixture.entry.name, fixture.bytes);

      expect(result.reExportedBytes).toBeGreaterThan(0);
    });
  }
});
