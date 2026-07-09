#!/usr/bin/env tsx
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CorpusFixture, CorpusFormat, CorpusManifest } from './corpus-fixtures';
import { buildCorpusFixtureUrl, parseCorpusManifest, sha256Hex } from './corpus-fixtures';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const TEST_FIXTURES_ROOT = resolve(PACKAGE_ROOT, 'test-fixtures');

type FetchStatus = 'cached' | 'fetched' | 're-fetched' | 'failed';

interface FetchResult {
  readonly fixture: CorpusFixture;
  readonly status: FetchStatus;
  readonly error?: unknown;
}

function isCorpusFormat(value: string): value is CorpusFormat {
  return value === 'pdf' || value === 'pptx' || value === 'psd' || value === 'svg';
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;

  return String(error);
}

function corpusDirFor(format: CorpusFormat): string {
  return resolve(TEST_FIXTURES_ROOT, format, 'corpus');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

async function readManifest(format: CorpusFormat): Promise<CorpusManifest> {
  const manifestPath = join(corpusDirFor(format), 'manifest.json');
  const manifestText = await readFile(manifestPath, 'utf8');

  return parseCorpusManifest(JSON.parse(manifestText));
}

async function readCachedHash(path: string): Promise<string | null> {
  if (!(await pathExists(path))) return null;

  return sha256Hex(new Uint8Array(await readFile(path)));
}

async function fetchAndVerify(url: string, expectedSha256: string): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} ${response.statusText} for ${url}`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = sha256Hex(buffer);

  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${url} - expected ${expectedSha256}, got ${actualSha256}. Upstream may have rewritten the bytes; audit and update manifest.json before re-running.`,
    );
  }

  return buffer;
}

async function writeAtomic(path: string, buffer: Uint8Array): Promise<void> {
  const tmp = `${path}.tmp.${String(process.pid)}.${String(Date.now())}`;

  await writeFile(tmp, buffer);

  try {
    await rename(tmp, path);
  } catch (error: unknown) {
    await unlink(tmp).catch(() => {});

    throw error;
  }
}

async function processFixture(
  fixture: CorpusFixture,
  manifest: CorpusManifest,
  cacheDir: string,
): Promise<FetchResult> {
  const source = manifest.sources[fixture.source];
  const url = buildCorpusFixtureUrl(source, fixture.upstreamName);
  const cachePath = join(cacheDir, fixture.name);
  const cachedHash = await readCachedHash(cachePath);

  if (cachedHash === fixture.sha256) {
    return { fixture, status: 'cached' };
  }

  const buffer = await fetchAndVerify(url, fixture.sha256);

  if (buffer.byteLength !== fixture.bytes) {
    throw new Error(
      `Byte count mismatch for ${fixture.name} - expected ${String(fixture.bytes)}, got ${String(buffer.byteLength)}`,
    );
  }

  await writeAtomic(cachePath, buffer);

  return { fixture, status: cachedHash === null ? 'fetched' : 're-fetched' };
}

async function fetchFormat(format: CorpusFormat): Promise<readonly FetchResult[]> {
  const manifest = await readManifest(format);

  if (manifest.format !== format) {
    throw new Error(`Manifest format mismatch: expected ${format}, got ${manifest.format}`);
  }

  const cacheDir = join(corpusDirFor(format), '.cache');

  await mkdir(cacheDir, { recursive: true });

  const total = manifest.fixtures.length;
  const concurrency = Math.min(6, Math.max(1, total));
  const results: FetchResult[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = cursor;

      cursor += 1;

      if (idx >= total) return;

      const fixture = manifest.fixtures[idx];

      if (fixture === undefined) continue;

      try {
        const result = await processFixture(fixture, manifest, cacheDir);

        results.push(result);
        process.stdout.write(`  ${result.status === 'cached' ? '*' : 'v'} ${fixture.name} (${result.status})\n`);
      } catch (error: unknown) {
        results.push({ fixture, status: 'failed', error });
        process.stderr.write(`  x ${fixture.name} - ${formatError(error)}\n`);
      }
    }
  }

  process.stdout.write(`Fetching ${String(total)} ${format.toUpperCase()} fixtures into ${cacheDir}\n`);

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return results;
}

async function discoverFormats(): Promise<readonly CorpusFormat[]> {
  const entries = await readdir(TEST_FIXTURES_ROOT, { withFileTypes: true });
  const formats: CorpusFormat[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !isCorpusFormat(entry.name)) continue;

    if (await pathExists(join(TEST_FIXTURES_ROOT, entry.name, 'corpus', 'manifest.json'))) {
      formats.push(entry.name);
    }
  }

  return formats.sort((a, b) => a.localeCompare(b));
}

interface ParsedFormatToken {
  readonly format: CorpusFormat;
  readonly nextIndex: number;
}

function requireFormatValue(value: string | undefined): CorpusFormat {
  if (value === undefined || !isCorpusFormat(value)) {
    throw new Error('--format requires one of: pdf, pptx, psd, svg');
  }

  return value;
}

function parseFormatToken(argv: readonly string[], index: number): ParsedFormatToken {
  const arg = argv[index];

  if (arg === undefined) {
    throw new Error(`Missing corpus fetch argument at index ${String(index)}`);
  }

  if (arg === '--format') {
    return { format: requireFormatValue(argv[index + 1]), nextIndex: index + 2 };
  }

  if (arg.startsWith('--format=')) {
    return { format: requireFormatValue(arg.slice('--format='.length)), nextIndex: index + 1 };
  }

  if (isCorpusFormat(arg)) {
    return { format: arg, nextIndex: index + 1 };
  }

  throw new Error(`Unknown corpus fetch argument: ${arg}`);
}

function parseFormats(argv: readonly string[]): readonly CorpusFormat[] | null {
  const formats: CorpusFormat[] = [];
  let index = 0;

  while (index < argv.length) {
    const parsed = parseFormatToken(argv, index);

    formats.push(parsed.format);
    index = parsed.nextIndex;
  }

  if (formats.length === 0) return null;

  return [...new Set(formats)];
}

async function main(argv: readonly string[]): Promise<void> {
  const parsedFormats = parseFormats(argv);
  const formats = parsedFormats ?? (await discoverFormats());

  if (formats.length === 0) {
    throw new Error(`No corpus manifests found under ${TEST_FIXTURES_ROOT}`);
  }

  let failed = 0;

  for (const format of formats) {
    const results = await fetchFormat(format);
    const fetched = results.filter((r) => r.status === 'fetched').length;
    const reFetched = results.filter((r) => r.status === 're-fetched').length;
    const cached = results.filter((r) => r.status === 'cached').length;
    const formatFailed = results.filter((r) => r.status === 'failed').length;

    failed += formatFailed;
    process.stdout.write(
      `\n${format.toUpperCase()} summary: ${String(fetched)} new, ${String(reFetched)} re-fetched, ${String(cached)} cached, ${String(formatFailed)} failed\n\n`,
    );
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];

if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`Fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  });
}
