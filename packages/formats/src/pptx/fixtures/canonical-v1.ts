import { projectFormatV1 } from '@broadset/model';

import { exportPptxBytesV1 } from '../v1/export';

const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAACklEQVR4AWNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==',
    'base64',
  ),
);

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function geometry(width: number, height: number, position: readonly [number, number]): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width,
    height,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, position[0], position[1]] },
  });
}

/** Canonical native-v1 deck used by external OOXML compatibility validators. */
export async function buildCanonicalPptxV1(): Promise<Uint8Array> {
  const rootId = id('canonical-root');
  const nestedGroupId = id('canonical-group');
  const familyId = id('canonical-font-family');
  const faceId = id('canonical-font-face');
  const imageAssetId = id('canonical-image');
  const digest = projectFormatV1.sha256DigestSchema.parse(`sha256:${'c'.repeat(64)}`);
  const text = projectFormatV1.createEmptyTextBody({
    paragraphId: id('canonical-paragraph'),
    runId: id('canonical-run'),
    fontFamilyId: familyId,
    fontFaceId: faceId,
    text: 'Canonical Broadset presentation',
    size: 18,
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('canonical-document'),
    name: 'Canonical PPTX',
    surface: { ...projectFormatV1.createDefaultSurface(), size: [320, 180], unit: 'px', dpi: 72 },
    elements: [
      projectFormatV1.createElementV1({
        id: rootId,
        name: 'Canonical root',
        geometry: geometry(320, 180, [0, 0]),
        kind: 'group',
      }),
      projectFormatV1.createElementV1({
        id: id('canonical-rectangle'),
        name: 'Rectangle',
        parentId: rootId,
        geometry: geometry(60, 40, [10, 10]),
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      }),
      projectFormatV1.createElementV1({
        id: id('canonical-ellipse'),
        name: 'Ellipse',
        parentId: rootId,
        geometry: geometry(50, 35, [80, 12]),
        kind: 'vector',
        geometryData: { kind: 'ellipse' },
      }),
      projectFormatV1.createElementV1({
        id: id('canonical-text'),
        name: 'Caption',
        parentId: rootId,
        geometry: geometry(180, 30, [10, 60]),
        kind: 'text',
        text,
      }),
      projectFormatV1.createElementV1({
        id: id('canonical-image-element'),
        name: 'Image',
        parentId: rootId,
        geometry: geometry(32, 32, [220, 20]),
        kind: 'image',
        image: { assetId: imageAssetId, fit: 'contain' },
      }),
      projectFormatV1.createElementV1({
        id: nestedGroupId,
        name: 'Nested group',
        parentId: rootId,
        geometry: geometry(100, 50, [10, 110]),
        kind: 'group',
      }),
      projectFormatV1.createElementV1({
        id: id('canonical-group-child'),
        name: 'Group child',
        parentId: nestedGroupId,
        geometry: geometry(40, 25, [15, 115]),
        kind: 'vector',
        geometryData: projectFormatV1.createRectangleGeometry(),
      }),
    ],
    pages: [1, 2, 3].map((index) =>
      projectFormatV1.createPageV1({
        id: id(`canonical-page-${String(index)}`),
        name: `Slide ${String(index)}`,
        rootInstances: [
          {
            id: id(`canonical-root-instance-${String(index)}`),
            elementId: rootId,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ),
  });
  const imageAsset: projectFormatV1.ImageAsset = {
    id: imageAssetId,
    kind: 'image',
    name: 'Canonical pixel',
    blob: {
      digest,
      byteLength: PNG_BYTES.byteLength,
      mediaType: 'image/png',
      source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
    },
    metadata: { pixelWidth: 1, pixelHeight: 1, orientation: 1, hasAlpha: true, bitDepth: 8, colorModel: 'rgb' },
  };
  const project = projectFormatV1.createProjectV1({
    documents: [document],
    resources: {
      assets: [imageAsset],
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

  return exportPptxBytesV1({ project, blobs: new Map([[digest, PNG_BYTES]]) });
}
