import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytesV1, exportPptxWithReportV1, importPptxProjectV1 } from '../../index';
import { encodeText, readOoxmlPackage, readTextPart, writeOoxmlPackage } from '../ooxml/zip';

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

function testProject(options?: { readonly visible?: boolean; readonly pageCount?: number }): {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
} {
  const rootId = id('root');
  const familyId = id('font-family');
  const faceId = id('font-face');
  const imageAssetId = id('image-asset');
  const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'d'.repeat(64)}`);
  const firstText = projectFormatV1.createEmptyTextBody({
    paragraphId: id('paragraph'),
    runId: id('first-run'),
    fontFamilyId: familyId,
    fontFaceId: faceId,
    text: 'First',
    size: 14,
    color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 },
  });
  const paragraph = firstText.paragraphs[0];
  const firstRun = paragraph?.runs[0];

  if (paragraph === undefined || firstRun === undefined) throw new Error('test text fixture must contain a run');

  const text: projectFormatV1.TextBody = {
    paragraphs: [
      {
        ...paragraph,
        properties: { ...paragraph.properties, alignment: 'center' },
        runs: [
          firstRun,
          {
            ...firstRun,
            id: id('second-run'),
            text: 'Second',
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
  const pages = Array.from({ length: options?.pageCount ?? 1 }, (_, index) =>
    projectFormatV1.createPageV1({
      id: id(`page-${String(index + 1)}`),
      name: `Slide ${String(index + 1)}`,
      rootInstances: [
        {
          id: id(`root-instance-${String(index + 1)}`),
          elementId: rootId,
          visible: options?.visible ?? true,
          overrides: [],
          componentPropertyValues: [],
        },
      ],
    }),
  );
  const document = projectFormatV1.createDocumentV1({
    id: id('document'),
    surface: { ...projectFormatV1.createDefaultSurface(), size: [320, 180], unit: 'px', dpi: 72 },
    elements: [
      projectFormatV1.createElementV1({ id: rootId, name: 'Root group', geometry: geometry(320, 180), kind: 'group' }),
      projectFormatV1.createElementV1({
        id: id('rectangle'),
        name: 'Green rectangle',
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
        name: 'Rich text',
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
        image: { assetId: imageAssetId, fit: 'fill' },
      }),
    ],
    pages,
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

function expectValid(result: Awaited<ReturnType<typeof importPptxProjectV1>>): void {
  expect(
    projectFormatV1
      .parseProjectV1Unknown(result.project)
      .diagnostics.filter(({ code }) => code === 'structural-invalid'),
  ).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

describe('exportPptxBytesV1', () => {
  it('serializes grouped editable shapes, rich runs, and package image blobs', async () => {
    const input = testProject();
    const bytes = await exportPptxBytesV1({ ...input, options: { exportedAt: 0 } });
    const pkg = readOoxmlPackage(bytes);
    const slide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';
    const imported = await importPptxProjectV1({ bytes, importedAt: IMPORTED_AT });

    expect(slide).toContain('<p:grpSp>');
    expect(slide).toContain('b="1"');
    expect(slide).toContain('i="1"');
    expect(slide).toContain('u="sng"');
    expect(slide).toContain('typeface="Arial"');
    expect([...pkg.keys()].some((path: string): boolean => path.startsWith('ppt/media/'))).toBe(true);
    expectValid(imported);
  });

  it('writes the standard custom XML carriers and preserves authored surface units on re-import', async () => {
    const input = testProject();
    const bytes = await exportPptxBytesV1({ ...input, options: { exportedAt: 0 } });
    const pkg = readOoxmlPackage(bytes);
    const slide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';
    const relationships = readTextPart(pkg, 'ppt/_rels/presentation.xml.rels') ?? '';
    const contentTypes = readTextPart(pkg, '[Content_Types].xml') ?? '';
    const customProperties = readTextPart(pkg, 'docProps/custom.xml') ?? '';
    const imported = await importPptxProjectV1({ bytes, importedAt: IMPORTED_AT });
    const rectangle = imported.project.documents[0]?.elements.find(({ id: elementId }) => elementId === id('rectangle'));
    const matrix = rectangle?.geometry.transform.kind === 'affine2d' ? rectangle.geometry.transform.matrix : undefined;

    expect(readTextPart(pkg, 'customXml/broadset-project.xml')).toContain('<bset:canonicalJson>');
    expect(readTextPart(pkg, 'customXml/broadset-interop.xml')).toContain('<bset:interopJson>');
    expect(customProperties).toContain('https://broadset.io/ns/xmp/1.0/');
    expect(customProperties).toContain('&lt;rdf:RDF');
    expect(customProperties).not.toMatch(/<vt:lpwstr\s+[^>]*broadset:/u);
    expect(relationships.match(/relationships\/customXml/gu)).toHaveLength(2);
    expect(contentTypes).toContain('/customXml/broadset-project.xml');
    expect(contentTypes).toContain('/customXml/broadset-interop.xml');
    expect(slide).toContain('name="BSET:rectangle:vector"');
    expect(slide).toContain('{broadset-element-ext}');
    expect(slide).toContain('<a:extLst><a:ext uri="{broadset-element-ext}"');
    expect(slide).not.toContain('<p:extLst>');
    expect(imported.project.documents[0]?.surface).toMatchObject({ unit: 'px', dpi: 72, size: [320, 180] });
    expect(matrix?.[4]).toBeCloseTo(20, 5);
    expect(matrix?.[5]).toBeCloseTo(30, 5);
    expectValid(imported);
  });

  it('reconciles an externally moved tagged shape over preserved custom XML metadata', async () => {
    const input = testProject();
    const bytes = await exportPptxBytesV1({ ...input, options: { exportedAt: 0 } });
    const pkg = new Map(readOoxmlPackage(bytes));
    const slide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';
    const moved = slide.replace('<a:off x="254000" y="381000"/>', '<a:off x="1016000" y="381000"/>');

    expect(moved).not.toBe(slide);
    pkg.set('ppt/slides/slide1.xml', encodeText(moved));

    const imported = await importPptxProjectV1({ bytes: writeOoxmlPackage(pkg), importedAt: IMPORTED_AT });
    const rectangle = imported.project.documents[0]?.elements.find(({ id: elementId }) => elementId === id('rectangle'));
    const matrix = rectangle?.geometry.transform.kind === 'affine2d' ? rectangle.geometry.transform.matrix : undefined;

    expect(matrix?.[4]).toBeCloseTo(80, 5);
    expect(matrix?.[5]).toBeCloseTo(30, 5);
    expectValid(imported);
  });

  it('exports every page as exactly one slide without sibling-page duplicates', async () => {
    const input = testProject({ pageCount: 2 });
    const bytes = await exportPptxBytesV1({ ...input, options: { exportedAt: 0 } });
    const pkg = readOoxmlPackage(bytes);
    const firstSlide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';
    const secondSlide = readTextPart(pkg, 'ppt/slides/slide2.xml') ?? '';
    const imported = await importPptxProjectV1({ bytes, importedAt: IMPORTED_AT });

    expect(firstSlide.split('>First<')).toHaveLength(2);
    expect(secondSlide.split('>First<')).toHaveLength(2);
    expect(readTextPart(pkg, 'ppt/slides/slide3.xml')).toBeNull();
    expect(imported.project.documents[0]?.pages).toHaveLength(2);
    expectValid(imported);
  });

  it('returns a readable diagnostic fallback when the requested document is absent', async () => {
    const input = testProject();
    const result = await exportPptxWithReportV1({ ...input, documentId: id('missing-document') });

    expect(() => readOoxmlPackage(result.bytes)).not.toThrow();
    expect(result.warnings.some(({ message }) => message.includes('missing-document'))).toBe(true);
  });

  it('diagnoses a missing image blob while still producing a readable package', async () => {
    const input = testProject();
    const result = await exportPptxWithReportV1({
      project: input.project,
      blobs: new Map(),
      options: { exportedAt: 0 },
    });

    expect(() => readOoxmlPackage(result.bytes)).not.toThrow();
    expect(result.warnings.some(({ message }) => message.includes('blob sha256:'))).toBe(true);
  });

  it('embeds self-contained v1 font assets without a network resolver', async () => {
    const input = testProject();
    const fixtureRoot =
      process.cwd().endsWith('packages\\formats') || process.cwd().endsWith('packages/formats') ?
        'src'
      : 'packages/formats/src';
    const bytes = new Uint8Array(readFileSync(resolve(fixtureRoot, '_shared/fonts/__fixtures__/codicon.ttf')));
    const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'e'.repeat(64)}`);
    const fontAssetId = id('font-asset');
    const font: projectFormatV1.FontAsset = {
      id: fontAssetId,
      kind: 'font',
      name: 'Codicon',
      blob: {
        digest,
        byteLength: bytes.byteLength,
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
    const family = input.project.resources.fonts[0];

    if (family === undefined) throw new Error('test project must contain a font family');

    const project: projectFormatV1.BroadsetProjectV1 = {
      ...input.project,
      resources: {
        ...input.project.resources,
        assets: [...input.project.resources.assets, font],
        fonts: [
          {
            ...family,
            familyName: 'codicon',
            faces: family.faces.map((face) => ({ ...face, source: { kind: 'asset', assetId: fontAssetId } })),
          },
        ],
      },
    };
    const blobs = new Map(input.blobs);

    blobs.set(digest, bytes);

    const pkg = readOoxmlPackage(await exportPptxBytesV1({ project, blobs, options: { exportedAt: 0 } }));

    expect([...pkg.keys()].some((path: string): boolean => path.startsWith('ppt/fonts/'))).toBe(true);
  });

  it('omits a hidden v1 page tree', async () => {
    const input = testProject({ visible: false });
    const pkg = readOoxmlPackage(await exportPptxBytesV1({ ...input, options: { exportedAt: 0 } }));
    const slide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';

    expect(slide).not.toContain('Rich text');
    expect(slide).not.toContain('Green rectangle');
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
    const result = await exportPptxWithReportV1({ project, blobs: input.blobs });

    expect(() => readOoxmlPackage(result.bytes)).not.toThrow();
    expect(result.warnings.some(({ message }) => message.includes('failed soft'))).toBe(true);
  });
});
