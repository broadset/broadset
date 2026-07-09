import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as resolvePath } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadCommittedFixtures,
  loadPrivateFixtures,
  type ProducerFixtureManifestRow,
  validateManifest,
} from './producer-fixtures';

function manifestRow(overrides: Partial<ProducerFixtureManifestRow> = {}): ProducerFixtureManifestRow {
  return {
    file: 'sample.pptx',
    format: 'pptx',
    producer: 'Test Producer',
    producerVersion: '1.0',
    os: 'macOS 14',
    exportPath: 'File → Export → PPTX',
    license: 'public-domain',
    expectedImport: 'Imports a single rectangle.',
    expectedReExport: 'Round-trips byte-identical.',
    ...overrides,
  };
}

describe('Producer fixture harness — manifest validation', () => {
  it('accepts a valid manifest with no issues', () => {
    const issues = validateManifest([manifestRow()]);

    expect(issues).toEqual([]);
  });

  it('flags missing required fields', () => {
    const issues = validateManifest([
      manifestRow({ producer: '', license: 'NOT-A-LICENSE' as ProducerFixtureManifestRow['license'] }),
    ]);

    expect(issues.some((i) => /producer is empty/i.test(i))).toBe(true);
    expect(issues.some((i) => /license.*not in the allowlist/i.test(i))).toBe(true);
  });

  it('flags duplicate file keys across rows', () => {
    const issues = validateManifest([
      manifestRow({ file: 'a.pptx' }),
      manifestRow({ file: 'a.pptx', producer: 'Other' }),
    ]);

    expect(issues.some((i) => /duplicate file key/i.test(i))).toBe(true);
  });
});

describe('Producer fixture harness — committed fixture loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(resolvePath(tmpdir(), 'broadset-fixture-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads bytes for every manifest row', () => {
    const file = 'sample.pptx';

    writeFileSync(resolvePath(tempDir, file), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const fixtures = loadCommittedFixtures({
      fixtureDir: tempDir,
      manifest: [manifestRow({ file })],
    });

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]?.bytes.byteLength).toBe(4);
    expect(fixtures[0]?.manifest.producer).toBe('Test Producer');
  });

  it('throws when a committed fixture is missing on disk', () => {
    expect(() =>
      loadCommittedFixtures({
        fixtureDir: tempDir,
        manifest: [manifestRow({ file: 'missing.pptx' })],
      }),
    ).toThrow(/missing on disk/i);
  });

  it('throws on an invalid manifest before any I/O', () => {
    expect(() =>
      loadCommittedFixtures({
        fixtureDir: tempDir,
        manifest: [manifestRow({ producer: '' })],
      }),
    ).toThrow(/producer is empty/i);
  });
});

describe('Producer fixture harness — private fixture loader', () => {
  let tempRoot: string;
  let originalRoot: string | undefined;
  let originalRelease: string | undefined;

  beforeEach(() => {
    tempRoot = mkdtempSync(resolvePath(tmpdir(), 'broadset-private-fixture-'));
    originalRoot = process.env['BROADSET_PRIVATE_FIXTURE_ROOT'];
    originalRelease = process.env['RELEASE_VALIDATION'];
    delete process.env['BROADSET_PRIVATE_FIXTURE_ROOT'];
    delete process.env['RELEASE_VALIDATION'];
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (originalRoot === undefined) delete process.env['BROADSET_PRIVATE_FIXTURE_ROOT'];
    else process.env['BROADSET_PRIVATE_FIXTURE_ROOT'] = originalRoot;
    if (originalRelease === undefined) delete process.env['RELEASE_VALIDATION'];
    else process.env['RELEASE_VALIDATION'] = originalRelease;
  });

  it('skips when the env var is unset and RELEASE_VALIDATION is unset', () => {
    const result = loadPrivateFixtures({
      format: 'pptx',
      producerSlug: 'powerpoint-windows',
      manifest: [manifestRow({ license: 'private-mount' })],
    });

    expect(result.status).toBe('skipped');
    expect(result.fixtures).toHaveLength(0);
    expect(result.skipReason).toMatch(/BROADSET_PRIVATE_FIXTURE_ROOT/);
  });

  it('hard-fails when RELEASE_VALIDATION is set but the env var is unset', () => {
    process.env['RELEASE_VALIDATION'] = '1';

    const result = loadPrivateFixtures({
      format: 'pptx',
      producerSlug: 'powerpoint-windows',
      manifest: [manifestRow({ license: 'private-mount' })],
    });

    expect(result.status).toBe('missing-required');
    expect(result.skipReason).toMatch(/RELEASE_VALIDATION=1/);
  });

  it('loads bytes when the env var points at a directory containing every manifest file', () => {
    const slugDir = resolvePath(tempRoot, 'pptx', 'powerpoint-windows');

    mkdirSync(slugDir, { recursive: true });
    writeFileSync(resolvePath(slugDir, 'sample.pptx'), Buffer.from([0x50, 0x4b]));
    process.env['BROADSET_PRIVATE_FIXTURE_ROOT'] = tempRoot;

    const result = loadPrivateFixtures({
      format: 'pptx',
      producerSlug: 'powerpoint-windows',
      manifest: [manifestRow({ license: 'private-mount' })],
    });

    expect(result.status).toBe('loaded');
    expect(result.fixtures).toHaveLength(1);
  });

  it('reports missing-required when env var is set but a manifest file is absent', () => {
    process.env['BROADSET_PRIVATE_FIXTURE_ROOT'] = tempRoot;

    const result = loadPrivateFixtures({
      format: 'pptx',
      producerSlug: 'powerpoint-windows',
      manifest: [manifestRow({ license: 'private-mount' })],
    });

    expect(result.status).toBe('missing-required');
    expect(result.missingFiles?.length ?? 0).toBeGreaterThan(0);
  });
});
