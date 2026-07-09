import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCachedCorpusFixtures } from '../_shared/test-infrastructure/corpus-fixtures';
import { exportSvgString, importSvgDocument } from './index';

const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/svg/corpus');
const corpus = loadCachedCorpusFixtures(CORPUS_DIR);
const cached = corpus.cached;
const utf8 = new TextDecoder();

describe('WPT SVG corpus', () => {
  if (cached.length === 0) {
    it.skip(`no cached fixtures (run \`npm run svg:corpus:fetch -w @broadset/formats\` to fetch ${String(corpus.manifest.fixtures.length)} fixtures)`, () => {
      expect(corpus.manifest.fixtures.length).toBeGreaterThan(0);
    });

    return;
  }

  for (const fixture of cached) {
    it(`hash matches manifest: ${fixture.entry.name}`, () => {
      expect(fixture.actualSha256, 'cached bytes drift from manifest - re-run svg:corpus:fetch').toBe(
        fixture.entry.sha256,
      );
      expect(fixture.actualBytes).toBe(fixture.entry.bytes);
    });

    it(`survives import + re-export + re-import: ${fixture.entry.name}`, async () => {
      const source = utf8.decode(fixture.bytes);
      const firstImport = importSvgDocument(source, fixture.entry.name);

      expect(firstImport.document.canvas).toBeDefined();
      expect(firstImport.document.elements.length + firstImport.warnings.length).toBeGreaterThan(0);

      const reExported = await exportSvgString(firstImport.document);

      expect(reExported.startsWith('<svg')).toBe(true);

      const secondImport = importSvgDocument(reExported, `re-${fixture.entry.name}`);

      expect(secondImport.document.canvas).toBeDefined();
      expect(secondImport.document.elements.length + secondImport.warnings.length).toBeGreaterThan(0);
    });
  }
});
