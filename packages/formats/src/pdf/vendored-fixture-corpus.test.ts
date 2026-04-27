import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { exportPdfBytes, importPdfDocument } from './index';

/**
 * Vendored-fixture corpus tests. Loads every committed binary PDF
 * under `__fixtures__/verapdf/` (plus any local-only files dropped
 * into `__fixtures__/local/`), runs them through the importer, and
 * asserts the importer:
 *
 *  - Accepts the bytes (or surfaces a clean warning) — never crashes.
 *  - Produces a non-empty Broadset document with a valid canvas.
 *  - Survives a re-export pass via the Broadset PDF exporter.
 *
 * Source corpus: veraPDF Consortium, https://github.com/veraPDF/veraPDF-corpus
 * Licence: CC BY 4.0 — see `__fixtures__/verapdf/PROVENANCE.md` for full
 * attribution and per-file source paths.
 *
 * Adobe / Microsoft / Apple binary fixtures are NOT redistributable
 * and therefore NOT vendored here. Drop them under `__fixtures__/local/`
 * (gitignored) to exercise this suite against real producer output
 * locally.
 */

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

interface FixtureFile {
  readonly path: string;
  readonly relativeName: string;
  readonly bytes: Uint8Array;
}

async function loadFixturesFrom(subdir: string): Promise<readonly FixtureFile[]> {
  const dir = join(FIXTURE_DIR, subdir);
  const files: FixtureFile[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of [...entries].sort((a, b) => a.localeCompare(b))) {
      if (!entry.toLowerCase().endsWith('.pdf')) continue;

      const full = join(dir, entry);
      const info = await stat(full);

      if (!info.isFile()) continue;

      const bytes = new Uint8Array(await readFile(full));

      files.push({ path: full, relativeName: `${subdir}/${entry}`, bytes });
    }
  } catch {
    // Directory missing (`local/` is gitignored, may not exist) — skip.
  }

  return files;
}

const vendored = await loadFixturesFrom('verapdf');
const localOnly = await loadFixturesFrom('local');
const allFixtures: readonly FixtureFile[] = [...vendored, ...localOnly];

describe('Vendored real-binary fixture corpus (veraPDF + local)', () => {
  /**
   * @description Sanity check — at least the vendored corpus must
   * be present in the worktree. Catches the case where someone
   * accidentally `.gitignore`s `__fixtures__/verapdf/` or removes
   * the files.
   */
  it('vendors at least one real PDF fixture', () => {
    expect(vendored.length).toBeGreaterThan(0);
  });

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
