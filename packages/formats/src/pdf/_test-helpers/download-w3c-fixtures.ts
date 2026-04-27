 
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Opt-in fetcher for the W3C / PDF Association public-domain PDF
 * test corpus. Run via `node --experimental-strip-types
 * packages/formats/src/pdf/_test-helpers/download-w3c-fixtures.ts`
 * to populate `packages/formats/src/pdf/__fixtures__/` with a small
 * set of real-producer PDFs from upstream test suites.
 *
 * Not run in CI by default — needs network. The
 * `producer-quirks.test.ts`, `cross-producer-features.test.ts`, and
 * `real-producer-fixtures.test.ts` suites cover what we can verify
 * without committed binaries; this script gives you the option to
 * add real-binary regression fixtures locally when network is
 * available.
 *
 * Sources:
 *  - PDF Association reference suite (CC-BY-4.0 / public domain).
 *  - veraPDF test corpus mirror (Apache-2.0).
 *  - W3C / WebAIM PDF accessibility samples (public domain).
 *
 * Each fixture is downloaded once and committed to git when a
 * developer chooses to refresh the corpus. Tests then read the
 * committed bytes deterministically.
 */

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');

interface Fixture {
  readonly url: string;
  readonly localName: string;
  readonly description: string;
}

/**
 * Curated fixture list. The URLs point at upstream test corpora that
 * carry permissive licenses for redistribution. Add entries here
 * when you discover a producer-quirk a real document exposes.
 */
const FIXTURES: readonly Fixture[] = [
  {
    url: 'https://www.w3.org/WAI/WCAG21/working-examples/pdf-tags/example.pdf',
    localName: 'w3c-tagged-example.pdf',
    description: 'W3C tagged-PDF example (PDF/UA tagging).',
  },
];

async function downloadOne(fixture: Fixture): Promise<void> {
  console.log(`Fetching ${fixture.url} → ${fixture.localName} ...`);

  const response = await fetch(fixture.url);

  if (!response.ok) {
    console.warn(`  skipped — HTTP ${String(response.status)}`);

    return;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const target = resolve(FIXTURE_DIR, fixture.localName);

  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(target, bytes);
  console.log(`  saved ${String(bytes.length)} bytes`);
}

async function main(): Promise<void> {
  console.log(`Downloading ${String(FIXTURES.length)} fixtures into ${FIXTURE_DIR}`);

  for (const fixture of FIXTURES) {
    try {
      await downloadOne(fixture);
    } catch (err) {
      console.warn(`  failed:`, err);
    }
  }

  console.log('Done. Commit __fixtures__/ to git when fixtures are vetted.');
}

void main();
