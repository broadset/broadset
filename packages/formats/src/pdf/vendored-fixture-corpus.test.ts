import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCachedCorpusFixtures } from '../_shared/test-infrastructure/corpus-fixtures';
import { exportPdfBytes, importPdfDocument } from './index';

/**
 * Fetched-fixture corpus tests. Loads every manifest-fetched PDF under
 * `test-fixtures/pdf/corpus/.cache/` (plus any local-only files
 * dropped into `__fixtures__/local/`), runs them through the importer,
 * and asserts the importer:
 *
 *  - Accepts the bytes (or surfaces a clean warning) — never crashes.
 *  - Produces a non-empty Broadset document with a valid canvas.
 *  - Survives a re-export pass via the Broadset PDF exporter.
 *
 * Source corpus: veraPDF Consortium,
 * https://github.com/veraPDF/veraPDF-corpus. Licence: CC BY 4.0 — see
 * `test-fixtures/pdf/corpus/README.md` for attribution and the
 * manifest's commit-pinned source paths.
 *
 * Adobe / Microsoft / Apple binary fixtures are NOT redistributable
 * and therefore NOT vendored here. Drop them under `__fixtures__/local/`
 * (gitignored) to exercise this suite against real producer output
 * locally.
 */

const LOCAL_FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/local');
const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/pdf/corpus');
const corpus = loadCachedCorpusFixtures(CORPUS_DIR);

interface FixtureFile {
  readonly path: string;
  readonly relativeName: string;
  readonly bytes: Uint8Array;
}

async function loadLocalFixtures(): Promise<readonly FixtureFile[]> {
  const files: FixtureFile[] = [];

  try {
    const entries = await readdir(LOCAL_FIXTURE_DIR);

    for (const entry of [...entries].sort((a, b) => a.localeCompare(b))) {
      if (!entry.toLowerCase().endsWith('.pdf')) continue;

      const full = join(LOCAL_FIXTURE_DIR, entry);
      const info = await stat(full);

      if (!info.isFile()) continue;

      const bytes = new Uint8Array(await readFile(full));

      files.push({ path: full, relativeName: `local/${entry}`, bytes });
    }
  } catch {
    // Directory missing (`local/` is gitignored, may not exist) — skip.
  }

  return files;
}

const cachedCorpus: readonly FixtureFile[] = corpus.cached.map((fixture) => ({
  path: fixture.absolutePath,
  relativeName: `corpus/${fixture.entry.name}`,
  bytes: fixture.bytes,
}));
const localOnly = await loadLocalFixtures();
const allFixtures: readonly FixtureFile[] = [...cachedCorpus, ...localOnly];

describe('Fetched real-binary fixture corpus (veraPDF + local)', () => {
  /**
   * @description Hash-gate every fetched corpus file so stale local
   * bytes fail loudly instead of exercising the wrong upstream input.
   */
  for (const fixture of corpus.cached) {
    it(`hash matches manifest: ${fixture.entry.name}`, () => {
      expect(fixture.actualSha256, 'cached bytes drift from manifest - re-run pdf:corpus:fetch').toBe(
        fixture.entry.sha256,
      );
      expect(fixture.actualBytes).toBe(fixture.entry.bytes);
    });
  }

  if (allFixtures.length === 0) {
    it.skip(`no cached fixtures (run \`npm run pdf:corpus:fetch -w @broadset/formats\` to fetch ${String(corpus.manifest.fixtures.length)} fixtures)`, () => {
      expect(corpus.manifest.fixtures.length).toBeGreaterThan(0);
    });

    return;
  }

  /**
   * @description Every fixture starts with `%PDF-` (otherwise the
   * file is not a PDF and shouldn't be in the corpus).
   */
  it.each(allFixtures)('%s starts with the %PDF- header', (fixture) => {
    const head = new TextDecoder('latin1').decode(fixture.bytes.subarray(0, 5));

    expect(head).toBe('%PDF-');
  });

  /**
   * @description The importer accepts every fixture without
   * crashing. Some fixtures are deliberately non-conforming PDF/A
   * — they MAY surface warnings, but the importer MUST never throw
   * an unhandled exception.
   */
  it.each(allFixtures)('imports %s without crashing', async (fixture) => {
    const result = await importPdfDocument(fixture.bytes);

    expect(result.document).toBeDefined();
    expect(result.document.canvas).toBeDefined();

    // A failure warning indicates the PDF was so malformed pdf-lib
    // refused to load it. None of the vendored conforming fixtures
    // should hit this; deliberately-failing fixtures may.
    if (fixture.relativeName.includes('-pass')) {
      expect(result.warnings.find((w) => w.includes('failed'))).toBeUndefined();
    }
  });

  /**
   * @description Every fixture round-trips through the Broadset
   * exporter — the imported document is stable enough to feed back
   * through the export pipeline without crashing.
   */
  it.each(allFixtures)('round-trips %s through Broadset import → export', async (fixture) => {
    const firstImport = await importPdfDocument(fixture.bytes);
    const reExported = await exportPdfBytes(firstImport.document);

    expect(reExported.length).toBeGreaterThan(100);
    // Sanity: re-export starts with the PDF header.
    expect(new TextDecoder('latin1').decode(reExported.subarray(0, 5))).toBe('%PDF-');
  });
});
