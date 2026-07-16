import { projectFormatV1 } from '@broadset/model';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BSP_JSON_MIME_V1,
  BSP_PROJECT_MIME_V1,
  exportBspPackageV1,
  loadBspPackageV1,
} from '../../index';
import { computeSha256DigestV1 } from '../../v1/blob-reference';
import { createResourceCollectorV1 } from '../../v1/resource-collector';
import { bspPackageManifestV1Schema } from './manifest';
import type { BspPackageEntryV1, BspPackageManifestV1 } from './types';

interface PackageFixture {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly blobPath: string;
}

interface OptionalArchiveFixture {
  readonly archive: Record<string, Uint8Array>;
  readonly previewPath: string;
  readonly previewDigest: projectFormatV1.Sha256Digest;
  readonly historyDigest: projectFormatV1.Sha256Digest;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checksummed v1 BSP package codec', () => {
  it('round-trips a valid project and blob while preserving exact canonical project JSON', async () => {
    const fixture = await createPackageFixture();
    const exported = await exportBspPackageV1({ project: fixture.project, blobs: fixture.blobs });

    expect(exported.status).toBe('exported');
    if (exported.status !== 'exported') return;

    const archive = unzipSync(exported.bytes);

    expect(strFromU8(requiredEntry(archive, 'project.json'))).toBe(
      projectFormatV1.canonicalizeProjectV1(fixture.project),
    );
    expect(new Set(Object.keys(archive))).toEqual(new Set(['manifest.json', 'project.json', fixture.blobPath]));

    const loaded = await loadBspPackageV1(exported.bytes);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(projectFormatV1.canonicalizeProjectV1(loaded.project)).toBe(
      projectFormatV1.canonicalizeProjectV1(fixture.project),
    );
    expect(loaded.blobs.get(firstDigest(fixture.blobs))).toEqual(fixture.blobs.get(firstDigest(fixture.blobs)));
    expect(loaded.blobs.get(firstDigest(fixture.blobs))).not.toBe(fixture.blobs.get(firstDigest(fixture.blobs)));
  });

  it('exports the representation MIME constants', () => {
    expect(BSP_PROJECT_MIME_V1).toBe('application/vnd.broadset.project');
    expect(BSP_JSON_MIME_V1).toBe('application/vnd.broadset.project+json');
  });

  it('quarantines missing and tampered blob payloads', async () => {
    const fixture = await createPackageFixture();
    const bytes = await exportedBytes(fixture);
    const archive = unzipSync(bytes);
    const missing = Object.fromEntries(Object.entries(archive).filter(([path]) => path !== fixture.blobPath));

    const tampered = { ...archive, [fixture.blobPath]: new Uint8Array([9, 9, 9]) };

    await expect(loadBspPackageV1(zipSync(missing))).resolves.toMatchObject({ status: 'quarantined' });
    await expect(loadBspPackageV1(zipSync(tampered))).resolves.toMatchObject({ status: 'quarantined' });
  });

  it('quarantines a tampered project before model hydration', async () => {
    const fixture = await createPackageFixture();
    const archive = unzipSync(await exportedBytes(fixture));
    const projectBytes = Uint8Array.from(requiredEntry(archive, 'project.json'));

    projectBytes[0] = projectBytes[0] === 0x7b ? 0x5b : 0x7b;
    archive['project.json'] = projectBytes;

    const loaded = await loadBspPackageV1(zipSync(archive));

    expect(loaded.status).toBe('quarantined');
    expect(loaded.diagnostics.map(({ code }) => code)).toContain('bsp.entry-digest-mismatch');
  });

  it('quarantines raw JSON masquerading as a BSP package and preserves a detached copy', async () => {
    const fixture = await createPackageFixture();
    const bytes = strToU8(projectFormatV1.canonicalizeProjectV1(fixture.project));
    const loaded = await loadBspPackageV1(bytes, { lastValidProject: fixture.project });

    expect(loaded.status).toBe('quarantined');
    if (loaded.status !== 'quarantined') return;
    expect(loaded.originalBytes).toEqual(bytes);
    expect(loaded.originalBytes).not.toBe(bytes);
    expect(loaded.lastValidProject).toBe(fixture.project);
  });

  it('quarantines an unlisted ZIP entry', async () => {
    const fixture = await createPackageFixture();
    const archive = unzipSync(await exportedBytes(fixture));

    archive['surprise.bin'] = new Uint8Array([1]);

    await expect(loadBspPackageV1(zipSync(archive))).resolves.toMatchObject({ status: 'quarantined' });
  });

  it('quarantines a correctly checksummed but project-unreferenced listed blob', async () => {
    const fixture = await createPackageFixture();
    const archive = unzipSync(await exportedBytes(fixture));
    const extraBytes = new Uint8Array([4, 5, 6]);
    const digest = await computeSha256DigestV1(extraBytes);
    const path = `blobs/sha256/${digest.slice('sha256:'.length)}`;
    const manifest = parseManifest(requiredEntry(archive, 'manifest.json'));
    const extraEntry: BspPackageEntryV1 = {
      path,
      mediaType: 'application/octet-stream',
      byteLength: extraBytes.byteLength,
      digest,
      role: 'blob',
    };

    archive[path] = extraBytes;
    archive['manifest.json'] = Uint8Array.from(
      strToU8(JSON.stringify({ ...manifest, entries: [...manifest.entries, extraEntry].sort(compareEntryPath) })),
    );

    const loaded = await loadBspPackageV1(zipSync(archive));

    expect(loaded.status).toBe('quarantined');
    expect(loaded.diagnostics.some(({ code }) => code === 'bsp.unreferenced-blob')).toBe(true);
  });

  it('loads verified preview and optional-history entries without hydrating them as blobs', async () => {
    const fixture = await createPackageFixture();
    const optional = await archiveWithOptionalEntries(fixture);

    const loaded = await loadBspPackageV1(zipSync(optional.archive));

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.blobs.size).toBe(fixture.blobs.size);
    expect(loaded.blobs.has(optional.previewDigest)).toBe(false);
    expect(loaded.blobs.has(optional.historyDigest)).toBe(false);
  });

  it('integrity-checks optional entries before project hydration', async () => {
    const fixture = await createPackageFixture();
    const optional = await archiveWithOptionalEntries(fixture);

    optional.archive[optional.previewPath] = new Uint8Array([9, 9, 9]);

    const loaded = await loadBspPackageV1(zipSync(optional.archive));

    expect(loaded.status).toBe('quarantined');
    expect(loaded.diagnostics.map(({ code }) => code)).toContain('bsp.entry-digest-mismatch');
  });

  it.each([
    ['preview', 'optional-history/snapshot.json', 'Preview entry has an invalid path'],
    ['history', 'previews/document.png', 'History entry has an invalid path'],
  ])('rejects a %s role paired with another optional-entry path family', async (role, path, expectedMessage) => {
    const fixture = await createPackageFixture();
    const archive = unzipSync(await exportedBytes(fixture));
    const manifest = parseManifest(requiredEntry(archive, 'manifest.json'));
    const bytes = new Uint8Array([7]);
    const digest = await computeSha256DigestV1(bytes);
    const mismatchedEntry = {
      path,
      mediaType: 'application/octet-stream',
      byteLength: bytes.byteLength,
      digest,
      role,
    };
    const entries = [...manifest.entries, mismatchedEntry].sort((left, right) => left.path.localeCompare(right.path));

    archive[path] = bytes;
    archive['manifest.json'] = Uint8Array.from(strToU8(JSON.stringify({ ...manifest, entries })));

    const loaded = await loadBspPackageV1(zipSync(archive));

    expect(loaded.status).toBe('quarantined');
    expect(loaded.diagnostics.some(({ message }) => message.includes(expectedMessage))).toBe(true);
  });

  it('quarantines malformed, unsupported, and non-canonically ordered manifests', async () => {
    const fixture = await createPackageFixture();
    const archive = unzipSync(await exportedBytes(fixture));
    const manifest = parseManifest(requiredEntry(archive, 'manifest.json'));
    const malformed = { ...archive, 'manifest.json': Uint8Array.from(strToU8('{')) };
    const unsupported = {
      ...archive,
      'manifest.json': Uint8Array.from(strToU8(JSON.stringify({ ...manifest, version: 2 }))),
    };
    const unordered = {
      ...archive,
      'manifest.json': Uint8Array.from(
        strToU8(JSON.stringify({ ...manifest, entries: [...manifest.entries].reverse() })),
      ),
    };

    await expect(loadBspPackageV1(zipSync(malformed))).resolves.toMatchObject({ status: 'quarantined' });
    await expect(loadBspPackageV1(zipSync(unsupported))).resolves.toMatchObject({ status: 'quarantined' });
    await expect(loadBspPackageV1(zipSync(unordered))).resolves.toMatchObject({ status: 'quarantined' });
  });

  it('fails export for a structurally valid but semantically invalid project', async () => {
    const project = projectFormatV1.createProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Fixture project has no document');

    const invalid = { ...project, documents: [document, document] };

    await expect(exportBspPackageV1({ project: invalid, blobs: new Map() })).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('fails soft when hashing fails', async () => {
    const fixture = await createPackageFixture();

    vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValueOnce(new Error('crypto unavailable'));

    await expect(exportBspPackageV1({ project: fixture.project, blobs: fixture.blobs })).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('fails soft when ZIP processing fails and retains quarantine bytes', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

    await expect(loadBspPackageV1(bytes)).resolves.toMatchObject({
      status: 'quarantined',
      originalBytes: bytes,
    });
  });

  it('does not alias caller project blob or package input buffers', async () => {
    const fixture = await createPackageFixture();
    const exported = await exportBspPackageV1({ project: fixture.project, blobs: fixture.blobs });

    expect(exported.status).toBe('exported');
    if (exported.status !== 'exported') return;

    const packageBytes = exported.bytes.slice();
    const loaded = await loadBspPackageV1(packageBytes);

    packageBytes.fill(0);

    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.blobs.get(firstDigest(fixture.blobs))).toEqual(fixture.blobs.get(firstDigest(fixture.blobs)));
  });
});

async function createPackageFixture(): Promise<PackageFixture> {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const collector = createResourceCollectorV1();

  await collector.addImageAsset({ bytes, mediaType: 'image/png', name: 'Pixel' });

  const resources = collector.collect();
  const project = projectFormatV1.createProjectV1({ resources: resources.resources });
  const digest = firstDigest(resources.blobs);

  return {
    project,
    blobs: resources.blobs,
    blobPath: `blobs/sha256/${digest.slice('sha256:'.length)}`,
  };
}

async function archiveWithOptionalEntries(fixture: PackageFixture): Promise<OptionalArchiveFixture> {
  const archive = unzipSync(await exportedBytes(fixture));
  const manifest = parseManifest(requiredEntry(archive, 'manifest.json'));
  const previewPath = 'previews/document.png';
  const historyPath = 'optional-history/snapshot.json';
  const previewBytes = new Uint8Array([1, 2, 3]);
  const historyBytes = Uint8Array.from(strToU8('{"snapshot":1}'));
  const previewDigest = await computeSha256DigestV1(previewBytes);
  const historyDigest = await computeSha256DigestV1(historyBytes);
  const previewEntry = {
    path: previewPath,
    mediaType: 'image/png',
    byteLength: previewBytes.byteLength,
    digest: previewDigest,
    role: 'preview',
  };
  const historyEntry = {
    path: historyPath,
    mediaType: 'application/json',
    byteLength: historyBytes.byteLength,
    digest: historyDigest,
    role: 'history',
  };
  const entries = [...manifest.entries, previewEntry, historyEntry].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  archive[previewPath] = previewBytes;
  archive[historyPath] = historyBytes;
  archive['manifest.json'] = Uint8Array.from(strToU8(JSON.stringify({ ...manifest, entries })));

  return { archive, previewPath, previewDigest, historyDigest };
}

async function exportedBytes(fixture: PackageFixture): Promise<Uint8Array> {
  const result = await exportBspPackageV1({ project: fixture.project, blobs: fixture.blobs });

  if (result.status !== 'exported') throw new Error('Fixture export failed');

  return result.bytes;
}

function requiredEntry(entries: Readonly<Record<string, Uint8Array>>, path: string): Uint8Array {
  const bytes = entries[path];

  if (bytes === undefined) throw new Error(`Missing fixture entry: ${path}; got ${Object.keys(entries).join(', ')}`);

  return bytes;
}

function firstDigest(blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>): projectFormatV1.Sha256Digest {
  let digest: projectFormatV1.Sha256Digest | undefined;

  blobs.forEach((_bytes, candidate) => {
    digest ??= candidate;
  });

  if (digest === undefined) throw new Error('Fixture has no blob digest');

  return digest;
}

function parseManifest(bytes: Uint8Array): BspPackageManifestV1 {
  const input: unknown = JSON.parse(strFromU8(bytes));
  const parsed = bspPackageManifestV1Schema.safeParse(input);

  if (!parsed.success) throw new Error('Invalid fixture manifest');

  return parsed.data;
}

function compareEntryPath(left: BspPackageEntryV1, right: BspPackageEntryV1): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;

  return 0;
}
