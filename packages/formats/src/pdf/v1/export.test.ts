import { readFileSync } from 'node:fs';

import { projectFormatV1 } from '@broadset/model';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TestPdfImportWorkerV1 } from '../import/test-worker';
import { exportPdfBytesV1, exportPdfWithPreflightV1, importPdfProjectV1 } from './index';

beforeAll((): void => {
  vi.stubGlobal('Worker', TestPdfImportWorkerV1);
});

afterAll((): void => {
  vi.unstubAllGlobals();
});

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');
const PNG_BYTES = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64'),
);

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function geometry(width: number, height: number, x = 0, y = 0): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width,
    height,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, x, y] },
  });
}

function testProject(options?: {
  readonly fontBytes?: Uint8Array;
  readonly backgroundColor?: projectFormatV1.ColorValue;
  readonly rootVisible?: boolean;
  readonly iccBytes?: Uint8Array;
}): {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
} {
  const rootId = id('root');
  const familyId = id('font-family');
  const faceId = id('font-face');
  const assetId = id('image-asset');
  const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`);
  const fontDigest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'b'.repeat(64)}`);
  const fontAssetId = id('font-asset');
  const iccDigest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'c'.repeat(64)}`);
  const iccAssetId = id('icc-asset');
  const elements: readonly projectFormatV1.Element[] = [
    projectFormatV1.createElementV1({ id: rootId, name: 'Root', geometry: geometry(320, 180), kind: 'group' }),
    projectFormatV1.createElementV1({
      id: id('rectangle'),
      name: 'Rectangle',
      parentId: rootId,
      geometry: geometry(80, 50, 20, 30),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: id('rectangle-fill'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 } },
          },
        ],
      },
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry(),
    }),
    projectFormatV1.createElementV1({
      id: id('text'),
      name: 'Text',
      parentId: rootId,
      geometry: geometry(180, 30, 20, 100),
      kind: 'text',
      text: projectFormatV1.createEmptyTextBody({
        paragraphId: id('paragraph'),
        runId: id('run'),
        fontFamilyId: familyId,
        fontFaceId: faceId,
        text: options?.fontBytes === undefined ? 'Native v1 PDF' : '\uea60',
        size: 18,
        color: { kind: 'color', space: 'srgb', channels: [0, 0, 1], alpha: 1 },
      }),
    }),
    projectFormatV1.createElementV1({
      id: id('image'),
      name: 'Image',
      parentId: rootId,
      geometry: geometry(24, 24, 250, 20),
      kind: 'image',
      image: { assetId, fit: 'contain' },
    }),
  ];
  const document = projectFormatV1.createDocumentV1({
    id: id('document'),
    color:
      options?.iccBytes === undefined ?
        projectFormatV1.createDefaultColorConfiguration()
      : {
          ...projectFormatV1.createDefaultColorConfiguration(),
          outputIntent: {
            iccProfileAssetId: iccAssetId,
            renderingIntent: 'relative-colorimetric',
            blackPointCompensation: true,
          },
        },
    surface: {
      ...projectFormatV1.createDefaultSurface(),
      size: [320, 180],
      ...(options?.backgroundColor === undefined ?
        {}
      : { background: { kind: 'solid', color: options.backgroundColor } }),
    },
    elements,
    pages: [
      projectFormatV1.createPageV1({
        id: id('page'),
        rootInstances: [
          {
            id: id('root-instance'),
            elementId: rootId,
            visible: options?.rootVisible ?? true,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ],
  });
  const imageAsset: projectFormatV1.ImageAsset = {
    id: assetId,
    kind: 'image',
    name: 'Pixel',
    blob: {
      digest,
      byteLength: PNG_BYTES.byteLength,
      mediaType: 'image/png',
      source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
    },
    metadata: {
      pixelWidth: 1,
      pixelHeight: 1,
      orientation: 1,
      hasAlpha: true,
      bitDepth: 8,
      colorModel: 'rgb',
    },
  };
  const fontAssets: readonly projectFormatV1.Asset[] =
    options?.fontBytes === undefined ?
      []
    : [
        {
          id: fontAssetId,
          kind: 'font',
          name: 'Codicon',
          blob: {
            digest: fontDigest,
            byteLength: options.fontBytes.byteLength,
            mediaType: 'font/ttf',
            source: { kind: 'package', path: `blobs/sha256/${fontDigest.slice('sha256:'.length)}` },
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
        },
      ];
  const iccAssets: readonly projectFormatV1.Asset[] =
    options?.iccBytes === undefined ?
      []
    : [
        {
          id: iccAssetId,
          kind: 'icc-profile',
          name: 'CMYK profile',
          blob: {
            digest: iccDigest,
            byteLength: options.iccBytes.byteLength,
            mediaType: 'application/vnd.iccprofile',
            source: { kind: 'package', path: `blobs/sha256/${iccDigest.slice('sha256:'.length)}` },
          },
          metadata: {
            profileClass: 'output',
            colorSpace: 'cmyk',
            profileConnectionSpace: 'lab',
            description: 'Test CMYK',
            identifier: 'test-cmyk',
          },
        },
      ];
  const project = projectFormatV1.createProjectV1({
    documents: [document],
    resources: {
      assets: [imageAsset, ...fontAssets, ...iccAssets],
      fonts: [
        {
          id: familyId,
          familyName: options?.fontBytes === undefined ? 'Helvetica' : 'codicon',
          fallbackFontIds: [],
          faces: [
            {
              id: faceId,
              source:
                options?.fontBytes === undefined ?
                  { kind: 'system', postScriptName: 'Helvetica' }
                : { kind: 'asset', assetId: fontAssetId },
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

  const blobs = new Map<projectFormatV1.Sha256Digest, Uint8Array>([[digest, PNG_BYTES]]);

  if (options?.fontBytes !== undefined) blobs.set(fontDigest, options.fontBytes);
  if (options?.iccBytes !== undefined) blobs.set(iccDigest, options.iccBytes);

  return { project, blobs };
}

function expectValid(result: Awaited<ReturnType<typeof importPdfProjectV1>>): void {
  expect(
    projectFormatV1
      .parseProjectV1Unknown(result.project)
      .diagnostics.filter(({ code }) => code === 'structural-invalid'),
  ).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

describe('exportPdfBytesV1', () => {
  it('serializes a self-contained v1 scene through the native PDF writer', async () => {
    const input = testProject();
    const bytes = await exportPdfBytesV1(input);
    const pdf = await PDFDocument.load(bytes);
    const imported = await importPdfProjectV1({ bytes, importedAt: IMPORTED_AT });
    const content = imported.project.documents[0]?.elements.filter(({ parentId }) => parentId !== null) ?? [];

    expect(pdf.getPageCount()).toBe(1);
    expect(content.some(({ kind }) => kind === 'text')).toBe(true);
    expect(content.some(({ kind }) => kind === 'vector')).toBe(true);
    expect(content.some(({ kind }) => kind === 'image')).toBe(true);

    const text = content.find(({ kind }) => kind === 'text');

    expect(text?.kind === 'text' ? text.text.paragraphs[0]?.runs[0]?.properties.color : undefined).toEqual({
      kind: 'color',
      space: 'srgb',
      channels: [0, 0, 1],
      alpha: 1,
    });
    expectValid(imported);
  });

  it('returns a valid diagnostic fallback when the requested document is absent', async () => {
    const input = testProject();
    const result = await exportPdfWithPreflightV1({ ...input, documentId: id('missing-document') });

    expect(result.bytes.byteLength).toBeGreaterThan(0);
    await expect(PDFDocument.load(result.bytes)).resolves.toBeDefined();
    expect(result.warnings).toContainEqual(expect.stringContaining('missing-document'));
  });

  it('embeds self-contained v1 font assets without a network resolver', async () => {
    const fontBytes = new Uint8Array(readFileSync('src/_shared/fonts/__fixtures__/codicon.ttf'));
    const input = testProject({ fontBytes });
    const result = await exportPdfWithPreflightV1({ ...input, options: { fetch: undefined } });
    const text = new TextDecoder('latin1').decode(result.bytes);

    expect(text).toContain('/FontFile2');
    expect(result.warnings.join('\n')).not.toContain('falling back to Helvetica');
  });

  it('preserves the v1 surface background color', async () => {
    const input = testProject({
      backgroundColor: { kind: 'color', space: 'srgb', channels: [0, 1, 0], alpha: 1 },
    });
    const bytes = await exportPdfBytesV1(input);
    const imported = await importPdfProjectV1({ bytes, importedAt: IMPORTED_AT });
    const colors =
      imported.project.documents[0]?.elements.flatMap(({ appearance }) =>
        appearance.fills.flatMap(({ paint }) => (paint.kind === 'solid' ? [paint.color] : [])),
      ) ?? [];

    expect(colors).toContainEqual({ kind: 'color', space: 'srgb', channels: [0, 1, 0], alpha: 1 });
    expectValid(imported);
  });

  it('diagnoses a missing image blob while still producing a readable PDF', async () => {
    const input = testProject();
    const result = await exportPdfWithPreflightV1({ project: input.project, blobs: new Map() });

    await expect(PDFDocument.load(result.bytes)).resolves.toBeDefined();
    expect(result.warnings).toContainEqual(expect.stringContaining('blob sha256:'));
  });

  it('does not paint a page tree whose root instance is hidden', async () => {
    const input = testProject({ rootVisible: false });
    const bytes = await exportPdfBytesV1(input);
    const imported = await importPdfProjectV1({ bytes, importedAt: IMPORTED_AT });
    const content = imported.project.documents[0]?.elements.filter(({ parentId }) => parentId !== null) ?? [];

    expect(content).toEqual([]);
    expectValid(imported);
  });

  it('uses a self-contained v1 CMYK output intent for PDF/A', async () => {
    const input = testProject({ iccBytes: Uint8Array.from([1, 2, 3, 4]) });
    const result = await exportPdfWithPreflightV1({ ...input, options: { pdfaConformance: '2b' } });
    const text = new TextDecoder('latin1').decode(result.bytes);

    expect(text).toContain('/OutputIntents');
    expect(text).toContain('/N 4');
  });

  it('never throws when even the fallback PDF allocator is unavailable', async () => {
    const create = vi.spyOn(PDFDocument, 'create').mockRejectedValue(new Error('allocator unavailable'));

    try {
      const input = testProject();
      const result = await exportPdfWithPreflightV1({ ...input, documentId: id('missing-document') });

      expect(new TextDecoder('latin1').decode(result.bytes).startsWith('%PDF-1.4')).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('missing-document'));
    } finally {
      create.mockRestore();
    }
  });
});
