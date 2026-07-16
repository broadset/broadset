import { describe, expect, it } from 'vitest';

import {
  type BroadsetProjectV1,
  broadsetProjectV1Schema,
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
  loadProjectV1Json,
  parseProjectV1Unknown,
  validateBroadsetProjectV1Semantics,
} from '../index';

function createMinimalProject(): BroadsetProjectV1 {
  return broadsetProjectV1Schema.parse({
    $schema: 'https://schema.broadset.dev/v1/project.schema.json',
    format: 'broadset-project',
    schemaVersion: 1,
    id: 'project',
    metadata: {
      name: 'Minimal project',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    resources: { assets: [], fonts: [], swatches: [], variables: [], styles: [], outputProfiles: [] },
    documents: [
      {
        id: 'document',
        name: 'Minimal document',
        kind: 'static',
        surface: {
          size: [1920, 1080],
          unit: 'px',
          dpi: 96,
          coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
          background: { kind: 'none' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          guides: [],
          broadcastSafeAreas: [],
        },
        color: { workingSpace: { kind: 'named', space: 'srgb' }, compositing: 'linear-premultiplied' },
        elements: [],
        components: [],
        pages: [
          {
            id: 'page',
            name: 'Page 1',
            rootInstances: [],
            descendantOverrides: [],
            selectedVariableModes: {},
            selectedSampleDataSets: {},
            extensions: [],
          },
        ],
        sequences: [],
        stateMachines: [],
        viewModels: [],
        bindings: [],
        selectedVariableModes: {},
        outputProfileIds: [],
        extensions: [],
      },
    ],
    templateGroups: [],
    interop: { sources: [], records: [] },
    extensions: [],
  });
}

function createRoundTripProject(): BroadsetProjectV1 {
  const project = createMinimalProject();

  return {
    ...project,
    metadata: {
      ...project.metadata,
      name: 'Ångström 世界',
      description: 'Canonical JSON remains ordinary, lossless JSON.',
      authors: ['Broadset'],
      keywords: ['broadcast', 'print'],
      generator: { name: 'Broadset', version: '1.0.0', build: 'test-build' },
    },
    extensions: [
      {
        namespace: 'dev.broadset.roundtrip',
        schema: 'https://schema.broadset.dev/extensions/roundtrip.json',
        version: 1,
        payload: {
          nullValue: null,
          enabled: true,
          measurements: [0, 1.25, 1e30],
          nested: { 'emoji-😀': 'preserved', 'line\nbreak': '\b\t\n\f\r\\"' },
        },
      },
    ],
  };
}

describe('v1 package-root format round trip', () => {
  it('preserves every JSON value through parse, semantics, canonicalization, hash, and load', async () => {
    const sourceProject = createRoundTripProject();
    const ordinaryJson = JSON.stringify(sourceProject);
    const unknownInput: unknown = JSON.parse(ordinaryJson);

    const structural = broadsetProjectV1Schema.parse(unknownInput);

    expect(structural).toEqual(sourceProject);
    expect(parseProjectV1Unknown(unknownInput)).toEqual({ status: 'loaded', project: sourceProject, diagnostics: [] });
    expect(validateBroadsetProjectV1Semantics(structural)).toEqual([]);

    const canonical = canonicalizeProjectV1(structural);
    const loaded = await loadProjectV1Json(canonical);

    expect(loaded).toEqual({ status: 'loaded', project: sourceProject, diagnostics: [] });
    expect(JSON.parse(canonical)).toEqual(JSON.parse(ordinaryJson));

    if (loaded.status !== 'loaded') throw new Error('Expected the canonical project to load');

    await expect(computeProjectSemanticHashV1(loaded.project)).resolves.toBe(
      await computeProjectSemanticHashV1(structural),
    );
  });

  it('quarantines an invalid round trip without inserting defaults or discarding the source text', async () => {
    const invalidText = JSON.stringify({ ...createRoundTripProject(), unknownSettings: {} });
    const result = await loadProjectV1Json(invalidText, { lastValidProject: createMinimalProject() });

    expect(result.status).toBe('quarantined');

    if (result.status !== 'quarantined') throw new Error('Expected invalid input to be quarantined');

    expect(result.originalText).toBe(invalidText);
    expect(result.lastValidProject).toEqual(createMinimalProject());
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'structural-invalid', pointer: '', severity: 'error' }),
    );
  });
});
