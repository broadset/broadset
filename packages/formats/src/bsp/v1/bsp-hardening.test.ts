import { projectFormatV1 } from '@broadset/model';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createResourceCollectorV1 } from '../../v1';
import { collectProjectBlobReferencesV1, type ProjectBlobReferenceV1 } from './blob-references';
import { BSP_MANIFEST_PATH_V1, BSP_PACKAGE_LIMITS_V1 } from './constants';
import { exportBspPackageV1 } from './export';
import { preflightBspExportV1 } from './export-preflight';
import { loadBspPackageV1 } from './load';
import { validateProjectManifestRelationsV1 } from './reconcile-project-blobs';
import type { BspPackageEntryV1, BspPackageManifestV1 } from './types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BSP export resource preflight', () => {
  it('rejects oversized project, unsafe lengths, entry cardinality, and aggregate retained bytes', () => {
    const oversizedProject = preflightBspExportV1({
      projectByteLength: BSP_PACKAGE_LIMITS_V1.maxEntryBytes + 1,
      references: [],
      blobs: new Map(),
    });
    const unsafeLength = preflightBspExportV1({
      projectByteLength: 1,
      references: [blobReference('1', Number.MAX_SAFE_INTEGER + 1)],
      blobs: new Map(),
    });
    const tooManyEntries = preflightBspExportV1({
      projectByteLength: 1,
      references: Array.from({ length: BSP_PACKAGE_LIMITS_V1.maxEntries - 1 }, (_value, index) =>
        blobReference(index.toString(16).padStart(64, '0'), 0),
      ),
      blobs: new Map(),
    });
    const tooManyByteReferences = [
      blobReference('2', BSP_PACKAGE_LIMITS_V1.maxEntryBytes),
      blobReference('3', BSP_PACKAGE_LIMITS_V1.maxEntryBytes),
    ];
    const tooManyByteBlobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();

    tooManyByteReferences.forEach((reference) => {
      tooManyByteBlobs.set(reference.digest, bytesReportingLength(reference.byteLength));
    });

    const tooManyBytes = preflightBspExportV1({
      projectByteLength: 1,
      references: tooManyByteReferences,
      blobs: tooManyByteBlobs,
    });

    expect(codes(oversizedProject)).toContain('bsp.entry-size-limit');
    expect(codes(unsafeLength)).toContain('bsp.invalid-byte-length');
    expect(codes(tooManyEntries)).toContain('bsp.entry-count-limit');
    expect(codes(tooManyBytes)).toContain('bsp.total-size-limit');
  });

  it('fails entry-count preflight before project/blob hashing or ZIP allocation', async () => {
    const project = projectWithAssets(BSP_PACKAGE_LIMITS_V1.maxEntries - 1);
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, 'digest');
    const copySpy = vi.spyOn(Uint8Array, 'from');

    const result = await exportBspPackageV1({ project, blobs: new Map() });

    expect(result.status).toBe('failed');
    expect(codes(result.diagnostics)).toContain('bsp.entry-count-limit');
    expect(digestSpy).not.toHaveBeenCalled();
    expect(copySpy).not.toHaveBeenCalled();
  });

  it('accepts exact aggregate and entry-count boundaries in preflight', () => {
    const exactCountReferences = Array.from({ length: BSP_PACKAGE_LIMITS_V1.maxEntries - 2 }, (_value, index) =>
      blobReference(index.toString(16).padStart(64, '0'), 0),
    );
    const exactCountBlobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();

    exactCountReferences.forEach((reference) => exactCountBlobs.set(reference.digest, new Uint8Array()));

    const countDiagnostics = preflightBspExportV1({
      projectByteLength: 1,
      references: exactCountReferences,
      blobs: exactCountBlobs,
    });
    const totalReferences = [
      blobReference('2', BSP_PACKAGE_LIMITS_V1.maxEntryBytes),
      blobReference('3', BSP_PACKAGE_LIMITS_V1.maxEntryBytes),
    ];
    const totalBlobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();

    totalReferences.forEach((reference) => {
      totalBlobs.set(reference.digest, bytesReportingLength(reference.byteLength));
    });

    const totalDiagnostics = preflightBspExportV1({
      projectByteLength: 0,
      references: totalReferences,
      blobs: totalBlobs,
    });

    expect(codes(countDiagnostics)).not.toContain('bsp.entry-count-limit');
    expect(codes(totalDiagnostics)).toContain('bsp.total-size-limit');
  });

  it('fails aggregate preflight before blob copying and hashing', async () => {
    const project = projectWithAssetLengths([BSP_PACKAGE_LIMITS_V1.maxEntryBytes, BSP_PACKAGE_LIMITS_V1.maxEntryBytes]);
    const blobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>();

    collectProjectBlobReferencesV1(project).forEach(({ reference }) => {
      blobs.set(reference.digest, bytesReportingLength(reference.byteLength));
    });

    const sliceSpy = vi.spyOn(Uint8Array.prototype, 'slice');
    const digestSpy = vi.spyOn(globalThis.crypto.subtle, 'digest');

    const result = await exportBspPackageV1({ project, blobs });

    expect(result.status).toBe('failed');
    expect(codes(result.diagnostics)).toContain('bsp.total-size-limit');
    expect(sliceSpy).not.toHaveBeenCalled();
    expect(digestSpy).not.toHaveBeenCalled();
  });
});

describe('BSP load allocation and manifest hardening', () => {
  it('keeps the public package resource envelope fixed at runtime', () => {
    const expected = {
      maxInputBytes: 256 * 1024 * 1024,
      maxEntries: 4096,
      maxEntryBytes: 128 * 1024 * 1024,
      maxTotalBytes: 256 * 1024 * 1024,
      maxExpansionRatio: 100,
      maxPathDepth: 8,
    };

    expect(Object.isFrozen(BSP_PACKAGE_LIMITS_V1)).toBe(true);
    expect(Reflect.set(BSP_PACKAGE_LIMITS_V1, 'maxInputBytes', 2)).toBe(false);
    expect(BSP_PACKAGE_LIMITS_V1).toEqual(expected);
  });

  it('retains exactly one detached quarantine snapshot', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const sliceSpy = vi.spyOn(Uint8Array.prototype, 'slice');

    const result = await loadBspPackageV1(bytes);

    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(sliceSpy).toHaveBeenCalledTimes(1);
    bytes.fill(9);
    expect(result.originalBytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('fails soft with empty recovery bytes when caller snapshot allocation persistently fails', async () => {
    vi.spyOn(Uint8Array.prototype, 'slice').mockImplementation(() => {
      throw new Error('allocation failed');
    });

    const result = await loadBspPackageV1(new Uint8Array([1, 2, 3]));

    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') return;
    expect(result.originalBytes).toEqual(new Uint8Array());
    expect(codes(result.diagnostics)).toContain('bsp.allocation-failed');
  });

  it('accepts a manifest above 8 MiB with contract-valid long tool and media strings', async () => {
    const projectDescriptor = projectEntry();
    const blobDescriptor: BspPackageEntryV1 = {
      path: `blobs/sha256/${'1'.repeat(64)}`,
      mediaType: `application/${'a'.repeat(300)}`,
      byteLength: 0,
      digest: digest('1'),
      role: 'blob',
    };
    const manifest: BspPackageManifestV1 = {
      format: 'broadset-project-package',
      version: 1,
      tool: { name: 'a'.repeat(8 * 1024 * 1024 + 1), version: 'v'.repeat(300) },
      project: projectDescriptor,
      entries: [blobDescriptor, projectDescriptor].sort(comparePaths),
    };

    const result = await loadManifest(JSON.stringify(manifest));

    expect(codes(result.diagnostics)).not.toContain('bsp.manifest-size-limit');
    expect(codes(result.diagnostics)).not.toContain('bsp.invalid-manifest');
  });

  it('bounds manifest cardinality and diagnostic output', async () => {
    const descriptor = projectEntry();
    const manifest: BspPackageManifestV1 = {
      format: 'broadset-project-package',
      version: 1,
      tool: { name: 'test', version: '1' },
      project: descriptor,
      entries: Array.from({ length: BSP_PACKAGE_LIMITS_V1.maxEntries }, () => descriptor),
    };
    const result = await loadManifest(JSON.stringify(manifest));

    expect(result.status).toBe('quarantined');
    expect(result.diagnostics.length).toBeLessThanOrEqual(64);
    expect(codes(result.diagnostics)).toContain('bsp.invalid-manifest');
  });

  it.each([
    ['unsafe integer', { byteLength: Number.MAX_SAFE_INTEGER + 1 }],
    ['entry size', { byteLength: BSP_PACKAGE_LIMITS_V1.maxEntryBytes + 1 }],
    ['control media type', { mediaType: 'application/\0json' }],
  ])('rejects invalid manifest entry %s', async (_label, override) => {
    const descriptor = { ...projectEntry(), ...override };
    const result = await loadManifest(
      JSON.stringify({
        format: 'broadset-project-package',
        version: 1,
        tool: { name: 'test', version: '1' },
        project: descriptor,
        entries: [descriptor],
      }),
    );

    expect(result.status).toBe('quarantined');
    expect(codes(result.diagnostics)).toContain('bsp.invalid-manifest');
  });

  it('caps ZIP-originated quarantine diagnostics', async () => {
    const entries: Record<string, Uint8Array> = {};

    for (let index = 0; index < 70; index += 1) entries[`../bad-${String(index)}`] = new Uint8Array();

    const result = await loadBspPackageV1(zipSync(entries, { level: 0 }));

    expect(result.status).toBe('quarantined');
    expect(result.diagnostics).toHaveLength(64);
  });
});

describe('BSP export stabilization', () => {
  it('returns a typed size failure before encoding an over-limit canonical project', async () => {
    const base = projectFormatV1.createProjectV1();
    const project = {
      ...base,
      metadata: {
        ...base.metadata,
        description: 'x'.repeat(projectFormatV1.PROJECT_V1_LIMITS.maxJsonTextBytes + 1),
      },
    };
    const copySpy = vi.spyOn(Uint8Array, 'from');

    const result = await exportBspPackageV1({ project, blobs: new Map() });

    expect(result.status).toBe('failed');
    expect(codes(result.diagnostics)).toContain('bsp.entry-size-limit');
    expect(copySpy).not.toHaveBeenCalled();
  });

  it('captures each mutable map value exactly once before asynchronous hashing', async () => {
    const collector = createResourceCollectorV1();

    await collector.addImageAsset({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png', name: 'Pixel' });

    const collected = collector.collect();
    const project = projectFormatV1.createProjectV1({ resources: collected.resources });
    const reference = collectProjectBlobReferencesV1(project)[0]?.reference;

    if (reference === undefined) throw new Error('Expected one collected blob reference');

    const blobs = new Map(collected.blobs);
    const stableBytes = blobs.get(reference.digest);

    if (stableBytes === undefined) throw new Error('Expected collected blob bytes');

    const getSpy = vi
      .spyOn(blobs, 'get')
      .mockReturnValueOnce(stableBytes)
      .mockReturnValue(new Uint8Array([9, 9, 9, 9]));

    const result = await exportBspPackageV1({ project, blobs });

    expect(result.status).toBe('exported');
    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});

describe('BSP project reference reconciliation', () => {
  it('indexes manifest blob paths once for repeated project references', () => {
    let pathReads = 0;
    const path = `blobs/sha256/${'4'.repeat(64)}`;
    const entry: BspPackageEntryV1 = {
      get path(): string {
        pathReads += 1;

        return path;
      },
      mediaType: 'application/octet-stream',
      byteLength: 0,
      digest: digest('4'),
      role: 'blob',
    };
    const descriptor: ProjectBlobReferenceV1 = {
      reference: {
        digest: digest('4'),
        byteLength: 0,
        mediaType: 'application/octet-stream',
        source: { kind: 'package', path },
      },
      pointer: '/resources/assets/0/blob',
    };
    const manifest: BspPackageManifestV1 = {
      format: 'broadset-project-package',
      version: 1,
      tool: { name: 'test', version: '1' },
      project: projectEntry(),
      entries: [entry, projectEntry()],
    };

    const diagnostics = validateProjectManifestRelationsV1(
      Array.from({ length: 10_000 }, () => descriptor),
      manifest,
    );

    expect(diagnostics).toEqual([]);
    expect(pathReads).toBe(1);
  });

  it('reports real primary and derivative JSON pointers', async () => {
    const collector = createResourceCollectorV1();

    await collector.addImageAsset({ bytes: new Uint8Array([1]), mediaType: 'image/png' });

    const collected = collector.collect();
    const asset = collected.resources.assets[0];

    if (asset?.kind !== 'image') throw new Error('Expected image fixture');

    const project = projectFormatV1.createProjectV1({
      resources: {
        ...collected.resources,
        assets: [
          {
            ...asset,
            derivatives: [
              {
                id: projectFormatV1.idSchema.parse('preview'),
                role: 'preview',
                name: 'Preview',
                blob: { ...asset.blob, source: { kind: 'missing', lastKnownName: 'preview.png' } },
              },
            ],
          },
        ],
      },
    });

    const result = await exportBspPackageV1({ project, blobs: collected.blobs });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'bsp.non-package-blob', pointer: '/resources/assets/0/derivatives/0/blob' }),
    );
    expect(collectProjectBlobReferencesV1(project)).toHaveLength(2);
  });
});

function blobReference(hex: string, byteLength: number): projectFormatV1.BlobReference {
  const normalized = hex.length === 64 ? hex : hex.repeat(64);
  const value = projectFormatV1.sha256DigestSchema.parse(`sha256:${normalized}`);

  return {
    digest: value,
    byteLength,
    mediaType: 'application/octet-stream',
    source: { kind: 'package', path: `blobs/sha256/${normalized}` },
  };
}

function digest(character: string): projectFormatV1.Sha256Digest {
  return projectFormatV1.sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);
}

function bytesReportingLength(byteLength: number): Uint8Array {
  const bytes = new Uint8Array();

  Object.defineProperty(bytes, 'byteLength', { configurable: true, value: byteLength });

  return bytes;
}

function projectEntry(): BspPackageEntryV1 {
  return {
    path: 'project.json',
    mediaType: 'application/vnd.broadset.project+json',
    byteLength: 1,
    digest: digest('0'),
    role: 'project',
  };
}

function projectWithAssets(count: number): projectFormatV1.BroadsetProjectV1 {
  return projectWithAssetLengths(Array.from({ length: count }, () => 0));
}

function projectWithAssetLengths(byteLengths: readonly number[]): projectFormatV1.BroadsetProjectV1 {
  const assets: projectFormatV1.ImageAsset[] = byteLengths.map((byteLength, index) => {
    const hex = index.toString(16).padStart(64, '0');

    return {
      id: projectFormatV1.idSchema.parse(`asset-${String(index)}`),
      kind: 'image',
      name: `Asset ${String(index)}`,
      blob: blobReference(hex, byteLength),
      metadata: {
        pixelWidth: 1,
        pixelHeight: 1,
        orientation: 1,
        hasAlpha: false,
        bitDepth: 8,
        colorModel: 'unknown',
      },
    };
  });
  const project = projectFormatV1.createProjectV1();

  return { ...project, resources: { ...project.resources, assets } };
}

function comparePaths(left: BspPackageEntryV1, right: BspPackageEntryV1): number {
  return left.path.localeCompare(right.path);
}

async function loadManifest(text: string): ReturnType<typeof loadBspPackageV1> {
  return loadBspPackageV1(zipSync({ [BSP_MANIFEST_PATH_V1]: Uint8Array.from(strToU8(text)) }, { level: 0 }));
}

function codes(diagnostics: readonly projectFormatV1.Diagnostic[]): readonly string[] {
  return diagnostics.map(({ code }) => code);
}
