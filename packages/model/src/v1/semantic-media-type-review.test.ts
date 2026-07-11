import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { assetSchema, sha256DigestSchema, validateBroadsetProjectV1Semantics } from './index';
import { parseReviewProject } from './semantic-review-fixtures';

function createImageAsset(mediaType: string) {
  return assetSchema.parse({
    id: 'image',
    kind: 'image',
    name: 'Image',
    blob: {
      digest: sha256DigestSchema.parse(`sha256:${'a'.repeat(64)}`),
      byteLength: 1,
      mediaType,
      source: { kind: 'package', path: `blobs/sha256/${'a'.repeat(64)}` },
    },
    metadata: {
      pixelWidth: 1,
      pixelHeight: 1,
      orientation: 1,
      hasAlpha: true,
      bitDepth: 8,
      colorModel: 'rgb',
    },
  });
}

function createProject(assetMediaType: string, acceptedMediaTypes: readonly string[]) {
  const project = createMinimalProjectV1();
  const document = project.documents[0];

  if (document === undefined) throw new Error('Expected fixture document');

  return parseReviewProject({
    ...project,
    resources: { ...project.resources, assets: [createImageAsset(assetMediaType)] },
    documents: [{
      ...document,
      viewModels: [{
        id: 'view',
        name: 'View',
        fields: [{
          id: 'media',
          name: 'Media',
          schema: { kind: 'asset', acceptedMediaTypes },
          defaultValue: { type: 'asset', assetId: 'image' },
        }],
        sampleDataSets: [{
          id: 'sample',
          name: 'Sample',
          values: { media: { type: 'asset', assetId: 'image' } },
        }],
      }],
    }],
  });
}

describe('accepted asset media types', () => {
  it('accepts an exact media type and compares ASCII letters case-insensitively', () => {
    expect(validateBroadsetProjectV1Semantics(createProject('IMAGE/PNG', ['image/png']))).not.toContainEqual(
      expect.objectContaining({ code: 'data.incompatible-media-type' }),
    );
  });

  it('rejects mismatched default and sample asset media types', () => {
    expect(validateBroadsetProjectV1Semantics(createProject('image/jpeg', ['image/png']))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'data.incompatible-media-type', pointer: '/documents/0/viewModels/0/fields/0/defaultValue' }),
        expect.objectContaining({ code: 'data.incompatible-media-type', pointer: '/documents/0/viewModels/0/sampleDataSets/0/values/media' }),
      ]),
    );
  });
});
