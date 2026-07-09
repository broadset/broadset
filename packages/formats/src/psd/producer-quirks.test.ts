import { describe, expect, it } from 'vitest';

import { buildProducerQuirksFixtures } from './__fixtures__/producer-quirks.fixture';
import { importPsdDocument } from './import-document';
import { validatePsdBytes } from './validate-psd';

/**
 * Producer-quirks corpus test — mirrors the role
 * `pdf/vendored-fixture-corpus.test.ts` plays for PDF/A. Each fixture
 * simulates a different producer choice (raw raster, nested groups,
 * many small layers, hidden layers, blend modes, opacity stacks).
 *
 * Every fixture MUST:
 *   - re-read with no parse errors via the cross-reader validator,
 *   - import via `importPsdDocument` without throwing, with a clean
 *     warning surface, and
 *   - produce a non-empty Broadset document for fixtures that carry
 *     mappable content (the empty-header fixture is exempt).
 */

const fixtures = buildProducerQuirksFixtures();

describe('PSD producer-quirks corpus', () => {
  for (const fixture of fixtures) {
    describe(fixture.name, () => {
      /**
       * @description The cross-reader validator MUST accept every
       * fixture — these are the simplest structural shapes a
       * downstream consumer would expect.
       */
      it('passes the cross-reader validator', () => {
        const result = validatePsdBytes(fixture.bytes);

        expect(result.errors).toHaveLength(0);
        expect(result.valid).toBe(true);
      });

      /**
       * @description The importer MUST handle each fixture without
       * throwing and without surfacing a "failed" warning.
       */
      it('imports without crashing or emitting failure warnings', () => {
        const result = importPsdDocument(fixture.bytes);

        expect(result.document.canvas).toBeDefined();
        expect(result.warnings.find((w) => w.toLowerCase().includes('failed'))).toBeUndefined();
      });
    });
  }

  /**
   * @description Non-empty fixtures MUST produce at least one element
   * after import — proves the importer extracted *something* from
   * the layer tree rather than silently dropping the producer's
   * content.
   */
  it('extracts at least one element from every non-empty fixture', () => {
    for (const fixture of fixtures) {
      if (fixture.name === 'empty-document') continue;

      const result = importPsdDocument(fixture.bytes);

      expect(result.document.elements.length, `${fixture.name} produced zero elements`).toBeGreaterThan(0);
    }
  });
});
