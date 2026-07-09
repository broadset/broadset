#!/usr/bin/env node
/**
 * Fetcher for the permissively-licensed PPTX test corpus.
 *
 * Reads `test-fixtures/pptx/corpus/manifest.json`, downloads any
 * missing or hash-mismatched fixtures from upstream raw GitHub URLs
 * pinned by commit SHA, verifies SHA-256, and stores them in
 * `test-fixtures/pptx/corpus/.cache/`.
 *
 * The bytes are NEVER committed to this repo — see `corpus/README.md`
 * for the licence story. Re-running the script is idempotent: cached
 * fixtures with matching hashes are skipped, mismatches are re-fetched
 * and verified.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const CORPUS_DIR = resolve(PACKAGE_ROOT, 'test-fixtures/pptx/corpus');
const CACHE_DIR = resolve(CORPUS_DIR, '.cache');
const MANIFEST_PATH = resolve(CORPUS_DIR, 'manifest.json');
const RAW_HOST = 'https://raw.githubusercontent.com';

/**
 * @returns {string} `apache/poi` from `https://github.com/apache/poi`
 */
function repoSlug(repositoryUrl) {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(repositoryUrl);

  if (m === null) {
    throw new Error(`Unsupported repository URL (expected https://github.com/owner/repo): ${repositoryUrl}`);
  }

  return m[1];
}

function buildFixtureUrl(source, upstreamName) {
  const slug = repoSlug(source.repository);

  return `${RAW_HOST}/${slug}/${source.commit}/${source.fixtureRoot}/${upstreamName}`;
}

async function sha256Hex(buffer) {
  const h = createHash('sha256');

  h.update(buffer);

  return h.digest('hex');
}

async function pathExists(path) {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

async function readCachedHash(path) {
  if (!(await pathExists(path))) return null;

  return sha256Hex(await readFile(path));
}

async function fetchAndVerify(url, expectedSha256) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)} ${response.statusText} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const actualSha256 = await sha256Hex(buffer);

  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${url} — expected ${expectedSha256}, got ${actualSha256}. Upstream may have rewritten the bytes; audit and update manifest.json before re-running.`,
    );
  }

  return buffer;
}

async function writeAtomic(path, buffer) {
  const tmp = `${path}.tmp.${String(process.pid)}.${String(Date.now())}`;

  await writeFile(tmp, buffer);

  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});

    throw err;
  }
}

async function processFixture(fixture, sources) {
  const source = sources[fixture.source];

  if (source === undefined) {
    throw new Error(`Fixture "${fixture.name}" references unknown source "${fixture.source}"`);
  }

  const url = buildFixtureUrl(source, fixture.upstreamName);
  const cachePath = join(CACHE_DIR, fixture.name);
  const cachedHash = await readCachedHash(cachePath);

  if (cachedHash === fixture.sha256) {
    return { fixture, status: 'cached' };
  }

  const buffer = await fetchAndVerify(url, fixture.sha256);

  if (buffer.length !== fixture.bytes) {
    throw new Error(
      `Byte count mismatch for ${fixture.name} — expected ${String(fixture.bytes)}, got ${String(buffer.length)}`,
    );
  }

  await writeAtomic(cachePath, buffer);

  return { fixture, status: cachedHash === null ? 'fetched' : 're-fetched' };
}

async function main() {
  const manifestText = await readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(manifestText);

  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schemaVersion: ${String(manifest.schemaVersion)}`);
  }

  await mkdir(CACHE_DIR, { recursive: true });

  const total = manifest.fixtures.length;
  const concurrency = 6;
  const results = [];
  let cursor = 0;

  async function worker() {
    for (;;) {
      const idx = cursor;

      cursor += 1;

      if (idx >= total) return;

      const fixture = manifest.fixtures[idx];

      try {
        const result = await processFixture(fixture, manifest.sources);

        results.push(result);
        process.stdout.write(`  ${result.status === 'cached' ? '·' : '↓'} ${fixture.name} (${result.status})\n`);
      } catch (err) {
        results.push({ fixture, status: 'failed', error: err });
        process.stderr.write(`  ✗ ${fixture.name} — ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  }

  process.stdout.write(`Fetching ${String(total)} PPTX fixtures into ${CACHE_DIR}\n`);

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const fetched = results.filter((r) => r.status === 'fetched').length;
  const reFetched = results.filter((r) => r.status === 're-fetched').length;
  const cached = results.filter((r) => r.status === 'cached').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  process.stdout.write(
    `\nSummary: ${String(fetched)} new · ${String(reFetched)} re-fetched · ${String(cached)} cached · ${String(failed)} failed\n`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
