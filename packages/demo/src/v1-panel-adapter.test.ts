import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { toPanelElementV1 } from './v1-panel-adapter';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

describe('toPanelElementV1', () => {
  it('projects canonical vector geometry and appearance into property-panel fields', () => {
    const element = projectFormatV1.createElementV1({
      id: id('rectangle'),
      name: 'Rectangle',
      kind: 'vector',
      locked: true,
      geometry: projectFormatV1.createElementGeometry({
        width: 240,
        height: 120,
        transform: { kind: 'affine2d', matrix: [0, 1, -1, 0, 12, 18] },
      }),
      geometryData: projectFormatV1.createRectangleGeometry([4, 8, 12, 16]),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        opacity: 0.75,
        fills: [
          {
            id: id('fill'),
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: projectFormatV1.createBlackColorValue() },
          },
        ],
      },
    });
    const project = projectFormatV1.createProjectV1({
      documents: [projectFormatV1.createDocumentV1({ id: id('document'), elements: [element] })],
    });

    const panel = toPanelElementV1({ project, element });

    expect(panel).toMatchObject({
      id: element.id,
      type: 'rectangle',
      name: 'Rectangle',
      locked: true,
      x: 12,
      y: 18,
      width: 240,
      height: 120,
      rotation: 90,
      backgroundColor: 'color(srgb 0 0 0)',
      borderRadius: [4, 8, 12, 16],
      opacity: 0.75,
    });
  });

  it('projects structured text and typography from the first run', () => {
    const fontFamilyId = id('font-family');
    const fontFaceId = id('font-face');
    const element = projectFormatV1.createElementV1({
      id: id('text'),
      name: 'Text',
      kind: 'text',
      geometry: projectFormatV1.createElementGeometry({ width: 200, height: 40 }),
      text: projectFormatV1.createEmptyTextBody({
        paragraphId: id('paragraph'),
        runId: id('run'),
        fontFamilyId,
        fontFaceId,
        text: 'Canonical text',
        size: 32,
        weight: 700,
      }),
    });
    const project = projectFormatV1.createProjectV1({
      documents: [projectFormatV1.createDocumentV1({ id: id('document'), elements: [element] })],
      resources: {
        assets: [],
        fonts: [
          {
            id: fontFamilyId,
            familyName: 'Inter',
            fallbackFontIds: [],
            faces: [
              {
                id: fontFaceId,
                source: { kind: 'system', postScriptName: 'Inter' },
                weight: 700,
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

    expect(toPanelElementV1({ project, element })).toMatchObject({
      type: 'text',
      content: 'Canonical text',
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 700,
      verticalAlignment: 'top',
    });
  });
});
