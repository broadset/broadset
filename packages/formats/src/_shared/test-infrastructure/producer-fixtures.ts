/**
 * Shared producer-fixture harness used by every format's compatibility
 * suite (PPTX, PDF, PSD, SVG). Supports D.4 in
 * `project/implementation/production-readiness-status.md`.
 *
 * Two fixture surfaces:
 *
 * - **Class A — committed**: bytes live in
 *   `packages/formats/src/<format>/__fixtures__/`. Always available.
 * - **Class C — private mount**: bytes live outside the repo at
 *   `BROADSET_PRIVATE_FIXTURE_ROOT/<format>/<producer>/<file>`. The
 *   path is set per-developer; release-validation runs in CI mount the
 *   directory via secret-managed volume. When the env var is unset and
 *   `RELEASE_VALIDATION` is also unset, the harness skips the fixture
 *   with an explicit note instead of failing — local devs without the
 *   mount keep their normal `npm run test` green.
 *
 * Class B (generated-by-script) and Class D (manual-only) fixtures do
 * not flow through this harness.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

type ProducerFixtureFormat = 'pptx' | 'pdf' | 'psd' | 'svg';

export interface ProducerFixtureManifestRow {
  /** File path relative to the manifest's directory. */
  readonly file: string;
  readonly format: ProducerFixtureFormat;
  readonly producer: string;
  readonly producerVersion: string;
  readonly os: string;
  readonly exportPath: string;
  readonly license: 'public-domain' | 'MIT' | 'CC-BY-4.0' | 'CC0-1.0' | 'MPL-2.0' | 'private-mount';
  readonly expectedImport: string;
  readonly expectedReExport: string;
  readonly knownLimitations?: string;
}

interface CommittedFixtureLoaderOptions {
  /** Absolute path to the fixture's directory (typically `__fixtures__`). */
  readonly fixtureDir: string;
  readonly manifest: readonly ProducerFixtureManifestRow[];
}

interface PrivateFixtureLoaderOptions {
  readonly format: ProducerFixtureFormat;
  /**
   * Producer slug under `BROADSET_PRIVATE_FIXTURE_ROOT/<format>/`.
   * Slugified per the matrix in `real-producer-compatibility.md`
   * (e.g. `powerpoint-windows`, `illustrator-save-as`).
   */
  readonly producerSlug: string;
  /** Manifest rows describing the expected fixture set. */
  readonly manifest: readonly ProducerFixtureManifestRow[];
}

interface LoadedFixture {
  readonly bytes: Uint8Array;
  readonly manifest: ProducerFixtureManifestRow;
  readonly absolutePath: string;
}

const ALLOWED_FORMATS: ReadonlySet<ProducerFixtureFormat> = new Set(['pptx', 'pdf', 'psd', 'svg']);
const ALLOWED_LICENSES: ReadonlySet<ProducerFixtureManifestRow['license']> = new Set([
  'public-domain',
  'MIT',
  'CC-BY-4.0',
  'CC0-1.0',
  'MPL-2.0',
  'private-mount',
]);

const REQUIRED_STRING_FIELDS = [
  'file',
  'producer',
  'producerVersion',
  'os',
  'exportPath',
  'expectedImport',
  'expectedReExport',
] as const satisfies readonly (keyof ProducerFixtureManifestRow)[];

function checkRowFields(row: ProducerFixtureManifestRow, where: string, issues: string[]): void {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = row[field];

    if (typeof value !== 'string' || value.length === 0) {
      issues.push(`${where}: ${field} is empty`);
    }
  }

  if (!ALLOWED_FORMATS.has(row.format)) {
    issues.push(`${where}: format "${row.format}" is not in the allowlist`);
  }

  if (!ALLOWED_LICENSES.has(row.license)) {
    issues.push(`${where}: license "${row.license}" is not in the allowlist`);
  }
}

/**
 * Validate manifest rows fail-fast before any fixture I/O. Surfaces
 * malformed manifests (missing fields, bad license string, duplicate
 * `file` keys) at the top of the test run rather than scattered across
 * test bodies.
 */
export function validateManifest(manifest: readonly ProducerFixtureManifestRow[]): readonly string[] {
  const issues: string[] = [];
  const seenFiles = new Set<string>();

  for (let index = 0; index < manifest.length; index += 1) {
    const row = manifest[index];

    if (row === undefined) continue;

    const where = `manifest[${String(index)}] (file=${row.file})`;

    checkRowFields(row, where, issues);

    if (seenFiles.has(row.file)) issues.push(`${where}: duplicate file key`);
    seenFiles.add(row.file);
  }

  return issues;
}

/**
 * Load every committed fixture row in the manifest from
 * `options.fixtureDir`. Throws on a manifest defect or a missing
 * fixture file — committed fixtures MUST always exist on disk.
 */
export function loadCommittedFixtures(options: CommittedFixtureLoaderOptions): readonly LoadedFixture[] {
  const issues = validateManifest(options.manifest);

  if (issues.length > 0) {
    throw new Error(`Producer fixture manifest is invalid:\n  - ${issues.join('\n  - ')}`);
  }

  return options.manifest.map((row) => {
    const absolutePath = resolvePath(options.fixtureDir, row.file);

    if (!existsSync(absolutePath)) {
      throw new Error(
        `Committed fixture "${row.file}" missing on disk at ${absolutePath} — every Class A row in the manifest MUST have a committed file.`,
      );
    }

    const bytes = new Uint8Array(readFileSync(absolutePath));

    return { bytes, manifest: row, absolutePath };
  });
}

/**
 * Resolve the private-fixture root from environment. Returns `null`
 * when the env var is unset; callers decide whether that is a skip or
 * a hard fail based on `RELEASE_VALIDATION`.
 */
function resolvePrivateFixtureRoot(): string | null {
  const root = process.env['BROADSET_PRIVATE_FIXTURE_ROOT'];

  if (typeof root !== 'string' || root.length === 0) return null;

  return root;
}

interface PrivateFixtureLoadResult {
  readonly status: 'loaded' | 'skipped' | 'missing-required';
  readonly fixtures: readonly LoadedFixture[];
  /** Human-readable explanation when status !== 'loaded'. */
  readonly skipReason?: string;
  /** Manifest rows whose files are absent from disk; populated for `missing-required`. */
  readonly missingFiles?: readonly string[];
}

/**
 * Load every private-mount fixture row in the manifest. Honors the
 * `BROADSET_PRIVATE_FIXTURE_ROOT` and `RELEASE_VALIDATION` env vars:
 *
 * - `BROADSET_PRIVATE_FIXTURE_ROOT` unset, `RELEASE_VALIDATION` unset
 *   → returns `{status: 'skipped'}` so local-dev `npm run test` stays
 *   green even when private fixtures are not mounted.
 * - `BROADSET_PRIVATE_FIXTURE_ROOT` unset, `RELEASE_VALIDATION=1`
 *   → returns `{status: 'missing-required'}` so the release CI run
 *   fails fast.
 * - Mount present but a manifest file is missing on disk → returns
 *   `{status: 'missing-required'}` with `missingFiles` populated.
 * - All present → returns `{status: 'loaded', fixtures}`.
 */
export function loadPrivateFixtures(options: PrivateFixtureLoaderOptions): PrivateFixtureLoadResult {
  const issues = validateManifest(options.manifest);

  if (issues.length > 0) {
    throw new Error(`Producer fixture manifest is invalid:\n  - ${issues.join('\n  - ')}`);
  }

  const root = resolvePrivateFixtureRoot();
  const releaseValidation = process.env['RELEASE_VALIDATION'] === '1';

  if (root === null) {
    return {
      status: releaseValidation ? 'missing-required' : 'skipped',
      fixtures: [],
      skipReason:
        releaseValidation ?
          `RELEASE_VALIDATION=1 but BROADSET_PRIVATE_FIXTURE_ROOT is not set; private fixtures for ${options.format}/${options.producerSlug} cannot be loaded.`
        : `BROADSET_PRIVATE_FIXTURE_ROOT is not set; skipping ${options.format}/${options.producerSlug} private fixtures (set the env var to opt in).`,
    };
  }

  const baseDir = resolvePath(root, options.format, options.producerSlug);
  const missing: string[] = [];
  const fixtures: LoadedFixture[] = [];

  for (const row of options.manifest) {
    const absolutePath = resolvePath(baseDir, row.file);

    if (!existsSync(absolutePath)) {
      missing.push(absolutePath);
      continue;
    }

    fixtures.push({
      bytes: new Uint8Array(readFileSync(absolutePath)),
      manifest: row,
      absolutePath,
    });
  }

  if (missing.length > 0) {
    return {
      status: 'missing-required',
      fixtures,
      skipReason: `Private fixture root mounted but ${String(missing.length)} fixture file(s) missing under ${baseDir}.`,
      missingFiles: missing,
    };
  }

  return { status: 'loaded', fixtures };
}
