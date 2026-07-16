import { projectFormatV1 } from '@broadset/model';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { computeSha256DigestV1 } from '../v1';
import { resolvePptxImportCaps } from './import-caps';
import { readOoxmlPackage, writeOoxmlPackage } from './ooxml/zip';
import { exportPptxBytesV1 } from './v1/export';
import { importPptxProjectV1 } from './v1/import';
import { collectMetadataBlobs } from './v1/metadata';

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-15T00:00:00Z');

function warnings(
  result: Awaited<ReturnType<typeof importPptxProjectV1>>,
): readonly projectFormatV1.InteropDiagnostic[] {
  return result.project.interop.records.flatMap((record) => record.warnings);
}

describe('PPTX v1 archive trust boundary', () => {
  it('replaces non-finite and non-positive caller caps with safe defaults', () => {
    const caps = resolvePptxImportCaps({
      maxInputBytes: Number.NaN,
      maxEntries: Number.POSITIVE_INFINITY,
      maxPartBytes: 0,
      maxTotalUncompressedBytes: -1,
      maxExpansionRatio: Number.POSITIVE_INFINITY,
      maxDepth: Number.NaN,
    });

    expect(caps).toEqual({
      maxInputBytes: 200 * 1024 * 1024,
      maxEntries: 4096,
      maxPartBytes: 50 * 1024 * 1024,
      maxTotalUncompressedBytes: 64 * 1024 * 1024,
      maxExpansionRatio: 100,
      maxDepth: 100,
    });
  });

  it('surfaces expansion-ratio, path-depth, and unsafe-path rejection without throwing', async () => {
    const ratio = await importPptxProjectV1({
      bytes: zipSync({ 'ppt/media/bomb.bin': new Uint8Array(128 * 1024) }),
      importedAt: IMPORTED_AT,
      maxExpansionRatio: 2,
    });
    const depth = await importPptxProjectV1({
      bytes: zipSync({ 'a/b/c/d.bin': new Uint8Array([1]) }),
      importedAt: IMPORTED_AT,
      maxDepth: 2,
    });
    const unsafe = await importPptxProjectV1({
      bytes: zipSync({ '../escape.bin': new Uint8Array([1]) }),
      importedAt: IMPORTED_AT,
    });

    expect(warnings(ratio)).toContainEqual(expect.objectContaining({ code: 'pptx.size-cap' }));
    expect(warnings(depth)).toContainEqual(expect.objectContaining({ code: 'pptx.depth-cap' }));
    expect(warnings(unsafe)).toContainEqual(expect.objectContaining({ code: 'pptx.malformed-xml' }));

    for (const result of [ratio, depth, unsafe]) {
      expect(projectFormatV1.broadsetProjectV1Schema.safeParse(result.project).success).toBe(true);
      expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
    }
  });

  it('omits and diagnoses a packaged blob whose filename digest does not match its bytes', async () => {
    const fontBytes = new Uint8Array([0, 1, 0, 0, 11, 22, 33, 44]);
    const digest = await computeSha256DigestV1(fontBytes);
    const assetId = projectFormatV1.idSchema.parse('trust-font-asset');
    const familyId = projectFormatV1.idSchema.parse('trust-font-family');
    const faceId = projectFormatV1.idSchema.parse('trust-font-face');
    const document = projectFormatV1.createDocumentV1({
      id: projectFormatV1.idSchema.parse('trust-document'),
      pages: [projectFormatV1.createPageV1({ id: projectFormatV1.idSchema.parse('trust-page') })],
    });
    const fontAsset: projectFormatV1.FontAsset = {
      id: assetId,
      kind: 'font',
      name: 'Codicon',
      blob: {
        digest,
        byteLength: fontBytes.byteLength,
        mediaType: 'font/ttf',
        source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
      },
      metadata: {
        format: 'truetype',
        postScriptName: 'codicon',
        family: 'codicon',
        weight: 400,
        style: 'normal',
        stretch: 1,
        variableAxes: [],
        unicodeCoverage: [],
        embeddingPermissions: 'installable',
      },
    };
    const project = projectFormatV1.createProjectV1({
      documents: [document],
      resources: {
        assets: [fontAsset],
        fonts: [
          {
            id: familyId,
            familyName: 'codicon',
            fallbackFontIds: [],
            faces: [
              {
                id: faceId,
                source: { kind: 'asset', assetId },
                weight: 400,
                style: 'normal',
                stretch: 1,
              },
            ],
          },
        ],
        swatches: [],
        variables: [],
        styles: [],
        outputProfiles: [],
      },
    });
    const exported = await exportPptxBytesV1({ project, blobs: new Map([[digest, fontBytes]]) });
    const parts: Map<string, Uint8Array> = new Map(readOoxmlPackage(exported));
    const paths: readonly string[] = [...parts.keys()];
    const fontPath: string | undefined = paths.find((path: string): boolean => path.startsWith('ppt/fonts/broadset-'));

    expect(fontPath).toBeDefined();

    if (fontPath === undefined) return;

    const tampered = Uint8Array.from(parts.get(fontPath) ?? new Uint8Array());

    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    parts.set(fontPath, tampered);

    const result = await importPptxProjectV1({ bytes: writeOoxmlPackage(parts), importedAt: IMPORTED_AT });

    expect(result.blobs.has(digest)).toBe(false);
    expect(warnings(result)).toContainEqual(expect.objectContaining({ code: 'pptx.blob-digest-mismatch' }));
    expect(projectFormatV1.broadsetProjectV1Schema.safeParse(result.project).success).toBe(true);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
  });

  it('removes a digest when any metadata reference to it fails integrity verification', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await computeSha256DigestV1(bytes);
    const document = projectFormatV1.createDocumentV1({
      id: projectFormatV1.idSchema.parse('conflict-document'),
      pages: [projectFormatV1.createPageV1({ id: projectFormatV1.idSchema.parse('conflict-page') })],
    });
    const blob: projectFormatV1.BlobReference = {
      digest,
      byteLength: bytes.byteLength,
      mediaType: 'application/octet-stream',
      source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
    };
    const validAsset: projectFormatV1.ForeignAsset = {
      id: projectFormatV1.idSchema.parse('valid-reference'),
      kind: 'foreign',
      name: 'valid.bin',
      blob,
      metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } },
    };
    const conflictingAsset: projectFormatV1.ForeignAsset = {
      ...validAsset,
      id: projectFormatV1.idSchema.parse('conflicting-reference'),
      name: 'conflicting.bin',
      blob: { ...blob, byteLength: bytes.byteLength + 1 },
    };
    const project = projectFormatV1.createProjectV1({
      documents: [document],
      resources: {
        assets: [validAsset, conflictingAsset],
        fonts: [],
        swatches: [],
        variables: [],
        styles: [],
        outputProfiles: [],
      },
    });
    const pkg = new Map<string, Uint8Array>([[`ppt/media/broadset-${digest.slice('sha256:'.length)}.bin`, bytes]]);

    const result = await collectMetadataBlobs(pkg, project);

    expect(result.blobs.has(digest)).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'pptx.blob-byte-length-mismatch' }));
  });
});
