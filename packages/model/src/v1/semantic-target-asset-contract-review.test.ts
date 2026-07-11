import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  assetSchema,
  elementSchema,
  resolvePropertyTargetContract,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';
import { createReviewComponent, createReviewGroup, createReviewTarget, parseReviewProject } from './semantic-review-fixtures';

function createAsset(id: string, kind: 'image' | 'data') {
  const blob = {
    digest: sha256DigestSchema.parse(`sha256:${kind === 'image' ? 'a'.repeat(64) : 'b'.repeat(64)}`),
    byteLength: 1,
    mediaType: kind === 'image' ? 'image/png' : 'application/octet-stream',
    source: { kind: 'package' as const, path: `blobs/sha256/${kind === 'image' ? 'a'.repeat(64) : 'b'.repeat(64)}` },
  };

  return assetSchema.parse(kind === 'image'
    ? {
        id, kind, name: id, blob,
        metadata: { pixelWidth: 1, pixelHeight: 1, orientation: 1, hasAlpha: true, bitDepth: 8, colorModel: 'rgb' },
      }
    : { id, kind, name: id, blob, metadata: { encoding: 'binary', recordShape: { kind: 'opaque' } } });
}

function createImage(id: string, assetId = 'image') {
  const base = createReviewGroup(id);

  if (base.kind !== 'group') throw new Error('Expected group fixture');

  const { group: _group, ...common } = base;

  return elementSchema.parse({
    ...common,
    kind: 'image',
    image: { assetId, fit: 'contain', crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
}

describe('asset-valued property target contracts', () => {
  it('publishes the compatible asset kinds for asset targets', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const image = createImage('image-element');
    const actual = parseReviewProject({ ...project, documents: [{ ...document, elements: [image] }] });
    const target = createReviewTarget(actual, image.id, '/image/assetId');

    expect(resolvePropertyTargetContract(actual, target)).toEqual({ valueType: 'asset', assetKinds: ['image'] });
  });

  it('requires explicit exposed-property kind proof and validates concrete defaults', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const localImage = createImage('local-image');
    const target = createReviewTarget(project, localImage.id, '/image/assetId');
    const createProperty = (id: string, valueSchema: object, assetId: string) => ({
      id, label: id, group: 'Data', valueSchema, defaultValue: { type: 'asset', assetId },
      constraints: [], bindings: [{ id: `${id}-binding`, target }],
    });
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [localImage], rootElementIds: [localImage.id], sequences: [],
      exposedProperties: [
        createProperty('unrestricted', { kind: 'asset' }, 'data'),
        createProperty('wrong-default', { kind: 'asset', acceptedAssetKinds: ['image'] }, 'data'),
        createProperty('compatible', { kind: 'asset', acceptedAssetKinds: ['image'] }, 'image'),
      ],
      extensions: [],
    });
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, assets: [createAsset('image', 'image'), createAsset('data', 'data')] },
      documents: [{ ...document, components: [component] }],
    });
    const diagnostics = validateBroadsetProjectV1Semantics(actual);

    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'component.incompatible-binding',
      pointer: '/documents/0/components/0/exposedProperties/0/bindings/0/target',
    }));
    expect(diagnostics).toContainEqual(expect.objectContaining({
      code: 'component.incompatible-default',
      pointer: '/documents/0/components/0/exposedProperties/1/defaultValue',
    }));
    expect(diagnostics).not.toContainEqual(expect.objectContaining({
      code: 'component.incompatible-binding',
      pointer: '/documents/0/components/0/exposedProperties/2/bindings/0/target',
    }));
  });

  it('rejects wrong-kind assets at every target consumer', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const image = createImage('image-element');
    const localImage = createImage('local-image');
    const documentTarget = createReviewTarget(project, image.id, '/image/assetId');
    const localTarget = createReviewTarget(project, localImage.id, '/image/assetId');
    const wrongValue = { type: 'asset' as const, assetId: 'data' };
    const localTrack = {
      id: 'local-track', name: 'Local', target: localTarget, valueType: 'asset' as const,
      keyframes: [{ id: 'key', tick: 0, value: wrongValue }],
    };
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [localImage], rootElementIds: [localImage.id],
      sequences: [{ id: 'local-sequence', name: 'Local', durationTicks: 1, loop: { kind: 'none' }, tracks: [localTrack], markers: [], cues: [], childClips: [] }],
      exposedProperties: [{
        id: 'media', label: 'Media', group: 'Data',
        valueSchema: { kind: 'asset', acceptedMediaTypes: ['application/octet-stream'] },
        defaultValue: wrongValue, constraints: [], bindings: [{ id: 'binding', target: localTarget }],
      }],
      extensions: [],
    });
    const rootTarget = {
      ...documentTarget,
      entity: { ...documentTarget.entity, pageId: page.id, instancePath: ['root-instance'] },
    };
    const track = {
      id: 'track', name: 'Track', target: documentTarget, valueType: 'asset' as const,
      keyframes: [{ id: 'key', tick: 0, value: wrongValue }],
    };
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, assets: [createAsset('image', 'image'), createAsset('data', 'data')] },
      documents: [{
        ...document,
        elements: [image],
        components: [component],
        pages: [{
          ...page,
          rootInstances: [{
            id: 'root-instance', elementId: image.id,
            overrides: [{ target: rootTarget, value: wrongValue }], componentPropertyValues: [],
          }],
        }],
        viewModels: [{
          id: 'view', name: 'View',
          fields: [{ id: 'media', name: 'Media', schema: { kind: 'asset', acceptedMediaTypes: ['application/octet-stream'] }, defaultValue: wrongValue }],
          sampleDataSets: [],
        }],
        bindings: [
          { id: 'binding', target: documentTarget, expression: { kind: 'literal', value: wrongValue }, fallback: wrongValue },
          { id: 'field-binding', target: documentTarget, expression: { kind: 'field', viewModelId: 'view', fieldId: 'media' } },
        ],
        sequences: [{ id: 'sequence', name: 'Sequence', durationTicks: 1, loop: { kind: 'none' }, tracks: [track], markers: [], cues: [], childClips: [] }],
        stateMachines: [{
          id: 'machine', name: 'Machine', initialStateId: 'state',
          states: [{ id: 'state', name: 'State', values: [{ id: 'value', target: documentTarget, value: wrongValue }], entryActions: [], exitActions: [] }],
          transitions: [],
        }],
      }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'target.incompatible-value', pointer: '/documents/0/pages/0/rootInstances/0/overrides/0/value' }),
      expect.objectContaining({ code: 'binding.incompatible-result', pointer: '/documents/0/bindings/0/expression/value' }),
      expect.objectContaining({ code: 'binding.incompatible-fallback', pointer: '/documents/0/bindings/0/fallback' }),
      expect.objectContaining({ code: 'binding.incompatible-result', pointer: '/documents/0/bindings/1/expression' }),
      expect.objectContaining({ code: 'target.incompatible-value', pointer: '/documents/0/sequences/0/tracks/0/keyframes/0/value' }),
      expect.objectContaining({ code: 'target.incompatible-value', pointer: '/documents/0/stateMachines/0/states/0/values/0/value' }),
      expect.objectContaining({ code: 'component.incompatible-binding', pointer: '/documents/0/components/0/exposedProperties/0/bindings/0/target' }),
      expect.objectContaining({ code: 'target.incompatible-value', pointer: '/documents/0/components/0/sequences/0/tracks/0/keyframes/0/value' }),
    ]));
  });
});
