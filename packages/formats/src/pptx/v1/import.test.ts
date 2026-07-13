import { readFileSync } from 'node:fs';

import { createDefaultElement, createEmptyBroadsetDocument, fontAsset, projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { importPptxProjectV1, reconcilePptxProjectV1 } from '../../index';
import { exportPptxBytes } from '../export';
import {
  canvaCroppedFixture,
  canvaFixture,
  googleSlidesFixture,
  keynoteFixture,
  keynoteNonSrgbColoursFixture,
  libreofficeFixture,
  powerpointComplexTextFixture,
  powerpointFixture,
} from '../fixtures/external-tools';

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function expectValid(result: Awaited<ReturnType<typeof importPptxProjectV1>>): void {
  const structural = projectFormatV1.parseProjectV1Unknown(result.project).diagnostics;

  expect(structural.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

describe('importPptxProjectV1', () => {
  it('maps PowerPoint text and preset shapes to native v1 elements', async () => {
    const result = await importPptxProjectV1({ bytes: powerpointFixture(), importedAt: IMPORTED_AT });
    const elements = result.project.documents[0]?.elements ?? [];
    const baseline = result.project.interop.records[0];
    const firstMapped = elements.find(({ id }) => id === baseline?.target.entityId);

    expect(elements.some(({ kind }) => kind === 'text')).toBe(true);
    expect(elements.filter(({ kind }) => kind === 'vector').length).toBeGreaterThanOrEqual(2);
    expect(baseline?.baselineSemanticHash).toBe(await projectFormatV1.computeCanonicalJsonHashV1(firstMapped));
    expectValid(result);
  });

  it('maps LibreOffice slides to distinct v1 pages', async () => {
    const result = await importPptxProjectV1({ bytes: libreofficeFixture(), importedAt: IMPORTED_AT });

    expect(result.project.documents[0]?.pages).toHaveLength(3);
    expectValid(result);
  });

  it('maps Keynote custom geometry to a structured v1 path', async () => {
    const result = await importPptxProjectV1({ bytes: keynoteFixture(), importedAt: IMPORTED_AT });
    const path = result.project.documents[0]?.elements.find(
      (element) => element.kind === 'vector' && element.geometryData.kind === 'path',
    );

    expect(
      path?.kind === 'vector' && path.geometryData.kind === 'path' ? path.geometryData.path.segments.length : 0,
    ).toBeGreaterThanOrEqual(4);
    expectValid(result);
  });

  it('preserves Canva picture bytes as a v1 image asset', async () => {
    const result = await importPptxProjectV1({ bytes: canvaFixture(), importedAt: IMPORTED_AT });
    const image = result.project.documents[0]?.elements.find(({ kind }) => kind === 'image');
    const asset = result.project.resources.assets.find(
      ({ id }) => image?.kind === 'image' && image.image.assetId === id,
    );

    expect(asset).toMatchObject({ kind: 'image', blob: { mediaType: 'image/png' } });
    expectValid(result);
  });

  it('preserves PowerPoint paragraph and run-level rich text', async () => {
    const result = await importPptxProjectV1({
      bytes: powerpointComplexTextFixture(),
      importedAt: IMPORTED_AT,
    });
    const text = result.project.documents[0]?.elements.find(({ kind }) => kind === 'text');

    expect(text?.kind === 'text' ? text.text.paragraphs : []).toMatchObject([
      {
        properties: { alignment: 'center' },
        runs: [
          { properties: { weight: 700, color: { channels: [0.7529411764705882, 0, 0] } } },
          { properties: { weight: 400 } },
          { properties: { semanticRole: 'emphasis', color: { channels: [0, 0, 0.7529411764705882] } } },
        ],
      },
      {
        properties: { list: { kind: 'unordered' } },
        runs: [{ properties: { hyperlink: 'https://broadset.dev/', decoration: { underline: true } } }],
      },
    ]);
    expectValid(result);
  });

  it('recovers embedded PPTX font bytes into v1 font resources', async () => {
    const document = createEmptyBroadsetDocument();
    const bytes = new Uint8Array(readFileSync('src/_shared/fonts/__fixtures__/codicon.ttf'));
    const embedded = fontAsset({
      id: 'codicon-asset',
      name: 'Codicon',
      mimeType: 'font/ttf',
      source: { type: 'embedded', dataUri: `data:font/ttf;base64,${bytesToBase64(bytes)}` },
      format: 'ttf',
      postScriptName: 'codicon',
      familyName: 'codicon',
    });
    const source = {
      ...document,
      elements: [
        createDefaultElement('text', {
          id: 'font-text',
          name: 'Embedded font text',
          content: '\uea60',
          style: { fontFamily: 'codicon' },
        }),
      ],
    };
    const result = await importPptxProjectV1({
      bytes: exportPptxBytes(source, { fontAssets: [embedded] }),
      importedAt: IMPORTED_AT,
    });
    const font = result.project.resources.fonts.find(({ familyName }) => familyName === 'codicon');
    const fontAssetResource = result.project.resources.assets.find(({ kind }) => kind === 'font');

    expect(font?.faces[0]?.source).toEqual({ kind: 'asset', assetId: fontAssetResource?.id });

    const recoveredBytes =
      fontAssetResource?.kind === 'font' ? result.blobs.get(fontAssetResource.blob.digest) : undefined;

    expect(recoveredBytes?.byteLength).toBeGreaterThan(0);
    expect(recoveredBytes?.byteLength).toBe(fontAssetResource?.blob.byteLength);
    expectValid(result);
  });

  it.each([
    ['PowerPoint', powerpointFixture],
    ['Keynote', keynoteFixture],
    ['Google Slides', googleSlidesFixture],
    ['LibreOffice', libreofficeFixture],
    ['Canva', canvaFixture],
    ['PowerPoint complex text', powerpointComplexTextFixture],
    ['Keynote non-sRGB', keynoteNonSrgbColoursFixture],
    ['Canva crop', canvaCroppedFixture],
  ])('%s producer fixture reaches zero-error v1 validity', async (_producer, fixture) => {
    const result = await importPptxProjectV1({ bytes: fixture(), importedAt: IMPORTED_AT });

    expectValid(result);
  });

  it('fails soft for malformed and oversized packages', async () => {
    const malformed = await importPptxProjectV1({
      bytes: new TextEncoder().encode('not a ZIP'),
      importedAt: IMPORTED_AT,
    });
    const oversized = await importPptxProjectV1({
      bytes: powerpointFixture(),
      importedAt: IMPORTED_AT,
      maxInputBytes: 1,
    });

    expectValid(malformed);
    expectValid(oversized);
    expect(malformed.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(oversized.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pptx.size-cap', severity: 'error' }),
    );
  });

  it('does not hash or retain oversized source bytes', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const result = await importPptxProjectV1({
        bytes: powerpointFixture(),
        importedAt: IMPORTED_AT,
        maxInputBytes: 1,
      });

      expectValid(result);
      expect(digest).not.toHaveBeenCalled();
      expect([...result.blobs.values()].every(({ byteLength }) => byteLength === 0)).toBe(true);
    } finally {
      digest.mockRestore();
    }
  });

  it('returns a complete fallback when resource hashing fails', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('digest unavailable'));

    try {
      const result = await importPptxProjectV1({ bytes: powerpointFixture(), importedAt: IMPORTED_AT });

      expectValid(result);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'pptx.import-failed', severity: 'error' }),
      );
    } finally {
      digest.mockRestore();
    }
  });

  it('exposes first-import shapes as reconciliation additions', async () => {
    const reconciliation = await reconcilePptxProjectV1({ bytes: googleSlidesFixture() });

    expect(reconciliation.additions.length).toBeGreaterThan(0);
    expect(reconciliation.modifications).toEqual([]);
    expect(reconciliation.deletions).toEqual([]);
  });

  it('fails reconciliation soft for malformed packages', async () => {
    await expect(reconcilePptxProjectV1({ bytes: new TextEncoder().encode('not a ZIP') })).resolves.toEqual({
      additions: [],
      modifications: [],
      deletions: [],
      recoveredByHash: [],
    });
  });
});
