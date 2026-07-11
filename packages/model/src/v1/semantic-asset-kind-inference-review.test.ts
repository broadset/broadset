import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  assetSchema,
  elementSchema,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';
import { createReviewGroup, createReviewTarget, parseReviewProject } from './semantic-review-fixtures';

type MediaKind = 'image' | 'video' | 'audio';

const digestCharacters = { image: 'a', video: 'b', audio: 'c', data: 'd' } as const;
const mediaTypes = { image: 'image/png', video: 'video/mp4', audio: 'audio/aac', data: 'application/octet-stream' } as const;

function createAsset(kind: MediaKind | 'data') {
  const character = digestCharacters[kind];
  const common = {
    id: kind,
    kind,
    name: kind,
    blob: {
      digest: sha256DigestSchema.parse(`sha256:${character.repeat(64)}`),
      byteLength: 1,
      mediaType: mediaTypes[kind],
      source: { kind: 'package', path: `blobs/sha256/${character.repeat(64)}` },
    },
  };

  if (kind === 'image') return assetSchema.parse({
    ...common,
    metadata: { pixelWidth: 1, pixelHeight: 1, orientation: 1, hasAlpha: true, bitDepth: 8, colorModel: 'rgb' },
  });
  if (kind === 'video') return assetSchema.parse({
    ...common,
    metadata: { pixelWidth: 1, pixelHeight: 1, frameRate: { numerator: 25, denominator: 1 }, durationTicks: 1, videoCodec: 'h264', hasAlpha: false, audioTracks: [] },
  });
  if (kind === 'audio') return assetSchema.parse({
    ...common,
    metadata: { durationTicks: 1, sampleRate: 48_000, channelCount: 2, channelLayout: 'stereo', codec: 'aac' },
  });

  return assetSchema.parse({ ...common, metadata: { encoding: 'binary', recordShape: { kind: 'opaque' } } });
}

function createMediaElement(kind: MediaKind) {
  const base = createReviewGroup(`${kind}-element`);

  if (base.kind !== 'group') throw new Error('Expected group fixture');

  const { group: _group, ...common } = base;

  if (kind === 'image') return elementSchema.parse({ ...common, kind, image: { assetId: kind, fit: 'contain' } });
  if (kind === 'video') return elementSchema.parse({
    ...common, kind, video: { assetId: kind, fit: 'contain', autoplay: false, loop: false, muted: false, controls: true },
  });

  return elementSchema.parse({ ...common, kind, audio: { assetId: kind, autoplay: false, loop: false, volume: 1 } });
}

const assetValue = (assetId: string) => ({ type: 'asset' as const, assetId });
const literalAsset = (assetId: string) => ({ kind: 'literal' as const, value: assetValue(assetId) });

function bindingDiagnostics(
  expression: unknown,
  fields: readonly unknown[] = [],
  targetKind: MediaKind = 'image',
  variables: readonly unknown[] = [],
) {
  const project = createMinimalProjectV1();
  const document = project.documents[0];

  if (document === undefined) throw new Error('Expected fixture document');

  const element = createMediaElement(targetKind);
  const pointer = `/${targetKind}/assetId`;
  const actual = parseReviewProject({
    ...project,
    resources: {
      ...project.resources,
      assets: [createAsset('image'), createAsset('video'), createAsset('audio'), createAsset('data')],
      variables,
    },
    documents: [{
      ...document,
      elements: [element],
      viewModels: fields.length === 0 ? [] : [{ id: 'view', name: 'View', fields, sampleDataSets: [] }],
      bindings: [{ id: 'binding', target: createReviewTarget(project, element.id, pointer), expression }],
    }],
  });

  return validateBroadsetProjectV1Semantics(actual);
}

function expectCompatible(diagnostics: ReturnType<typeof bindingDiagnostics>) {
  expect(diagnostics).not.toContainEqual(expect.objectContaining({ code: 'binding.incompatible-result' }));
}

function expectIncompatible(diagnostics: ReturnType<typeof bindingDiagnostics>) {
  expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'binding.incompatible-result' }));
}

describe('binding asset-kind inference', () => {
  it.each(['image', 'video', 'audio'] as const)('rejects an unrestricted live asset field for a restricted %s target', (kind) => {
    expectIncompatible(bindingDiagnostics(
      { kind: 'field', viewModelId: 'view', fieldId: 'media' },
      [{ id: 'media', name: 'Media', schema: { kind: 'asset' } }],
      kind,
    ));
  });

  it('accepts an allowed field subset and rejects a kind outside the target contract', () => {
    expectCompatible(bindingDiagnostics(
      { kind: 'field', viewModelId: 'view', fieldId: 'media' },
      [{ id: 'media', name: 'Media', schema: { kind: 'asset', acceptedAssetKinds: ['image'] } }],
    ));
    expectIncompatible(bindingDiagnostics(
      { kind: 'field', viewModelId: 'view', fieldId: 'media' },
      [{ id: 'media', name: 'Media', schema: { kind: 'asset', acceptedAssetKinds: ['data'] } }],
    ));
  });

  it('proves get and index results from schemas and typed literals', () => {
    const objectSchema = (kind: 'image' | 'data') => ({
      id: 'object', name: 'Object',
      schema: { kind: 'object', fields: [{ id: 'media', name: 'Media', required: true, schema: { kind: 'asset', acceptedAssetKinds: [kind] } }] },
    });
    const arraySchema = (kind: 'image' | 'data') => ({
      id: 'array', name: 'Array', schema: { kind: 'array', items: { kind: 'asset', acceptedAssetKinds: [kind] } },
    });
    const getField = { kind: 'get', source: { kind: 'field', viewModelId: 'view', fieldId: 'object' }, fieldId: 'media' };
    const indexField = { kind: 'index', source: { kind: 'field', viewModelId: 'view', fieldId: 'array' }, index: { kind: 'literal', value: { type: 'integer', value: 0 } } };
    const getLiteral = (assetId: string) => ({ kind: 'get', source: { kind: 'literal', value: { type: 'object', fields: { media: assetValue(assetId) } } }, fieldId: 'media' });
    const indexLiteral = (assetId: string) => ({ kind: 'index', source: { kind: 'literal', value: { type: 'list', items: [assetValue(assetId)] } }, index: { kind: 'literal', value: { type: 'integer', value: 0 } } });

    expectCompatible(bindingDiagnostics(getField, [objectSchema('image')]));
    expectIncompatible(bindingDiagnostics(getField, [objectSchema('data')]));
    expectCompatible(bindingDiagnostics(indexField, [arraySchema('image')]));
    expectIncompatible(bindingDiagnostics(indexField, [arraySchema('data')]));
    expectCompatible(bindingDiagnostics(getLiteral('image')));
    expectIncompatible(bindingDiagnostics(getLiteral('data')));
    expectCompatible(bindingDiagnostics(indexLiteral('image')));
    expectIncompatible(bindingDiagnostics(indexLiteral('data')));
  });

  it('unions conditional and coalesce branches and rejects any mixed possibility', () => {
    const conditional = (secondAssetId: string) => ({
      kind: 'conditional',
      condition: { kind: 'literal', value: { type: 'boolean', value: true } },
      whenTrue: literalAsset('image'),
      whenFalse: literalAsset(secondAssetId),
    });
    const coalesce = (secondAssetId: string) => ({
      kind: 'safe-function', functionId: 'coalesce', arguments: [literalAsset('image'), literalAsset(secondAssetId)],
    });

    expectCompatible(bindingDiagnostics(conditional('image')));
    expectIncompatible(bindingDiagnostics(conditional('data')));
    expectCompatible(bindingDiagnostics(coalesce('image')));
    expectIncompatible(bindingDiagnostics(coalesce('data')));
  });

  it('unions dynamic literal-array indexes and variable modes and aliases', () => {
    const indexExpression = (items: readonly string[]) => ({
      kind: 'index',
      source: { kind: 'literal', value: { type: 'list', items: items.map(assetValue) } },
      index: { kind: 'field', viewModelId: 'view', fieldId: 'index' },
    });
    const indexField = [{ id: 'index', name: 'Index', schema: { kind: 'integer' } }];
    const variables = [{
      id: 'media', name: 'Media', modes: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }], defaultModeId: 'first',
      variables: [
        { id: 'image', name: 'Image', valueType: 'asset', valuesByMode: { first: assetValue('image'), second: assetValue('image') } },
        { id: 'mixed', name: 'Mixed', valueType: 'asset', valuesByMode: { first: assetValue('image'), second: assetValue('data') }, aliasOf: { collectionId: 'media', variableId: 'image' } },
        { id: 'data', name: 'Data', valueType: 'asset', valuesByMode: { first: assetValue('data'), second: assetValue('data') } },
        { id: 'alias', name: 'Alias', valueType: 'asset', valuesByMode: { first: assetValue('image'), second: assetValue('image') }, aliasOf: { collectionId: 'media', variableId: 'data' } },
      ],
    }];

    expectCompatible(bindingDiagnostics(indexExpression(['image', 'image']), indexField));
    expectIncompatible(bindingDiagnostics(indexExpression(['image', 'data']), indexField));
    expectCompatible(bindingDiagnostics({ kind: 'variable', collectionId: 'media', variableId: 'image' }, [], 'image', variables));
    expectIncompatible(bindingDiagnostics({ kind: 'variable', collectionId: 'media', variableId: 'mixed' }, [], 'image', variables));
    expectIncompatible(bindingDiagnostics({ kind: 'variable', collectionId: 'media', variableId: 'alias' }, [], 'image', variables));
  });
});
