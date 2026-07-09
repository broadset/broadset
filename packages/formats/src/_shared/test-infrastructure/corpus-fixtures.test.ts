import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCorpusFixtureUrl, loadCachedCorpusFixtures, parseCorpusManifest, sha256Hex } from './corpus-fixtures';

const tempRoots: string[] = [];

function makeTempCorpusDir(): string {
  const root = join(tmpdir(), `broadset-corpus-${String(process.pid)}-${String(tempRoots.length)}`);

  rmSync(root, { force: true, recursive: true });
  mkdirSync(join(root, '.cache'), { recursive: true });
  tempRoots.push(root);

  return root;
}

function validManifest() {
  const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

  return {
    schemaVersion: 1,
    format: 'svg',
    description: 'test manifest',
    sources: {
      wpt: {
        repository: 'https://github.com/web-platform-tests/wpt',
        commit: '8c3a65eb65d581f58ab5af381ca94182ed8399b6',
        license: 'BSD-3-Clause',
        licenseUrl:
          'https://github.com/web-platform-tests/wpt/blob/8c3a65eb65d581f58ab5af381ca94182ed8399b6/LICENSE.md',
        fixtureRoot: 'svg/shapes',
      },
    },
    fixtures: [
      {
        name: 'circle.svg',
        source: 'wpt',
        upstreamName: 'circle 01.svg',
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength,
        tags: ['shape', 'circle'],
      },
    ],
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('corpus fixture manifests', () => {
  it('parses a valid commit-pinned corpus manifest', () => {
    const parsed = parseCorpusManifest(validManifest());

    expect(parsed.format).toBe('svg');
    expect(parsed.fixtures[0]?.source).toBe('wpt');
  });

  it('rejects path traversal in cache names and upstream fixture names', () => {
    const manifest = validManifest();

    expect(() =>
      parseCorpusManifest({
        ...manifest,
        fixtures: [{ ...manifest.fixtures[0], name: '../escape.svg' }],
      }),
    ).toThrow(/path traversal/);

    expect(() =>
      parseCorpusManifest({
        ...manifest,
        fixtures: [{ ...manifest.fixtures[0], upstreamName: 'shapes/../escape.svg' }],
      }),
    ).toThrow(/path traversal/);
  });

  it('rejects non-GitHub source repositories', () => {
    const manifest = validManifest();

    expect(() =>
      parseCorpusManifest({
        ...manifest,
        sources: {
          wpt: {
            ...manifest.sources.wpt,
            repository: 'https://example.com/not-a-github-repo',
          },
        },
      }),
    ).toThrow(/github\.com/);
  });

  it('builds encoded raw GitHub URLs pinned by commit', () => {
    const parsed = parseCorpusManifest(validManifest());
    const source = parsed.sources['wpt'];
    const fixture = parsed.fixtures[0];

    expect(source).toBeDefined();
    expect(fixture).toBeDefined();

    if (fixture === undefined) throw new Error('fixture missing from test manifest');

    const url = buildCorpusFixtureUrl(source, fixture.upstreamName);

    expect(url).toBe(
      'https://raw.githubusercontent.com/web-platform-tests/wpt/8c3a65eb65d581f58ab5af381ca94182ed8399b6/svg/shapes/circle%2001.svg',
    );
  });

  it('allows a source fixture root of "." for corpora with multiple top-level directories', () => {
    const manifest = validManifest();
    const parsed = parseCorpusManifest({
      ...manifest,
      sources: {
        wpt: {
          ...manifest.sources.wpt,
          fixtureRoot: '.',
        },
      },
      fixtures: [{ ...manifest.fixtures[0], upstreamName: 'svg/shapes/circle.svg' }],
    });

    expect(buildCorpusFixtureUrl(parsed.sources['wpt'], parsed.fixtures[0]?.upstreamName ?? '')).toBe(
      'https://raw.githubusercontent.com/web-platform-tests/wpt/8c3a65eb65d581f58ab5af381ca94182ed8399b6/svg/shapes/circle.svg',
    );
  });

  it('loads cached fixtures with actual hash and byte count for drift assertions', () => {
    const corpusDir = makeTempCorpusDir();
    const manifest = validManifest();
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

    writeFileSync(join(corpusDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(corpusDir, '.cache', 'circle.svg'), bytes);

    const loaded = loadCachedCorpusFixtures(corpusDir);

    expect(loaded.manifest.format).toBe('svg');
    expect(loaded.cached).toHaveLength(1);
    expect(loaded.cached[0]?.actualSha256).toBe(manifest.fixtures[0]?.sha256);
    expect(loaded.cached[0]?.actualBytes).toBe(bytes.byteLength);
  });
});
