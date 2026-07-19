import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  assetSchema,
  elementSchema,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';
import { createReviewComponent, createReviewGroup, createReviewTarget, parseReviewProject } from './semantic-review-fixtures';

const black = { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } as const;
const iccDigestCharacters: Readonly<Record<string, string>> = { working: 'a', output: 'b' };

function createRun(id: string, fontFamilyId: string, fontFaceId: string) {
  return {
    id,
    text: id,
    properties: {
      fontFamilyId, fontFaceId, size: 16, color: black, weight: 400,
      variationAxes: [], openTypeFeatures: [], language: 'en', script: 'Latn', direction: 'ltr',
      decoration: { underline: false, strikeThrough: false, style: 'solid' },
      baselineShift: 0, tracking: 0, semanticRole: 'none',
    },
  };
}

function createParagraph(id: string, runs: readonly object[]) {
  return {
    id,
    properties: {
      alignment: 'start', direction: 'auto', lineSpacing: { kind: 'normal' }, spaceBefore: 0, spaceAfter: 0,
      firstLineIndent: 0, startIndent: 0, endIndent: 0, tabs: [], list: { kind: 'none' }, hyphenation: 'none',
      keepTogether: false, keepWithNext: false, widowControl: true,
    },
    runs,
  };
}

function createTextElement(id: string, paragraphs: readonly object[]) {
  const base = createReviewGroup(id);

  if (base.kind !== 'group') throw new Error('Expected group fixture');

  const { group: _group, ...common } = base;

  return elementSchema.parse({
    ...common,
    kind: 'text',
    text: { paragraphs },
    layout: { verticalAlignment: 'top', overflow: 'clip', autoSize: 'none', columns: 1, columnGap: 0 },
  });
}

function createPathElement(id: string, points: readonly object[], segments: readonly object[]) {
  const base = createReviewGroup(id);

  if (base.kind !== 'group') throw new Error('Expected group fixture');

  const { group: _group, ...common } = base;

  return elementSchema.parse({
    ...common,
    kind: 'vector',
    geometryData: { kind: 'path', path: { points, segments, closed: false }, fillRule: 'nonzero' },
  });
}

function createFont(id: string, faceId: string) {
  return {
    id,
    familyName: id,
    fallbackFontIds: [],
    faces: [{ id: faceId, source: { kind: 'system', postScriptName: faceId }, weight: 400, style: 'normal', stretch: 100 }],
  };
}

function createIccAsset(id: string, profileClass: string, colorSpace: string) {
  const character = iccDigestCharacters[id] ?? 'c';

  return assetSchema.parse({
    id,
    kind: 'icc-profile',
    name: id,
    blob: {
      digest: sha256DigestSchema.parse(`sha256:${character.repeat(64)}`),
      byteLength: 1,
      mediaType: 'application/vnd.iccprofile',
      source: { kind: 'package', path: `blobs/sha256/${character.repeat(64)}` },
    },
    metadata: {
      profileClass,
      colorSpace,
      profileConnectionSpace: 'lab',
      description: id,
      identifier: id,
    },
  });
}

function createPrintProfile(iccAssetId: string) {
  return {
    id: 'print-profile', name: 'Print', kind: 'print',
    pageSize: { width: 210, height: 297, unit: 'mm' }, orientation: 'portrait',
    outputIntent: { iccAssetId, renderingIntent: 'relative-colorimetric', blackPointCompensation: true },
    bleed: { top: 0, right: 0, bottom: 0, left: 0 },
    trim: { top: 0, right: 0, bottom: 0, left: 0 },
    spotColorPolicy: 'preserve', overprintPolicy: 'preserve',
    pdf: { standard: 'pdf-x-4', conformance: 'strict' },
  };
}

function validateIccCase(
  { usage, profileClass, colorSpace, model }: {
    readonly usage: 'document-output' | 'print-output' | 'working';
    readonly profileClass: string;
    readonly colorSpace: string;
    readonly model: 'cmyk' | 'rgb';
  },
) {
  const project = createMinimalProjectV1();
  const document = project.documents[0];

  if (document === undefined) throw new Error('Expected fixture document');

  const profile = createIccAsset('profile', profileClass, colorSpace);
  let color: object = document.color;

  if (usage === 'working') color = { ...document.color, workingSpace: { kind: 'icc', iccProfileAssetId: profile.id, model } };
  if (usage === 'document-output') color = { ...document.color, outputIntent: { iccProfileAssetId: profile.id, renderingIntent: 'perceptual', blackPointCompensation: true } };

  const actual = parseReviewProject({
    ...project,
    resources: {
      ...project.resources,
      assets: [profile],
      outputProfiles: usage === 'print-output' ? [createPrintProfile(profile.id)] : [],
    },
    documents: [{ ...document, kind: usage === 'document-output' && model === 'cmyk' ? 'print' : 'static', color }],
  });

  return validateBroadsetProjectV1Semantics(actual);
}

describe('final semantic reference hardening', () => {
  it('validates text-run font families and face ownership in document and component scopes', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const documentText = createTextElement('document-text', [createParagraph('document-paragraph', [createRun('document-run', 'missing-family', 'face-a')])]);
    const componentText = createTextElement('component-text', [createParagraph('component-paragraph', [createRun('component-run', 'family-a', 'face-b')])]);
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [componentText], rootElementIds: [componentText.id],
      sequences: [], exposedProperties: [], extensions: [],
    });
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, fonts: [createFont('family-a', 'face-a'), createFont('family-b', 'face-b')] },
      documents: [{ ...document, elements: [documentText], components: [component] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/elements/0/text/paragraphs/0/runs/0/properties/fontFamilyId' }),
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/components/0/elements/0/text/paragraphs/0/runs/0/properties/fontFaceId' }),
    ]));
  });

  it('requires path segment endpoints to resolve uniquely in element and spatial interpolation paths', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const vector = createPathElement('vector', [{ id: 'point', x: 0, y: 0 }], [{ id: 'segment', kind: 'line', pointId: 'missing' }]);
    const targetElement = createReviewGroup('target');
    const path = {
      points: [{ id: 'duplicate', x: 0, y: 0 }, { id: 'duplicate', x: 1, y: 1 }],
      segments: [{ id: 'segment', kind: 'line', pointId: 'duplicate' }],
      closed: false,
    };
    const sequence = {
      id: 'sequence', name: 'Sequence', durationTicks: 10, loop: { kind: 'none' },
      tracks: [{
        id: 'track', name: 'Track', target: createReviewTarget(project, targetElement.id, '/geometry/origin'), valueType: 'point3d',
        keyframes: [
          { id: 'start', tick: 0, value: { type: 'point3d', value: [0, 0, 0] }, interpolation: { kind: 'spatial-path', path, orientToPath: false } },
          { id: 'end', tick: 10, value: { type: 'point3d', value: [1, 1, 0] } },
        ],
      }],
      markers: [], cues: [], childClips: [],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, elements: [vector, targetElement], sequences: [sequence] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'path.missing-point', pointer: '/documents/0/elements/0/geometryData/path/segments/0/pointId' }),
      expect.objectContaining({ code: 'path.ambiguous-point', pointer: '/documents/0/sequences/0/tracks/0/keyframes/0/interpolation/path/segments/0/pointId' }),
    ]));
  });

  it('rejects duplicate nested IDs across each resolver-addressable element scope', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const firstText = createTextElement('text-a', [createParagraph('paragraph', [createRun('run', 'family', 'face')])]);
    const secondText = createTextElement('text-b', [createParagraph('paragraph', [createRun('run', 'family', 'face')])]);
    const firstPath = createPathElement('path-a', [{ id: 'point', x: 0, y: 0 }], []);
    const secondPath = createPathElement('path-b', [{ id: 'point', x: 1, y: 1 }], []);
    const gradient = (stopId: string) => ({
      kind: 'gradient', gradient: {
        kind: 'linear', start: [0, 0], end: [1, 1],
        stops: [{ id: stopId, color: black, opacity: 1, offset: 0 }],
        coordinateSpace: 'object-bounds', transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
        spread: 'pad', interpolation: 'srgb',
      },
    });
    const createStyledGroup = (id: string, stopInStroke: boolean) => {
      const group = createReviewGroup(id);
      const solid = { kind: 'solid', color: black };
      const fill = { id: 'fill', enabled: true, opacity: 1, blendMode: 'normal', paint: stopInStroke ? solid : gradient('stop') };
      const stroke = {
        id: 'stroke', enabled: true, opacity: 1, blendMode: 'normal', paint: stopInStroke ? gradient('stop') : solid,
        width: 1, alignment: 'center', cap: 'butt', join: 'miter', miterLimit: 4, dash: [], dashOffset: 0,
      };
      const effect = { id: 'effect', enabled: true, opacity: 1, blendMode: 'normal', kind: 'blur', radius: 1 };

      return elementSchema.parse({ ...group, appearance: { ...group.appearance, fills: [fill], strokes: [stroke], effects: [effect] } });
    };
    const firstStyled = createStyledGroup('styled-a', false);
    const secondStyled = createStyledGroup('styled-b', true);
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, fonts: [createFont('family', 'face')] },
      documents: [{ ...document, elements: [firstText, secondText, firstPath, secondPath, firstStyled, secondStyled] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/1/text/paragraphs/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/1/text/paragraphs/0/runs/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/3/geometryData/path/points/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/5/appearance/fills/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/5/appearance/strokes/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/5/appearance/effects/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/elements/5/appearance/strokes/0/paint/gradient/stops/0/id' }),
    ]));
  });

  it('uses exact fills and strokes pointers for swatch diagnostics', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const base = createReviewGroup('element');
    const missingColor = { kind: 'swatch', swatchId: 'missing' };
    const transform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] };
    const fill = { id: 'fill', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'solid', color: missingColor } };
    const stroke = {
      id: 'stroke', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'gradient', gradient: {
        kind: 'linear', start: [0, 0], end: [1, 1], stops: [{ id: 'stop', color: missingColor, opacity: 1, offset: 0 }],
        coordinateSpace: 'object-bounds', transform, spread: 'pad', interpolation: 'srgb',
      } }, width: 1, alignment: 'center', cap: 'butt', join: 'miter', miterLimit: 4, dash: [], dashOffset: 0,
    };
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, elements: [{ ...base, appearance: { ...base.appearance, fills: [fill], strokes: [stroke] } }] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/elements/0/appearance/fills/0/paint/color/swatchId' }),
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/elements/0/appearance/strokes/0/paint/gradient/stops/0/color/swatchId' }),
    ]));
  });

  it('rejects duplicate nested IDs across component element scopes', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const firstText = createTextElement('component-text-a', [createParagraph('component-paragraph', [createRun('component-run', 'family', 'face')])]);
    const secondText = createTextElement('component-text-b', [createParagraph('component-paragraph', [createRun('component-run', 'family', 'face')])]);
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [firstText, secondText], rootElementIds: [firstText.id, secondText.id],
      sequences: [], exposedProperties: [], extensions: [],
    });
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, fonts: [createFont('family', 'face')] },
      documents: [{ ...document, components: [component] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/components/0/elements/1/text/paragraphs/0/id' }),
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/components/0/elements/1/text/paragraphs/0/runs/0/id' }),
    ]));
  });

  it('enforces ICC class and color-space suitability for working and output profiles', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const working = createIccAsset('working', 'abstract', 'RGB ');
    const output = createIccAsset('output', 'output', 'CMYK');
    const invalidPrint = createIccAsset('invalid-print', 'display', 'RGB ');
    const actual = parseReviewProject({
      ...project,
      resources: {
        ...project.resources,
        assets: [working, output, invalidPrint],
        outputProfiles: [createPrintProfile('invalid-print')],
      },
      documents: [{
        ...document,
        kind: 'static',
        color: {
          ...document.color,
          workingSpace: { kind: 'icc', iccProfileAssetId: 'working', model: 'cmyk' },
          outputIntent: { iccProfileAssetId: 'output', renderingIntent: 'perceptual', blackPointCompensation: true },
        },
      }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'color.incompatible-profile', pointer: '/documents/0/color/workingSpace/iccProfileAssetId' }),
      expect.objectContaining({ code: 'color.incompatible-profile', pointer: '/documents/0/color/outputIntent/iccProfileAssetId' }),
      expect.objectContaining({ code: 'output.incompatible-icc-profile', pointer: '/resources/outputProfiles/0/outputIntent/iccAssetId' }),
    ]));
  });

  it.each([
    ['working class', 'working', 'abstract', 'RGB ', 'rgb', 'color.incompatible-profile', '/documents/0/color/workingSpace/iccProfileAssetId'],
    ['working model', 'working', 'display', 'RGB ', 'cmyk', 'color.incompatible-profile', '/documents/0/color/workingSpace/iccProfileAssetId'],
    ['document-output class', 'document-output', 'display', 'RGB ', 'rgb', 'color.incompatible-profile', '/documents/0/color/outputIntent/iccProfileAssetId'],
    ['document-output model', 'document-output', 'output', 'CMYK', 'rgb', 'color.incompatible-profile', '/documents/0/color/outputIntent/iccProfileAssetId'],
    ['print-output class', 'print-output', 'display', 'CMYK', 'cmyk', 'output.incompatible-icc-profile', '/resources/outputProfiles/0/outputIntent/iccAssetId'],
    ['print-output model', 'print-output', 'output', 'RGB ', 'cmyk', 'output.incompatible-icc-profile', '/resources/outputProfiles/0/outputIntent/iccAssetId'],
  ] as const)('rejects incompatible ICC %s', (_name, usage, profileClass, colorSpace, model, code, pointer) => {
    expect(validateIccCase({ usage, profileClass, colorSpace, model })).toContainEqual(
      expect.objectContaining({ code, pointer }),
    );
  });

  it.each([
    ['working', 'display', 'RGB ', 'rgb'],
    ['document-output', 'output', 'RGB ', 'rgb'],
    ['document-output', 'output', 'CMYK', 'cmyk'],
    ['print-output', 'output', 'CMYK', 'cmyk'],
  ] as const)('accepts compatible ICC %s profiles', (usage, profileClass, colorSpace, model) => {
    const incompatibleCode = usage === 'print-output' ? 'output.incompatible-icc-profile' : 'color.incompatible-profile';

    expect(validateIccCase({ usage, profileClass, colorSpace, model })).not.toContainEqual(
      expect.objectContaining({ code: incompatibleCode }),
    );
  });
});
