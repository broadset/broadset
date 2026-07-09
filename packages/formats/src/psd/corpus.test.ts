import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCachedCorpusFixtures } from '../_shared/test-infrastructure/corpus-fixtures';
import { exportPsdBytes, importPsdDocument } from './index';

const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/psd/corpus');
const corpus = loadCachedCorpusFixtures(CORPUS_DIR);
const cached = corpus.cached;

describe('permissive PSD corpus', () => {
  if (cached.length === 0) {
    it.skip(`no cached fixtures (run \`npm run psd:corpus:fetch -w @broadset/formats\` to fetch ${String(corpus.manifest.fixtures.length)} fixtures)`, () => {
      expect(corpus.manifest.fixtures.length).toBeGreaterThan(0);
    });

    return;
  }

  for (const fixture of cached) {
    it(`hash matches manifest: ${fixture.entry.name}`, () => {
      expect(fixture.actualSha256, 'cached bytes drift from manifest - re-run psd:corpus:fetch').toBe(
        fixture.entry.sha256,
      );
      expect(fixture.actualBytes).toBe(fixture.entry.bytes);
    });

    it(`survives import + re-export: ${fixture.entry.name}`, () => {
      const result = importPsdDocument(fixture.bytes);

      expect(result.document.canvas).toBeDefined();
      expect(result.document.elements.length + result.warnings.length).toBeGreaterThan(0);

      const reExported = exportPsdBytes(result.document);

      expect(reExported.byteLength).toBeGreaterThan(100);
      expect(new TextDecoder('latin1').decode(reExported.subarray(0, 4))).toBe('8BPS');
    });
  }
});
