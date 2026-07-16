import { projectFormatV1 } from '@broadset/model';
import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytesV1, exportPsdWithPreflightV1, importPsdProjectV1 } from '../../index';

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

function testProject(rootVisible = true): {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
} {
  const rootId = id('root');
  const familyId = id('font-family');
  const faceId = id('font-face');
  const imageAssetId = id('image-asset');
  const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`);
  const firstText = projectFormatV1.createEmptyTextBody({
    paragraphId: id('paragraph'),
    runId: id('red-run'),
    fontFamilyId: familyId,
    fontFaceId: faceId,
    text: 'Red',
    size: 14,
    color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 },
  });
  const firstParagraph = firstText.paragraphs[0];
  const firstRun = firstText.paragraphs[0]?.runs[0];

  if (firstParagraph === undefined || firstRun === undefined) throw new Error('test text fixture must contain a run');

  const text: projectFormatV1.TextBody = {
    paragraphs: [
      {
        ...firstParagraph,
        runs: [
          firstRun,
          {
            ...firstRun,
            id: id('blue-run'),
            text: 'Blue',
            properties: {
              ...firstRun.properties,
              size: 22,
              weight: 700,
              semanticRole: 'emphasis',
              color: { kind: 'color', space: 'srgb', channels: [0, 0, 1], alpha: 1 },
              decoration: { ...firstRun.properties.decoration, underline: true },
            },
          },
        ],
      },
    ],
  };
  const document = projectFormatV1.createDocumentV1({
    id: id('document'),
    surface: { ...projectFormatV1.createDefaultSurface(), size: [320, 180], unit: 'px', dpi: 72 },
    elements: [
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
              id: id('fill'),
              enabled: true,
              opacity: 1,
              blendMode: 'normal',
              paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [0, 1, 0], alpha: 1 } },
            },
          ],
        },
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      }),
      projectFormatV1.createElementV1({
        id: id('text'),
        name: 'Mixed text',
        parentId: rootId,
        geometry: geometry(180, 30, 20, 100),
        kind: 'text',
        text,
      }),
      projectFormatV1.createElementV1({
        id: id('image'),
        name: 'Image',
        parentId: rootId,
        geometry: geometry(24, 24, 250, 20),
        kind: 'image',
        image: { assetId: imageAssetId, fit: 'contain' },
      }),
    ],
    pages: [
      projectFormatV1.createPageV1({
        id: id('page'),
        rootInstances: [
          {
            id: id('root-instance'),
            elementId: rootId,
            visible: rootVisible,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ],
  });
  const asset: projectFormatV1.ImageAsset = {
    id: imageAssetId,
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
  const project = projectFormatV1.createProjectV1({
    documents: [document],
    resources: {
      assets: [asset],
      fonts: [
        {
          id: familyId,
          familyName: 'Arial',
          fallbackFontIds: [],
          faces: [
            {
              id: faceId,
              source: { kind: 'system', postScriptName: 'ArialMT' },
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

  return { project, blobs: new Map([[digest, PNG_BYTES]]) };
}

function expectValid(result: Awaited<ReturnType<typeof importPsdProjectV1>>): void {
  expect(
    projectFormatV1
      .parseProjectV1Unknown(result.project)
      .diagnostics.filter(({ code }) => code === 'structural-invalid'),
  ).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

describe('exportPsdBytesV1', () => {
  it('serializes editable v1 layers and mixed text runs through the PSD writer', async () => {
    const input = testProject();
    const bytes = await exportPsdBytesV1(input);
    const psd = readPsd(bytes);
    const root = psd.children?.find(({ name }) => name === 'Root');
    const text = root?.children?.find(({ name }) => name === 'Mixed text');
    const textData = text?.text;
    const imported = await importPsdProjectV1({ bytes, importedAt: IMPORTED_AT });

    expect(root?.children?.some(({ name, vectorMask }) => name === 'Rectangle' && vectorMask !== undefined)).toBe(true);
    expect(root?.children?.some(({ name, placedLayer }) => name === 'Image' && placedLayer !== undefined)).toBe(true);
    expect(
      textData?.styleRuns?.map(({ length, style }) => {
        const effective = { ...textData.style, ...style };

        return {
          length,
          size: effective.fontSize,
          family: effective.font?.name,
          bold: effective.fauxBold,
          italic: effective.fauxItalic,
        };
      }),
    ).toEqual([
      { length: 3, size: 14, family: 'Arial', bold: false, italic: false },
      { length: 4, size: 22, family: 'Arial', bold: true, italic: true },
    ]);
    expectValid(imported);
  });

  it('returns a readable diagnostic fallback when the requested document is absent', async () => {
    const input = testProject();
    const result = await exportPsdWithPreflightV1({ ...input, documentId: id('missing-document') });

    expect(() => readPsd(result.bytes)).not.toThrow();
    expect(result.warnings).toContainEqual(expect.stringContaining('missing-document'));
  });

  it('diagnoses a missing image blob while still producing a readable PSD', async () => {
    const input = testProject();
    const result = await exportPsdWithPreflightV1({ project: input.project, blobs: new Map() });

    expect(() => readPsd(result.bytes)).not.toThrow();
    expect(result.warnings).toContainEqual(expect.stringContaining('blob sha256:'));
  });

  it('does not emit layers for a hidden page root', async () => {
    const input = testProject(false);
    const bytes = await exportPsdBytesV1(input);
    const psd = readPsd(bytes);

    // ag-psd may materialize one empty compatibility layer for a layerless document.
    expect(psd.children?.some(({ name }) => name === 'Root')).toBe(false);
  });

  it('exports all v1 pages as distinct PSD artboards by default', async () => {
    const input = testProject();
    const document = input.project.documents[0];
    const firstPage = document?.pages[0];

    if (document === undefined || firstPage === undefined) throw new Error('test project must contain a page');

    const project: projectFormatV1.BroadsetProjectV1 = {
      ...input.project,
      documents: [
        {
          ...document,
          pages: [
            { ...firstPage, name: 'Artboard A' },
            {
              ...firstPage,
              id: id('page-b'),
              name: 'Artboard B',
              rootInstances: firstPage.rootInstances.map((root) => ({ ...root, id: id('root-instance-b') })),
            },
          ],
        },
      ],
    };
    const psd = readPsd(await exportPsdBytesV1({ project, blobs: input.blobs }));

    expect(psd.children?.map(({ name, artboard }) => ({ name, artboard: artboard !== undefined }))).toEqual([
      { name: 'Artboard A', artboard: true },
      { name: 'Artboard B', artboard: true },
    ]);
  });

  it('never throws when the selected surface cannot be serialized', async () => {
    const input = testProject();
    const document = input.project.documents[0];

    if (document === undefined) throw new Error('test project must contain a document');

    const project: projectFormatV1.BroadsetProjectV1 = {
      ...input.project,
      documents: [
        {
          ...document,
          surface: { ...document.surface, size: [Number.POSITIVE_INFINITY, document.surface.size[1]] },
        },
      ],
    };
    const result = await exportPsdWithPreflightV1({ project, blobs: input.blobs });

    expect(() => readPsd(result.bytes)).not.toThrow();
    expect(result.warnings).toContainEqual(expect.stringContaining('failed soft'));
  });
});
