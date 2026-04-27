import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { buildCanonicalDocument } from './fixtures/canonical';

/**
 * @description LibreOffice headless verification — proves a Broadset-
 * exported `.pptx` opens cleanly in LibreOffice (a stand-in for
 * PowerPoint's "Inspect Document" zero-warning gate). Closes the
 * spec acceptance criterion in `project/spec/formats/pptx.md`
 * Requirement: PPTX Export — Open Cleanly in PowerPoint.
 *
 * The harness skips cleanly when LibreOffice isn't on PATH so
 * contributors / CI without it stay green. Set `BROADSET_REQUIRE_LIBREOFFICE=1`
 * to fail rather than skip — that's what the dedicated CI job sets.
 *
 * Strategy: build a canonical fixture (rectangle + ellipse + text +
 * path), pipe through `soffice --headless --convert-to pdf`, and
 * assert the PDF is non-trivial. PDF generation exercises every
 * layer of LibreOffice's OOXML parser (theme, master, layout, slide,
 * shapes, runs, fills) without a UI dependency.
 */

const REQUIRE_LIBREOFFICE = process.env['BROADSET_REQUIRE_LIBREOFFICE'] === '1';
const MIN_PDF_BYTES = 1024;

function findLibreOffice(): string | null {
  const candidates = ['soffice', 'libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];

  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });

    if (result.status === 0) return cmd;
  }

  return null;
}

function buildCanonicalFixture(): Uint8Array {
  return exportPptxBytes(buildCanonicalDocument());
}

const lo = findLibreOffice();

describe('LibreOffice headless verification', () => {
  if (lo === null) {
    if (REQUIRE_LIBREOFFICE) {
      it('LibreOffice not installed (BROADSET_REQUIRE_LIBREOFFICE=1)', () => {
        expect.fail('LibreOffice (soffice / libreoffice) is not on PATH but BROADSET_REQUIRE_LIBREOFFICE=1');
      });

      return;
    }

    it.skip('LibreOffice not installed (set BROADSET_REQUIRE_LIBREOFFICE=1 to fail rather than skip)', () => {
      // Skipped on purpose. The CI job that owns this gate installs
      // libreoffice via apt before running with REQUIRE=1.
      expect(lo).toBeNull();
    });

    return;
  }

  it(`canonical Broadset PPTX converts to a non-trivial PDF (${lo})`, () => {
    const bytes = buildCanonicalFixture();
    const dir = mkdtempSync(join(tmpdir(), 'broadset-libreoffice-'));
    const pptxPath = join(dir, 'canonical.pptx');

    writeFileSync(pptxPath, bytes);

    const result = spawnSync(lo, ['--headless', '--convert-to', 'pdf', pptxPath, '--outdir', dir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });

    expect(result.status, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);

    // LibreOffice prints info logs to stderr even on success, so the
    // structural-error check is /error/i (warnings can appear for
    // unrelated config like fc-cache). False positive risk is low —
    // we re-tighten when we see actual real-world stderr noise.
    if (/\berror\b/i.test(result.stderr)) {
      throw new Error(`LibreOffice stderr contains "error":\n${result.stderr}`);
    }

    const pdfPath = pptxPath.replace(/\.pptx$/, '.pdf');
    const pdfBytes = readFileSync(pdfPath);

    expect(pdfBytes.byteLength).toBeGreaterThan(MIN_PDF_BYTES);
  });
});
