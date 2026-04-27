import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

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

interface ManifestFixture {
  readonly name: string;
  readonly source: string;
  readonly upstreamName: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly tags: readonly string[];
}

interface ManifestSource {
  readonly repository: string;
  readonly commit: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly fixtureRoot: string;
}

interface Manifest {
  readonly schemaVersion: number;
  readonly description: string;
  readonly sources: Readonly<Record<string, ManifestSource>>;
  readonly fixtures: readonly ManifestFixture[];
}

const MANIFEST_SCHEMA_VERSION = 1;
const CORPUS_DIR = resolve(process.cwd(), 'test-fixtures/pptx/corpus');
const CACHE_DIR = resolve(CORPUS_DIR, '.cache');
const MANIFEST_PATH = resolve(CORPUS_DIR, 'manifest.json');

interface CachedFixture {
  readonly entry: ManifestFixture;
  readonly bytes: Uint8Array;
}

function readManifest(): Manifest | null {
  try {
    const text = readFileSync(MANIFEST_PATH, 'utf8');
    const parsed: unknown = JSON.parse(text);

    if (!isManifest(parsed)) return null;
    if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) return null;

    return parsed;
  } catch {
    return null;
  }
}

function isManifest(value: unknown): value is Manifest {
  if (value === null || typeof value !== 'object') return false;

  const r = value as Record<string, unknown>;

  return (
    typeof r['schemaVersion'] === 'number' &&
    typeof r['description'] === 'string' &&
    typeof r['sources'] === 'object' &&
    Array.isArray(r['fixtures'])
  );
}

function loadCachedFixture(entry: ManifestFixture): CachedFixture | null {
  const path = join(CACHE_DIR, entry.name);

  try {
    const st = statSync(path);

    if (!st.isFile()) return null;
  } catch {
    return null;
  }

  const bytes = readFileSync(path);

  return { entry, bytes: new Uint8Array(bytes) };
}

function sha256Hex(buffer: Uint8Array): string {
  const h = createHash('sha256');

  h.update(buffer);

  return h.digest('hex');
}

const manifest = readManifest();
const cached: readonly CachedFixture[] = (() => {
  if (manifest === null) return [];

  return manifest.fixtures
    .map((entry) => loadCachedFixture(entry))
    .filter((entry): entry is CachedFixture => entry !== null);
})();

describe('permissive PPTX corpus', () => {
  if (manifest === null) {
    it.skip('manifest.json missing or invalid (run pptx:corpus:fetch to enable)', () => {
      expect(MANIFEST_PATH).toContain('manifest.json');
    });

    return;
  }

  if (cached.length === 0) {
    it.skip(`no cached fixtures (run \`npm run pptx:corpus:fetch -w @broadset/formats\` to fetch ${String(manifest.fixtures.length)} fixtures)`, () => {
      expect(manifest.fixtures.length).toBeGreaterThan(0);
    });

    return;
  }

  for (const fixture of cached) {
    it(`hash matches manifest: ${fixture.entry.name}`, () => {
      const actual = sha256Hex(fixture.bytes);

      expect(actual, 'cached bytes drift from manifest — re-run pptx:corpus:fetch').toBe(fixture.entry.sha256);
      expect(fixture.bytes.byteLength).toBe(fixture.entry.bytes);
    });

    it(`survives import + re-export: ${fixture.entry.name}`, () => {
      const result = importAndAssert(fixture.entry.name, fixture.bytes);

      expect(result.reExportedBytes).toBeGreaterThan(0);
    });
  }
});
