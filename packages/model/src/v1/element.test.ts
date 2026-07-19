import { describe, expect, it } from 'vitest';

import { elementSchema } from './element';

const appearance = { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] } as const;
const geometry = {
  bounds: { width: 100, height: 50 },
  transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
  origin: [0.5, 0.5, 0],
} as const;
const base = {
  id: 'element-a',
  name: 'Element',
  parentId: null,
  locked: false,
  hiddenInEditor: false,
  geometry,
  appearance,
  sharedStyleIds: [],
  extensions: [],
} as const;
const black = { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } as const;
const text = {
  paragraphs: [
    {
      id: 'paragraph-a',
      properties: {
        alignment: 'start',
        direction: 'auto',
        lineSpacing: { kind: 'absolute', value: 20 },
        spaceBefore: 0,
        spaceAfter: 0,
        firstLineIndent: 0,
        startIndent: 0,
        endIndent: 0,
        tabs: [],
        list: { kind: 'none' },
        hyphenation: 'none',
        keepTogether: false,
        keepWithNext: false,
        widowControl: true,
      },
      runs: [
        {
          id: 'run-a',
          text: 'Hello',
          properties: {
            fontFamilyId: 'font-a',
            fontFaceId: 'face-a',
            size: 16,
            color: black,
            weight: 400,
            variationAxes: [],
            openTypeFeatures: [],
            language: 'en',
            script: 'Latn',
            direction: 'ltr',
            decoration: { underline: false, strikeThrough: false, style: 'solid' },
            baselineShift: 0,
            tracking: 0,
            semanticRole: 'none',
          },
        },
      ],
    },
  ],
} as const;

function withBase(kind: string, payload: object): object {
  return { ...base, kind, ...payload };
}

const blob = {
  digest: `sha256:${'a'.repeat(64)}`,
  byteLength: 42,
  mediaType: 'application/octet-stream',
  source: { kind: 'missing', lastKnownName: 'source.bin' },
} as const;

describe('elementSchema', () => {
  it.each([
    [
      'text',
      { text, layout: { verticalAlignment: 'top', overflow: 'clip', autoSize: 'none', columns: 1, columnGap: 0 } },
    ],
    [
      'image',
      {
        image: { assetId: 'image-a', fit: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 }, focalPoint: [0.5, 0.5] },
      },
    ],
    ['vector', { geometryData: { kind: 'rectangle', cornerRadii: [0, 1, 2, 3] } }],
    ['group', { group: { clipChildren: true } }],
    [
      'component-instance',
      {
        componentId: 'component-a',
        propertyValues: [{ exposedPropertyId: 'property-a', value: { type: 'string', value: 'Hello' } }],
      },
    ],
    [
      'video',
      { video: { assetId: 'video-a', fit: 'contain', autoplay: true, loop: false, muted: true, controls: false } },
    ],
    ['audio', { audio: { assetId: 'audio-a', autoplay: false, loop: true, volume: 0.8 } }],
    ['clock', { clock: { format: 'HH:mm:ss', timeZone: 'Europe/Helsinki', locale: 'fi-FI' } }],
    [
      'ticker',
      {
        ticker: {
          items: [{ id: 'item-a', text: 'Breaking news' }],
          direction: 'left',
          speed: 20,
          gap: 12,
          repeat: true,
        },
      },
    ],
    ['qrcode', { qrcode: { value: 'https://example.com/', errorCorrection: 'M', quietZone: 4 } }],
    [
      'foreign',
      {
        foreign: {
          mediaType: 'image/svg+xml',
          sourceBlob: blob,
          previewAssetId: 'preview-a',
          safeRenderMode: 'sanitized-vector',
          reason: 'Unsupported SVG filter',
        },
      },
    ],
    [
      'plugin',
      {
        plugin: {
          pluginId: 'com.example.chart',
          elementType: 'bar-chart',
          schemaVersion: 2,
          payload: { values: [1, 2, 3] },
          previewAssetId: 'preview-a',
        },
      },
    ],
  ])('accepts the closed %s element variant', (_kind, payload) => {
    expect(elementSchema.safeParse(withBase(_kind, payload)).success).toBe(true);
  });

  it.each([
    { kind: 'ellipse' },
    {
      kind: 'path',
      fillRule: 'evenodd',
      path: {
        points: [{ id: 'point-a', x: 0, y: 0 }],
        segments: [{ id: 'segment-a', kind: 'move', pointId: 'point-a' }],
        closed: false,
      },
    },
    { kind: 'boolean', operation: 'union', operandIds: ['vector-a', 'vector-b'] },
  ])('accepts vector geometry $kind', (geometryData) => {
    expect(elementSchema.safeParse(withBase('vector', { geometryData })).success).toBe(true);
  });

  it.each([
    { id: 'segment-a', kind: 'move', pointId: 'point-a' },
    { id: 'segment-a', kind: 'line', pointId: 'point-a' },
    { id: 'segment-a', kind: 'quadratic', control: [5, 10], pointId: 'point-a' },
    { id: 'segment-a', kind: 'cubic', control1: [2, 3], control2: [7, 8], pointId: 'point-a' },
    { id: 'segment-a', kind: 'close' },
  ])('accepts and preserves structured path segment $kind', (segment) => {
    const value = withBase('vector', {
      geometryData: {
        kind: 'path',
        fillRule: 'nonzero',
        path: { points: [{ id: 'point-a', x: 10, y: 20 }], segments: [segment], closed: segment.kind === 'close' },
      },
    });

    expect(elementSchema.parse(value)).toEqual(value);
  });

  it.each([
    { id: 'segment-a', kind: 'arc', pointId: 'point-a', radius: [5, 5] },
    { id: 'segment-a', kind: 'move' },
    { id: 'segment-a', kind: 'quadratic', pointId: 'point-a' },
    { id: 'segment-a', kind: 'cubic', control1: [2], control2: [7, 8], pointId: 'point-a' },
    { id: 'segment-a', kind: 'close', pointId: 'point-a' },
  ])('rejects unknown or malformed structured path segment $kind', (segment) => {
    expect(
      elementSchema.safeParse(
        withBase('vector', {
          geometryData: {
            kind: 'path',
            fillRule: 'nonzero',
            path: { points: [{ id: 'point-a', x: 10, y: 20 }], segments: [segment], closed: false },
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts exact matrix3d and preserves affine skew and reflection', () => {
    const reflected = withBase('vector', {
      geometryData: { kind: 'ellipse' },
      geometry: { ...geometry, transform: { kind: 'affine2d', matrix: [-1, 0.25, 0.5, 1, 20, 30] } },
    });
    const parsed = elementSchema.parse(reflected);

    expect(parsed.geometry.transform).toEqual({ kind: 'affine2d', matrix: [-1, 0.25, 0.5, 1, 20, 30] });

    const matrix3d = Array.from({ length: 16 }, (_, index) =>
      index === 0 || index === 5 || index === 10 || index === 15 ? 1 : 0,
    );

    expect(
      elementSchema.safeParse(
        withBase('group', {
          group: { clipChildren: false },
          geometry: { ...geometry, transform: { kind: 'matrix3d', matrix: matrix3d } },
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    { matrix: [] },
    { matrix: [1, 0, 0, 1, 0] },
    { matrix: Array.from({ length: 15 }, () => 0) },
    { matrix: Array.from({ length: 17 }, () => 0) },
  ])('rejects malformed matrix $matrix', ({ matrix }) => {
    const kind = matrix.length < 10 ? 'affine2d' : 'matrix3d';

    expect(
      elementSchema.safeParse(
        withBase('group', { group: { clipChildren: false }, geometry: { ...geometry, transform: { kind, matrix } } }),
      ).success,
    ).toBe(false);
  });

  it.each([
    ['affine2d', Number.NaN],
    ['affine2d', Number.POSITIVE_INFINITY],
    ['affine2d', Number.NEGATIVE_INFINITY],
    ['matrix3d', Number.NaN],
    ['matrix3d', Number.POSITIVE_INFINITY],
    ['matrix3d', Number.NEGATIVE_INFINITY],
  ])('rejects %s matrix containing non-finite value %s', (kind, invalidValue) => {
    const length = kind === 'affine2d' ? 6 : 16;
    const matrix = Array.from({ length }, (_, index) => (index === 0 ? invalidValue : 0));

    expect(
      elementSchema.safeParse(
        withBase('group', {
          group: { clipChildren: false },
          geometry: { ...geometry, transform: { kind, matrix } },
        }),
      ).success,
    ).toBe(false);
  });

  it.each([
    ['content', 'https://example.com/image.png'],
    ['typeConfig', { loop: true }],
    ['groupId', 'selection-group'],
    ['customClipPath', 'polygon(0 0, 100% 0, 100% 100%)'],
  ])('rejects removed generic field %s', (key, value) => {
    expect(
      elementSchema.safeParse({
        ...withBase('text', {
          text,
          layout: { verticalAlignment: 'top', overflow: 'clip', autoSize: 'none', columns: 1, columnGap: 0 },
        }),
        [key]: value,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown kinds, unknown core fields, and persisted decomposition', () => {
    expect(elementSchema.safeParse(withBase('rectangle', {})).success).toBe(false);
    expect(elementSchema.safeParse(withBase('group', { group: { clipChildren: false }, arbitrary: {} })).success).toBe(
      false,
    );
    expect(
      elementSchema.safeParse(
        withBase('group', { group: { clipChildren: false }, geometry: { ...geometry, rotation: 45 } }),
      ).success,
    ).toBe(false);
  });

  it('requires complete foreign source and preview records', () => {
    const foreign = {
      mediaType: 'image/svg+xml',
      sourceBlob: blob,
      previewAssetId: 'preview-a',
      safeRenderMode: 'preview-only',
      reason: 'Unsupported content',
    };

    expect(
      elementSchema.safeParse(withBase('foreign', { foreign: { ...foreign, sourceBlob: undefined } })).success,
    ).toBe(false);
    expect(
      elementSchema.safeParse(withBase('foreign', { foreign: { ...foreign, previewAssetId: undefined } })).success,
    ).toBe(false);
    expect(
      elementSchema.safeParse(withBase('foreign', { foreign: { ...foreign, safeRenderMode: 'raw-html' } })).success,
    ).toBe(false);
  });

  it('requires a positive integer plugin schema version and inert JSON payload', () => {
    const plugin = { pluginId: 'com.example.chart', elementType: 'chart', schemaVersion: 1, payload: { safe: true } };

    expect(elementSchema.safeParse(withBase('plugin', { plugin })).success).toBe(true);
    expect(elementSchema.safeParse(withBase('plugin', { plugin: { ...plugin, schemaVersion: 0 } })).success).toBe(
      false,
    );
    expect(
      elementSchema.safeParse(withBase('plugin', { plugin: { ...plugin, payload: { callback: () => true } } })).success,
    ).toBe(false);
  });

  it('preserves nested inert plugin JSON exactly without dropping keys', () => {
    const payload = {
      title: '世界',
      enabled: true,
      nullable: null,
      series: [
        { id: 'series-a', values: [1, 2.5, -3], metadata: { source: 'import', visible: false } },
        ['nested', { empty: {}, values: [] }],
      ],
    };
    const value = withBase('plugin', {
      plugin: {
        pluginId: 'com.example.chart',
        elementType: 'chart',
        schemaVersion: 3,
        payload,
      },
    });
    const parsed = elementSchema.parse(value);

    expect(parsed).toEqual(value);
    expect(parsed.kind).toBe('plugin');

    if (parsed.kind === 'plugin') {
      expect(parsed.plugin.payload).toEqual(payload);
    }
  });
});
