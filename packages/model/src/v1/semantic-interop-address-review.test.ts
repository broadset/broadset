import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1, entityAddressSchema, resolveProjectEntityAddress, sha256DigestSchema } from './index';
import { createSemanticIndexes } from './semantic-index';
import { createReviewGroup, parseReviewProject } from './semantic-review-fixtures';

function createResourceProject(): ReturnType<typeof parseReviewProject> {
  const project = createMinimalProjectV1();
  const digest = sha256DigestSchema.parse(`sha256:${'2'.repeat(64)}`);
  const asset = {
    id: 'asset',
    kind: 'data',
    name: 'Asset',
    blob: {
      digest,
      byteLength: 1,
      mediaType: 'application/octet-stream',
      source: { kind: 'package', path: `blobs/sha256/${'2'.repeat(64)}` },
    },
    metadata: { encoding: 'binary', recordShape: { kind: 'opaque' } },
  };
  const font = {
    id: 'font',
    familyName: 'Font',
    fallbackFontIds: [],
    faces: [{
      id: 'regular',
      source: { kind: 'system', postScriptName: 'Font-Regular' },
      weight: 400,
      style: 'normal',
      stretch: 100,
    }],
  };
  const swatch = {
    id: 'swatch',
    kind: 'process',
    name: 'Swatch',
    color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 },
    producerAliases: [],
  };
  const variables = {
    id: 'variables',
    name: 'Variables',
    modes: [{ id: 'default', name: 'Default' }],
    defaultModeId: 'default',
    variables: [],
  };
  const style = {
    id: 'style',
    name: 'Style',
    kind: 'appearance',
    source: { kind: 'properties', entries: [] },
  };
  const profile = {
    id: 'profile',
    name: 'Profile',
    kind: 'motion',
    dimensions: { width: 1920, height: 1080 },
    pixelAspectRatio: { numerator: 1, denominator: 1 },
    frameRate: { numerator: 25, denominator: 1 },
    scan: { kind: 'progressive' },
    colorSignal: {
      primaries: 'bt709',
      transfer: 'bt1886',
      matrix: 'bt709',
      range: 'limited',
      dynamicRange: { kind: 'sdr', referenceWhiteNits: 100, peakNits: 100 },
    },
    alpha: { kind: 'none' },
    audioRouting: { kind: 'none' },
    safeArea: { kind: 'none' },
    targetRuntime: {
      id: 'runtime',
      kind: 'browser',
      minimumVersion: '1',
      requirements: [],
    },
  };

  return parseReviewProject({
    ...project,
    resources: {
      assets: [asset],
      fonts: [font],
      swatches: [swatch],
      variables: [variables],
      styles: [style],
      outputProfiles: [profile],
    },
  });
}

describe('interop entity-address legality', () => {
  it.each([
    ['asset', 'asset'],
    ['font-family', 'font'],
    ['swatch', 'swatch'],
    ['variable-collection', 'variables'],
    ['shared-style', 'style'],
    ['output-profile', 'profile'],
  ] as const)('resolves exact project resource kind %s', (entityKind, entityId) => {
    const project = createResourceProject();
    const address = entityAddressSchema.parse({ projectId: project.id, entityKind, entityId });

    expect(resolveProjectEntityAddress(createSemanticIndexes(project), address)).toBe(true);
  });

  it('rejects project and resource addresses carrying fields outside their ownership scope', () => {
    const project = createResourceProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const indexes = createSemanticIndexes(project);
    const invalid = [
      { projectId: project.id, entityKind: 'project', entityId: project.id, instancePath: ['bogus'] },
      { projectId: project.id, documentId: document.id, entityKind: 'asset', entityId: 'asset' },
      { projectId: project.id, documentId: document.id, pageId: 'page', entityKind: 'document', entityId: document.id },
    ].map((address) => entityAddressSchema.parse(address));

    expect(invalid.map((address) => resolveProjectEntityAddress(indexes, address))).toEqual([false, false, false]);
  });

  it('requires exact page identity for a page-root address', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const rootElement = createReviewGroup('root-element');
    const root = { id: 'root-instance', elementId: rootElement.id, overrides: [], componentPropertyValues: [] };
    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        elements: [rootElement],
        pages: [{ ...page, rootInstances: [root] }],
      }],
    });
    const indexes = createSemanticIndexes(actual);
    const valid = entityAddressSchema.parse({
      projectId: actual.id,
      documentId: document.id,
      pageId: page.id,
      entityKind: 'page-root',
      entityId: root.id,
    });
    const ambiguous = entityAddressSchema.parse({
      projectId: actual.id,
      documentId: document.id,
      entityKind: 'page-root',
      entityId: root.id,
    });

    expect(resolveProjectEntityAddress(indexes, valid)).toBe(true);
    expect(resolveProjectEntityAddress(indexes, ambiguous)).toBe(false);
  });

  it('treats pages as document-owned addresses only', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const indexes = createSemanticIndexes(project);
    const canonical = entityAddressSchema.parse({
      projectId: project.id,
      documentId: document.id,
      entityKind: 'page',
      entityId: page.id,
    });
    const duplicateOwnership = entityAddressSchema.parse({ ...canonical, pageId: page.id });

    expect(resolveProjectEntityAddress(indexes, canonical)).toBe(true);
    expect(resolveProjectEntityAddress(indexes, duplicateOwnership)).toBe(false);
  });
});
