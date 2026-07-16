import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgStringV1 } from '../index';
import { importSvgProjectV1 } from './import';

const DIGEST_HEX = 'a'.repeat(64);
const PACKAGE_PATH = `blobs/sha256/${DIGEST_HEX}`;
const IMPORTED_AT = projectFormatV1.utcTimestampSchema.parse('2026-07-12T00:00:00Z');

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

function appearance(): projectFormatV1.Appearance {
  return {
    ...projectFormatV1.createDefaultAppearance(),
    opacity: 0.8,
    fills: [
      {
        id: id('fill'),
        enabled: true,
        opacity: 0.75,
        blendMode: 'normal',
        paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [0.2, 0.4, 0.6], alpha: 0.5 } },
      },
    ],
    strokes: [
      {
        id: id('stroke'),
        enabled: true,
        opacity: 0.25,
        blendMode: 'normal',
        paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 } },
        width: 3,
        alignment: 'center',
        cap: 'round',
        join: 'bevel',
        miterLimit: 4,
        dash: [],
        dashOffset: 0,
      },
    ],
  };
}

function createProject(): projectFormatV1.BroadsetProjectV1 {
  const rootId = id('root');
  const fontFamilyId = id('font-family');
  const fontFaceId = id('font-face');
  const assetId = id('image-asset');
  const elements: readonly projectFormatV1.Element[] = [
    projectFormatV1.createElementV1({ id: rootId, name: 'Root', geometry: geometry(320, 180), kind: 'group' }),
    projectFormatV1.createElementV1({
      id: id('rect'),
      name: 'Rectangle',
      parentId: rootId,
      geometry: geometry(40, 30, 10, 20),
      appearance: appearance(),
      kind: 'vector',
      geometryData: projectFormatV1.createRectangleGeometry([4, 4, 4, 4]),
    }),
    projectFormatV1.createElementV1({
      id: id('ellipse'),
      name: 'Ellipse',
      parentId: rootId,
      geometry: geometry(30, 20),
      kind: 'vector',
      geometryData: projectFormatV1.createEllipseGeometry(),
    }),
    projectFormatV1.createElementV1({
      id: id('path'),
      name: 'Path',
      parentId: rootId,
      geometry: geometry(20, 20),
      kind: 'vector',
      geometryData: {
        kind: 'path',
        fillRule: 'evenodd',
        path: {
          points: [
            { id: id('p1'), x: 1, y: 2 },
            { id: id('p2'), x: 10, y: 12 },
          ],
          segments: [
            { id: id('s1'), kind: 'move', pointId: id('p1') },
            { id: id('s2'), kind: 'line', pointId: id('p2') },
          ],
          closed: true,
        },
      },
    }),
    projectFormatV1.createElementV1({
      id: id('text'),
      name: 'Text',
      parentId: rootId,
      geometry: geometry(200, 40),
      kind: 'text',
      text: {
        paragraphs: [
          {
            id: id('paragraph'),
            properties: { ...projectFormatV1.createParagraphProperties(), alignment: 'center' },
            runs: [
              {
                id: id('run'),
                text: `<script>"&<>'`,
                properties: projectFormatV1.createRunProperties({
                  fontFamilyId,
                  fontFaceId,
                  size: 18,
                  weight: 700,
                  color: { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 },
                }),
              },
            ],
          },
        ],
      },
    }),
    projectFormatV1.createElementV1({
      id: id('image'),
      name: 'Image',
      parentId: rootId,
      geometry: geometry(64, 48),
      kind: 'image',
      image: { assetId, fit: 'contain' },
    }),
  ];
  const document = projectFormatV1.createDocumentV1({
    id: id('document'),
    surface: { ...projectFormatV1.createDefaultSurface(), size: [320, 180] },
    elements,
    pages: [
      projectFormatV1.createPageV1({
        id: id('page'),
        rootInstances: [
          { id: id('instance'), elementId: rootId, visible: true, overrides: [], componentPropertyValues: [] },
        ],
      }),
    ],
  });

  return projectFormatV1.createProjectV1({
    documents: [document],
    resources: {
      assets: [
        {
          id: assetId,
          name: 'Image',
          kind: 'image',
          blob: {
            digest: projectFormatV1.sha256DigestSchema.parse(`sha256:${DIGEST_HEX}`),
            byteLength: 3,
            mediaType: 'image/png',
            source: { kind: 'package', path: PACKAGE_PATH },
          },
          metadata: {
            pixelWidth: 64,
            pixelHeight: 48,
            orientation: 1,
            hasAlpha: true,
            bitDepth: 8,
            colorModel: 'rgb',
          },
        },
      ],
      fonts: [
        {
          id: fontFamilyId,
          familyName: 'Test Sans',
          fallbackFontIds: [],
          faces: [
            {
              id: fontFaceId,
              source: { kind: 'system', postScriptName: 'TestSans-Bold' },
              weight: 700,
              style: 'normal',
              stretch: 100,
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
}

function expectWellFormed(svg: string): void {
  const parsed: Document = new DOMParser().parseFromString(svg, 'image/svg+xml');

  expect(parsed.querySelector('parsererror')).toBeNull();
}

describe('exportSvgStringV1', () => {
  it('serializes the core v1 kinds, transforms, paint, and asset fallback', () => {
    const svg = exportSvgStringV1({ project: createProject() });

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">');
    expect(svg).toContain('<g fill="none" stroke="none" transform="matrix(1,0,0,1,0,0)"');
    expect(svg).toContain('<rect x="0" y="0" width="40" height="30" rx="4" ry="4"');
    expect(svg).toContain('transform="matrix(1,0,0,1,10,20)"');
    expect(svg).toContain('fill="rgba(51, 102, 153, 0.5)" fill-opacity="0.75"');
    expect(svg).toContain('stroke="rgb(255, 0, 0)" stroke-opacity="0.25" stroke-width="3"');
    expect(svg).toContain('opacity="0.8"');
    expect(svg).toContain('<ellipse cx="15" cy="10" rx="15" ry="10"');
    expect(svg).toContain('<path d="M 1 2 L 10 12 Z" fill-rule="evenodd"');
    expect(svg).toContain('<text x="100" text-anchor="middle"');
    expect(svg).toContain('<tspan font-family="Test Sans" font-size="18" font-weight="700"');
    expect(svg).toContain(`<image href="${PACKAGE_PATH}" x="0" y="0" width="64" height="48"`);
    expectWellFormed(svg);
  });

  it('escapes hostile text and resolver-provided attribute values', () => {
    const svg = exportSvgStringV1({
      project: createProject(),
      resolveAssetHref: () => `data:image/svg+xml,"&<>'`,
    });

    expect(svg).toContain('&lt;script&gt;&quot;&amp;&lt;&gt;&apos;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('href="data:image/svg+xml,&quot;&amp;&lt;&gt;&apos;"');
    expectWellFormed(svg);
  });

  it('exports minimal valid SVG for an unresolved document or page without throwing', () => {
    const project = createProject();
    const svg = exportSvgStringV1({ project, documentId: id('missing'), pageId: id('missing') });

    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expectWellFormed(svg);
  });

  it.each(['heroicons-pencil.svg', 'inkscape-shapes.svg'])(
    'round-trips the stable native element sequence from %s',
    async (fileName) => {
      const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '__fixtures__');
      const source = readFileSync(join(fixtureDirectory, fileName), 'utf8');
      const imported = await importSvgProjectV1({ svg: source, fileName, importedAt: IMPORTED_AT });
      const exported = exportSvgStringV1({ project: imported.project });
      const reimported = await importSvgProjectV1({ svg: exported, fileName, importedAt: IMPORTED_AT });
      const kinds = imported.project.documents[0]?.elements.map(({ kind }) => kind) ?? [];
      const reimportedKinds = reimported.project.documents[0]?.elements.map(({ kind }) => kind) ?? [];

      expectWellFormed(exported);
      expect(reimportedKinds).toEqual(kinds);
    },
  );
});
