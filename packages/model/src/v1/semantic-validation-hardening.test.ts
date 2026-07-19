import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  assetSchema,
  broadsetProjectV1Schema,
  elementSchema,
  idSchema,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';

const group = elementSchema.parse({
  id: 'group', kind: 'group', name: 'Group', parentId: null, locked: false, hiddenInEditor: false,
  geometry: { bounds: { width: 1, height: 1 }, transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] }, origin: [0, 0, 0] },
  appearance: { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] },
  sharedStyleIds: [], extensions: [], group: { clipChildren: false },
});

describe('semantic validation hardening', () => {
  it('does not interpret IDs inside opaque extension payloads as core identities', () => {
    const project = createMinimalProjectV1();
    const extended = broadsetProjectV1Schema.parse({
      ...project,
      extensions: [{ namespace: 'com.example.opaque', schema: 'https://example.com/schema.json', version: 1, payload: { rows: [{ id: 'same' }, { id: 'same' }] } }],
    });

    expect(validateBroadsetProjectV1Semantics(extended)).toEqual([]);
  });

  it('validates a 10,000-node cyclic hierarchy within the normal test timeout', () => {
    const project = createMinimalProjectV1();
    const count = 10_000;
    const elements = Array.from({ length: count }, (_, index) => ({
      ...group,
      id: idSchema.parse(`element-${String(index)}`),
      parentId: idSchema.parse(`element-${String((index + 1) % count)}`),
    }));
    const document = project.documents[0];
    const diagnostics = document === undefined ? [] : validateBroadsetProjectV1Semantics({ ...project, documents: [{ ...document, elements }] });

    expect(diagnostics.some(({ code }) => code === 'hierarchy.cycle')).toBe(true);
  });

  it.each([
    ['timebase.unreduced-rate', (project: ReturnType<typeof createMinimalProjectV1>) => ({ ...project, documents: [{ ...project.documents[0], kind: 'motion', timebase: { frameRate: { numerator: 50, denominator: 2 }, ticksPerSecond: 50, timecode: { nominalFramesPerSecond: 25, dropFrame: false } } }] })],
    ['data.invalid-bounds', (project: ReturnType<typeof createMinimalProjectV1>) => ({ ...project, documents: [{ ...project.documents[0], viewModels: [{ id: 'values', name: 'Values', fields: [{ id: 'count', name: 'Count', schema: { kind: 'number', minimum: 10, maximum: 5 } }], sampleDataSets: [] }] }] })],
  ])('preserves moved invariant diagnostic %s', (code, create) => {
    const parsed = broadsetProjectV1Schema.parse(create(createMinimalProjectV1()));

    expect(validateBroadsetProjectV1Semantics(parsed).some((diagnostic) => diagnostic.code === code)).toBe(true);
  });

  it('preserves package blob integrity diagnostics after the test split', () => {
    const project = createMinimalProjectV1();
    const asset = assetSchema.parse({
      id: 'data', kind: 'data', name: 'Data',
      blob: { digest: sha256DigestSchema.parse(`sha256:${'0'.repeat(64)}`), byteLength: 0, mediaType: 'application/json', source: { kind: 'package', path: `blobs/sha256/${'1'.repeat(64)}` } },
      metadata: { encoding: 'utf-8', recordShape: { kind: 'opaque' } },
    });

    expect(validateBroadsetProjectV1Semantics({ ...project, resources: { ...project.resources, assets: [asset] } }).some(({ code }) => code === 'asset.invalid-blob-source')).toBe(true);
  });

  it('preserves duplicate page-root identity diagnostics after the test split', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Minimal page is required');

    const root = { id: idSchema.parse('root'), elementId: group.id, overrides: [], componentPropertyValues: [] };
    const diagnostics = validateBroadsetProjectV1Semantics({
      ...project,
      documents: [{ ...document, elements: [group], pages: [{ ...page, rootInstances: [root, root] }] }],
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'identity.duplicate', pointer: '/documents/0/pages/0/rootInstances/1/id' }),
    );
  });
});
