import { readFileSync } from 'node:fs';

import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

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
import { encodeText, writeOoxmlPackage } from '../ooxml/zip';
import { exportPptxBytesV1, importPptxProjectV1, reconcilePptxProjectV1 } from './index';

const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function expectValid(result: Awaited<ReturnType<typeof importPptxProjectV1>>): void {
  const structural = projectFormatV1.parseProjectV1Unknown(result.project).diagnostics;

  expect(structural.filter(({ code }) => code === 'structural-invalid')).toEqual([]);
  expect(projectFormatV1.validateBroadsetProjectV1Semantics(result.project)).toEqual([]);
}

function picturePackage(input: { readonly count: number; readonly mediaBytes: Uint8Array }): Uint8Array {
  const pictures = Array.from({ length: input.count }, (_, index) => {
    const shapeId = String(index + 1);

    return `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="Picture ${shapeId}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></p:spPr></p:pic>`;
  }).join('');
  const presentation =
    '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>';
  const slide = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${pictures}</p:spTree></p:cSld></p:sld>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['ppt/presentation.xml', encodeText(presentation)],
      [
        'ppt/_rels/presentation.xml.rels',
        encodeText(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
        ),
      ],
      ['ppt/slides/slide1.xml', encodeText(slide)],
      [
        'ppt/slides/_rels/slide1.xml.rels',
        encodeText(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>',
        ),
      ],
      ['ppt/media/image1.png', input.mediaBytes],
    ]),
  );
}

function xmlBoundaryPackage(xml: string): Uint8Array {
  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['ppt/presentation.xml', encodeText(xml)],
      [
        'ppt/_rels/presentation.xml.rels',
        encodeText(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
        ),
      ],
    ]),
  );
}

function bytesOf(value: BufferSource): Uint8Array {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
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

    const sourceIdentity = baseline?.sourceIdentity;

    expect(sourceIdentity).toBeTypeOf('object');
    expect(sourceIdentity).not.toBeNull();
    expect(Array.isArray(sourceIdentity)).toBe(false);

    if (
      sourceIdentity === undefined ||
      sourceIdentity === null ||
      typeof sourceIdentity !== 'object' ||
      Array.isArray(sourceIdentity)
    ) {
      throw new Error('PPTX source identity must be a JSON object');
    }

    const sourceIdentityEntries = Object.entries(sourceIdentity);

    expect(sourceIdentityEntries).toHaveLength(1);
    expect(sourceIdentityEntries[0]?.[0]).toBe('externalElementId');
    expect(sourceIdentityEntries[0]?.[1]).toBeTypeOf('string');
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

  it('registers one shared media payload once across 1000 picture references', async () => {
    const mediaBytes = Uint8Array.from({ length: 257 }, (_, index) => (index * 31 + 17) % 256);
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const result = await importPptxProjectV1({
        bytes: picturePackage({ count: 1000, mediaBytes }),
        importedAt: IMPORTED_AT,
      });
      const matchingDigestCalls = digest.mock.calls.filter((call) => equalBytes(bytesOf(call[1]), mediaBytes));

      expect(result.project.documents[0]?.elements.filter(({ kind }) => kind === 'image')).toHaveLength(1000);
      expect(result.project.resources.assets.filter(({ kind }) => kind === 'image')).toHaveLength(1);
      expect(matchingDigestCalls).toHaveLength(1);
      expectValid(result);
    } finally {
      digest.mockRestore();
    }
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

  it.each(['#_ftn1', ['http:', '//broadset.dev/'].join('')])(
    'omits unsupported hyperlink %s with an interop diagnostic',
    async (hyperlinkTarget) => {
      const result = await importPptxProjectV1({
        bytes: powerpointComplexTextFixture({ hyperlinkTarget }),
        importedAt: IMPORTED_AT,
      });
      const text = result.project.documents[0]?.elements.find(({ kind }) => kind === 'text');
      const hyperlinks =
        text?.kind === 'text' ?
          text.text.paragraphs.flatMap((paragraph) =>
            paragraph.runs.flatMap((run) => (run.properties.hyperlink === undefined ? [] : [run.properties.hyperlink])),
          )
        : [];

      expect(hyperlinks).toEqual([]);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'pptx.hyperlink-unsupported', severity: 'warning' }),
      );
      expectValid(result);
    },
  );

  it('recovers embedded PPTX font bytes into v1 font resources', async () => {
    const bytes = new Uint8Array(readFileSync('src/_shared/fonts/__fixtures__/codicon.ttf'));
    const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'f'.repeat(64)}`);
    const fontAssetId = id('codicon-asset');
    const familyId = id('codicon-family');
    const faceId = id('codicon-face');
    const rootId = id('font-root');
    const text = projectFormatV1.createEmptyTextBody({
      paragraphId: id('font-paragraph'),
      runId: id('font-run'),
      fontFamilyId: familyId,
      fontFaceId: faceId,
      text: '\uea60',
    });
    const document = projectFormatV1.createDocumentV1({
      id: id('font-document'),
      elements: [
        projectFormatV1.createElementV1({
          id: rootId,
          name: 'Font root',
          geometry: projectFormatV1.createElementGeometry({ width: 320, height: 180 }),
          kind: 'group',
        }),
        projectFormatV1.createElementV1({
          id: id('font-text'),
          name: 'Embedded font text',
          parentId: rootId,
          geometry: projectFormatV1.createElementGeometry({ width: 100, height: 30 }),
          kind: 'text',
          text,
        }),
      ],
      pages: [
        projectFormatV1.createPageV1({
          id: id('font-page'),
          rootInstances: [
            {
              id: id('font-root-instance'),
              elementId: rootId,
              overrides: [],
              componentPropertyValues: [],
            },
          ],
        }),
      ],
    });
    const embedded: projectFormatV1.FontAsset = {
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
    const project = projectFormatV1.createProjectV1({
      documents: [document],
      resources: {
        assets: [embedded],
        fonts: [
          {
            id: familyId,
            familyName: 'codicon',
            fallbackFontIds: [],
            faces: [
              {
                id: faceId,
                source: { kind: 'asset', assetId: fontAssetId },
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
    const result = await importPptxProjectV1({
      bytes: await exportPptxBytesV1({ project, blobs: new Map([[digest, bytes]]) }),
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

  it('rejects DTD-bearing XML without exposing the parser to entity expansion', async () => {
    const presentation = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tag>&lol;</p:tag></p:presentation>`;
    const result = await importPptxProjectV1({
      bytes: writeOoxmlPackage(
        new Map([
          ['[Content_Types].xml', encodeText('<Types/>')],
          ['ppt/presentation.xml', encodeText(presentation)],
          [
            'ppt/_rels/presentation.xml.rels',
            encodeText(
              '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
            ),
          ],
        ]),
      ),
      importedAt: IMPORTED_AT,
    });

    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pptx.malformed-xml', severity: 'error' }),
    );
    expectValid(result);
  });

  it.each([
    [
      'DTD declaration',
      '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY payload "expanded">]><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
    ],
    [
      'node limit',
      `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${'<n/>'.repeat(250_001)}</p:presentation>`,
    ],
    [
      'depth limit',
      `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${'<n>'.repeat(101)}${'</n>'.repeat(101)}</p:presentation>`,
    ],
  ])('quarantines source bytes after terminal XML %s rejection', async (_boundary, xml) => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    try {
      const result = await importPptxProjectV1({
        bytes: xmlBoundaryPackage(xml),
        importedAt: IMPORTED_AT,
        maxExpansionRatio: Number.MAX_SAFE_INTEGER,
      });

      expect(digest).not.toHaveBeenCalled();
      expect([...result.blobs.values()]).toEqual([new Uint8Array()]);
      expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
        expect.objectContaining({ code: 'pptx.malformed-xml', severity: 'error' }),
      );
      expectValid(result);
    } finally {
      digest.mockRestore();
    }
  });

  it('diagnoses and strips macro payloads', async () => {
    const presentation = `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`;
    const result = await importPptxProjectV1({
      bytes: writeOoxmlPackage(
        new Map([
          ['[Content_Types].xml', encodeText('<Types/>')],
          ['ppt/presentation.xml', encodeText(presentation)],
          [
            'ppt/_rels/presentation.xml.rels',
            encodeText(
              '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
            ),
          ],
          ['ppt/vbaProject.bin', new Uint8Array([0, 0, 0, 0])],
        ]),
      ),
      importedAt: IMPORTED_AT,
    });

    expect(result.project.interop.records.flatMap(({ warnings }) => warnings)).toContainEqual(
      expect.objectContaining({ code: 'pptx.macro-rejected' }),
    );
    expectValid(result);
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
      expect([...result.blobs.values()].every((bytes: Uint8Array): boolean => bytes.byteLength === 0)).toBe(true);
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
