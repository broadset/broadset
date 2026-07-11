import { describe, expect, it } from 'vitest';

import {
  assetSchema,
  blobReferenceSchema,
  fontFamilyResourceSchema,
  sharedStyleSchema,
  swatchSchema,
  variableCollectionSchema,
} from './index';

const DIGEST_HEX = 'a'.repeat(64);
const DIGEST = `sha256:${DIGEST_HEX}`;
const blob = {
  digest: DIGEST,
  byteLength: 128,
  mediaType: 'application/octet-stream',
  source: { kind: 'package', path: `blobs/sha256/${DIGEST_HEX}` },
};
const assetBase = { id: 'asset', name: 'Asset', blob };

const assets = [
  {
    ...assetBase,
    kind: 'image',
    metadata: {
      pixelWidth: 1920,
      pixelHeight: 1080,
      orientation: 1,
      hasAlpha: true,
      bitDepth: 16,
      colorModel: 'rgb',
      iccProfileAssetId: 'profile',
    },
  },
  {
    ...assetBase,
    kind: 'video',
    metadata: {
      pixelWidth: 1920,
      pixelHeight: 1080,
      frameRate: { numerator: 30000, denominator: 1001 },
      durationTicks: 90_000,
      videoCodec: 'avc1',
      hasAlpha: false,
      audioTracks: [{ id: 'main', codec: 'aac', sampleRate: 48_000, channelCount: 2, language: 'en' }],
    },
  },
  {
    ...assetBase,
    kind: 'audio',
    metadata: { durationTicks: 90_000, sampleRate: 48_000, channelCount: 2, channelLayout: 'stereo', codec: 'pcm' },
  },
  {
    ...assetBase,
    kind: 'font',
    metadata: {
      format: 'opentype',
      postScriptName: 'Example-Regular',
      family: 'Example',
      weight: 400,
      style: 'normal',
      stretch: 100,
      variableAxes: [{ id: 'weight', tag: 'wght', minimum: 100, defaultValue: 400, maximum: 900 }],
      unicodeCoverage: [{ id: 'latin', start: 0x20, end: 0x7e }],
      embeddingPermissions: 'installable',
    },
  },
  {
    ...assetBase,
    kind: 'icc-profile',
    metadata: {
      profileClass: 'display',
      colorSpace: 'RGB ',
      profileConnectionSpace: 'xyz',
      description: 'Display P3',
      identifier: 'display-p3',
    },
  },
  {
    ...assetBase,
    kind: 'data',
    metadata: {
      encoding: 'utf-8',
      schemaUri: 'https://example.com/data.schema.json',
      recordShape: {
        kind: 'records',
        fields: [{ id: 'headline', name: 'Headline', valueType: 'string', nullable: false }],
      },
    },
  },
  {
    ...assetBase,
    kind: 'vector',
    metadata: { intrinsicBounds: { x: 0, y: 0, width: 100, height: 50 }, safePreviewAssetId: 'preview' },
  },
  {
    ...assetBase,
    kind: 'foreign',
    metadata: { intrinsicBounds: { x: -10, y: -20, width: 100, height: 50 }, safePreviewAssetId: 'preview' },
  },
] as const;

describe('v1 blob references', () => {
  it('accepts package, HTTPS external, and explicitly missing sources', () => {
    expect(blobReferenceSchema.parse(blob)).toEqual(blob);
    expect(
      blobReferenceSchema.safeParse({
        digest: DIGEST,
        byteLength: 128,
        mediaType: 'image/png',
        source: { kind: 'external', url: 'https://example.com/image.png', integrity: DIGEST, cachedDigest: DIGEST },
      }).success,
    ).toBe(true);
    expect(
      blobReferenceSchema.safeParse({
        digest: DIGEST,
        byteLength: 128,
        mediaType: 'image/png',
        source: { kind: 'external', url: 'HTTPS://example.com/image.png', integrity: DIGEST },
      }).success,
    ).toBe(true);
    expect(
      blobReferenceSchema.safeParse({
        digest: DIGEST,
        byteLength: 128,
        mediaType: 'image/png',
        source: { kind: 'missing', lastKnownName: 'image.png' },
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ ...blob, source: { kind: 'package', path: `blobs/sha256/${'b'.repeat(64)}` } }, true],
    [{ ...blob, source: { kind: 'package', path: `../blobs/sha256/${DIGEST_HEX}` } }, false],
    [{ ...blob, source: { kind: 'package', path: `/blobs/sha256/${DIGEST_HEX}` } }, false],
    [{ ...blob, source: { kind: 'package', path: `blobs\\sha256\\${DIGEST_HEX}` } }, false],
    [{ ...blob, source: { kind: 'external', url: 'http://example.com/image.png', integrity: DIGEST } }, false],
    [{ ...blob, source: { kind: 'external', url: 'data:image/png;base64,AA==', integrity: DIGEST } }, false],
    [{
      ...blob,
      source: { kind: 'external', url: 'https://example.com/image.png', integrity: `sha256:${'b'.repeat(64)}` },
    }, true],
    [{ ...blob, byteLength: Number.MAX_SAFE_INTEGER + 1 }, false],
    [{ ...blob, mediaType: '' }, false],
    [{ ...blob, unknown: true }, false],
  ])('applies structural ownership to blob reference %#', (value, structurallyValid) => {
    expect(blobReferenceSchema.safeParse(value).success).toBe(structurallyValid);
  });
});

describe('v1 assets', () => {
  it.each(assets)('accepts $kind asset metadata', (asset) => {
    expect(assetSchema.parse(asset)).toEqual(asset);
  });

  it('accepts strict provenance, license, and derivative records', () => {
    const asset = {
      ...assets[0],
      provenance: {
        kind: 'imported',
        sourceName: 'source.png',
        sourceUri: 'file:///source.png',
        importer: 'Broadset PNG',
        importedAt: '2026-07-10T12:00:00Z',
      },
      license: {
        name: 'Example License',
        spdxIdentifier: 'CC-BY-4.0',
        url: 'https://example.com/license',
        attribution: 'Example Studio',
        permissions: { embedding: true, modification: true, redistribution: true },
      },
      derivatives: [{ id: 'preview', role: 'preview', name: 'Preview', blob }],
    };

    expect(assetSchema.parse(asset)).toEqual(asset);
  });

  it('accepts created provenance and every closed data record shape', () => {
    expect(
      assetSchema.safeParse({
        ...assets[0],
        provenance: { kind: 'created', application: 'Broadset', createdAt: '2026-07-10T12:00:00Z' },
      }).success,
    ).toBe(true);
    expect(
      assetSchema.safeParse({ ...assets[5], metadata: { ...assets[5].metadata, recordShape: { kind: 'opaque' } } })
        .success,
    ).toBe(true);
    expect(
      assetSchema.safeParse({
        ...assets[5],
        metadata: {
          ...assets[5].metadata,
          recordShape: {
            kind: 'tabular',
            fields: [{ id: 'headline', name: 'Headline', valueType: 'string', nullable: false }],
          },
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ ...assets[0], metadata: { ...assets[0].metadata, pixelWidth: 0 } }, false],
    [{ ...assets[1], metadata: { ...assets[1].metadata, frameRate: { numerator: 60, denominator: 2 } } }, true],
    [{
      ...assets[1],
      metadata: {
        ...assets[1].metadata,
        audioTracks: [assets[1].metadata.audioTracks[0], assets[1].metadata.audioTracks[0]],
      },
    }, true],
    [{
      ...assets[3],
      metadata: {
        ...assets[3].metadata,
        variableAxes: [{ id: 'weight', tag: 'wght', minimum: 500, defaultValue: 400, maximum: 900 }],
      },
    }, true],
    [{ ...assets[6], metadata: { ...assets[6].metadata, intrinsicBounds: { x: 0, y: 0, width: 0, height: 1 } } }, false],
    [{ ...assets[0], metadata: { ...assets[0].metadata, unknown: true } }, false],
    [{ ...assets[0], unknown: true }, false],
  ])('applies structural ownership to asset %#', (asset, structurallyValid) => {
    expect(assetSchema.safeParse(asset).success).toBe(structurallyValid);
  });
});

describe('v1 reusable resources', () => {
  it('distinguishes asset-backed and system-only font faces', () => {
    const font = {
      id: 'font-family',
      familyName: 'Example',
      fallbackFontIds: ['fallback'],
      faces: [
        {
          id: 'regular',
          source: { kind: 'asset', assetId: 'font-asset' },
          weight: 400,
          style: 'normal',
          stretch: 100,
          axes: { wght: 400 },
        },
        {
          id: 'system',
          source: { kind: 'system', postScriptName: 'Helvetica' },
          weight: 400,
          style: 'normal',
          stretch: 100,
        },
      ],
    };

    expect(fontFamilyResourceSchema.parse(font)).toEqual(font);
    expect(
      fontFamilyResourceSchema.safeParse({
        ...font,
        faces: [
          {
            id: 'system',
            source: { kind: 'system', postScriptName: 'Helvetica', assetId: 'pretend-bytes' },
            weight: 400,
            style: 'normal',
            stretch: 100,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts process and spot swatches while keeping spot identity distinct', () => {
    const alias = { id: 'office-accent', producer: 'PowerPoint', name: 'accent1' };

    expect(
      swatchSchema.safeParse({
        id: 'brand-blue',
        kind: 'process',
        name: 'Brand Blue',
        color: { kind: 'color', space: 'display-p3', channels: [0, 0.2, 0.8], alpha: 1 },
        producerAliases: [alias],
      }).success,
    ).toBe(true);
    expect(
      swatchSchema.safeParse({
        id: 'spot-blue',
        kind: 'spot',
        name: 'Spot Blue',
        inkName: 'PANTONE 300 C',
        alternateColor: { kind: 'color', space: 'cmyk', channels: [1, 0.44, 0, 0], alpha: 1 },
        tintBehavior: 'linear',
        producerAliases: [alias],
      }).success,
    ).toBe(true);
  });

  it('requires complete type-compatible variable mode values', () => {
    const collection = {
      id: 'theme',
      name: 'Theme',
      modes: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
      defaultModeId: 'light',
      variables: [
        {
          id: 'headline',
          name: 'Headline',
          valueType: 'string',
          valuesByMode: {
            light: { type: 'string', value: 'Light headline' },
            dark: { type: 'string', value: 'Dark headline' },
          },
        },
      ],
    };

    expect(variableCollectionSchema.parse(collection)).toEqual(collection);
    expect(
      variableCollectionSchema.safeParse({
        ...collection,
        variables: [{ ...collection.variables[0], valuesByMode: { light: { type: 'string', value: 'Only one' } } }],
      }).success,
    ).toBe(true);
    expect(
      variableCollectionSchema.safeParse({
        ...collection,
        variables: [
          {
            ...collection.variables[0],
            valuesByMode: {
              light: { type: 'number', value: 1 },
              dark: { type: 'string', value: 'Dark headline' },
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      variableCollectionSchema.safeParse({
        id: 'variables',
        name: 'Variables',
        modes: [
          { id: 'mode', name: 'First' },
          { id: 'mode', name: 'Second' },
        ],
        defaultModeId: 'mode',
        variables: [
          {
            id: 'value',
            name: 'First',
            valueType: 'number',
            valuesByMode: { mode: { type: 'number', value: 1 } },
          },
          {
            id: 'value',
            name: 'Second',
            valueType: 'number',
            valuesByMode: { mode: { type: 'number', value: 2 } },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('accepts closed shared-style properties and aliases', () => {
    const properties = {
      id: 'appearance-style',
      name: 'Card',
      kind: 'appearance',
      source: {
        kind: 'properties',
        inheritedStyleId: 'base-card',
        entries: [{ id: 'opacity', pointer: '/opacity', value: { type: 'number', value: 0.8 } }],
      },
    };

    expect(sharedStyleSchema.parse(properties)).toEqual(properties);
    expect(
      sharedStyleSchema.safeParse({
        id: 'alias',
        name: 'Alias',
        kind: 'appearance',
        source: { kind: 'alias', styleId: 'base' },
      }).success,
    ).toBe(true);
    expect(
      sharedStyleSchema.safeParse({ ...properties, source: { ...properties.source, values: { opacity: 0.8 } } })
        .success,
    ).toBe(false);
  });

  it('rejects duplicate local resource IDs', () => {
    const face = {
      id: 'regular',
      source: { kind: 'system', postScriptName: 'Helvetica' },
      weight: 400,
      style: 'normal',
      stretch: 100,
    };

    expect(
      fontFamilyResourceSchema.safeParse({
        id: 'font',
        familyName: 'Example',
        fallbackFontIds: ['fallback', 'fallback'],
        faces: [face, face],
      }).success,
    ).toBe(false);
    expect(
      swatchSchema.safeParse({
        id: 'blue',
        kind: 'process',
        name: 'Blue',
        color: { kind: 'color', space: 'srgb', channels: [0, 0, 1], alpha: 1 },
        producerAliases: [
          { id: 'alias', producer: 'A', name: 'blue' },
          { id: 'alias', producer: 'B', name: 'blue' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate IDs in every nested asset and style scope', () => {
    expect(
      assetSchema.safeParse({
        ...assets[0],
        derivatives: [
          { id: 'preview', role: 'preview', name: 'Preview', blob },
          { id: 'preview', role: 'proxy', name: 'Proxy', blob },
        ],
      }).success,
    ).toBe(true);
    expect(
      assetSchema.safeParse({
        ...assets[3],
        metadata: {
          ...assets[3].metadata,
          unicodeCoverage: [
            { id: 'latin', start: 0x20, end: 0x7e },
            { id: 'latin', start: 0xa0, end: 0xff },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      assetSchema.safeParse({
        ...assets[5],
        metadata: {
          ...assets[5].metadata,
          recordShape: {
            kind: 'records',
            fields: [
              { id: 'field', name: 'First', valueType: 'string', nullable: false },
              { id: 'field', name: 'Second', valueType: 'number', nullable: false },
            ],
          },
        },
      }).success,
    ).toBe(true);
    expect(
      sharedStyleSchema.safeParse({
        id: 'style',
        name: 'Style',
        kind: 'text',
        source: {
          kind: 'properties',
          entries: [
            { id: 'entry', pointer: '/size', value: { type: 'number', value: 12 } },
            { id: 'entry', pointer: '/weight', value: { type: 'integer', value: 400 } },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('reports duplicate asset-local IDs at their exact collection paths', () => {
    const derivativeResult = assetSchema.safeParse({
      ...assets[0],
      derivatives: [
        { id: 'preview', role: 'preview', name: 'Preview', blob },
        { id: 'preview', role: 'proxy', name: 'Proxy', blob },
      ],
    });
    const audioTrackResult = assetSchema.safeParse({
      ...assets[1],
      metadata: {
        ...assets[1].metadata,
        audioTracks: [assets[1].metadata.audioTracks[0], assets[1].metadata.audioTracks[0]],
      },
    });

    expect(derivativeResult.success).toBe(true);
    expect(audioTrackResult.success).toBe(true);
  });
});
