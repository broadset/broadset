import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  broadsetProjectV1Schema,
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
  type JsonValue,
  PROJECT_V1_LIMITS,
  ProjectV1LimitError,
  utcTimestampSchema,
} from './index';

describe('v1 canonical JSON', () => {
  it('canonicalizes independent object insertion orders identically', () => {
    const project = createMinimalProjectV1();
    const reordered = broadsetProjectV1Schema.parse(
      JSON.parse(
        `{"schemaVersion":1,"format":"broadset-project","$schema":"https://schema.broadset.dev/v1/project.schema.json","id":"project","metadata":{"updatedAt":"2025-01-01T00:00:00Z","createdAt":"2025-01-01T00:00:00Z","name":"Minimal project"},"resources":{"outputProfiles":[],"styles":[],"variables":[],"swatches":[],"fonts":[],"assets":[]},"documents":${JSON.stringify(project.documents)},"templateGroups":[],"interop":{"records":[],"sources":[]},"extensions":[]}`,
      ) as unknown,
    );

    expect(canonicalizeProjectV1(project)).toBe(canonicalizeProjectV1(reordered));
  });

  it('uses RFC 8785-compatible accepted-number and UTF-16 key serialization', () => {
    const project = createMinimalProjectV1();
    const canonical = canonicalizeProjectV1({
      ...project,
      extensions: [
        {
          namespace: 'com.example.canonical',
          schema: 'https://example.com/canonical.schema.json',
          version: 1,
          payload: {
            '\u{1f600}': 1e30,
            '\ufffd': 0.000001,
            edge: [Number('333333333.33333329'), 4.5, 0.002, 1e-27, Number.MAX_VALUE, Number.MIN_VALUE],
            negativeZero: -0,
          },
        },
      ],
    });

    expect(canonical).toContain('"negativeZero":0,"😀":1e+30,"�":0.000001');
    expect(canonical).toContain('"edge":[333333333.3333333,4.5,0.002,1e-27,1.7976931348623157e+308,5e-324]');
  });

  it('uses JSON escapes and rejects lone UTF-16 surrogates', () => {
    const project = createMinimalProjectV1();
    const escaped = canonicalizeProjectV1({
      ...project,
      metadata: { ...project.metadata, description: 'quote:" slash:\\ controls:\b\t\n\f\r \u2028' },
    });

    expect(escaped).toContain('"description":"quote:\\" slash:\\\\ controls:\\b\\t\\n\\f\\r \u2028"');
    expect(() =>
      canonicalizeProjectV1({ ...project, metadata: { ...project.metadata, description: '\ud800' } }),
    ).toThrow('lone surrogates');
  });

  it('rejects runtime-foreign undefined array members instead of truncating canonical output', () => {
    const project = createMinimalProjectV1();
    const payload: JsonValue = [];

    Object.defineProperty(payload, '0', { value: undefined, enumerable: true });
    expect(() =>
      canonicalizeProjectV1({
        ...project,
        extensions: [
          {
            namespace: 'com.example.hostile',
            schema: 'https://example.com/hostile.schema.json',
            version: 1,
            payload,
          },
        ],
      }),
    ).toThrow('only JSON values');
  });

  it('bounds escaped string output before allocating its canonical representation', () => {
    const project = createMinimalProjectV1();
    const expandingControls = '\u0000'.repeat(Math.floor(PROJECT_V1_LIMITS.maxJsonTextBytes / 6) + 1);

    expect(() =>
      canonicalizeProjectV1({
        ...project,
        metadata: { ...project.metadata, description: expandingControls },
      }),
    ).toThrow(ProjectV1LimitError);
  });

  it('rejects depth, node-count, and output-size limits predictably without recursion overflow', () => {
    const project = createMinimalProjectV1();
    let deepPayload: JsonValue = null;

    for (let index = 0; index < 5_000; index += 1) deepPayload = [deepPayload];

    const withPayload = (payload: JsonValue) => ({
      ...project,
      extensions: [
        {
          namespace: 'com.example.limits',
          schema: 'https://example.com/limits.schema.json',
          version: 1,
          payload,
        },
      ],
    });

    expect(() => canonicalizeProjectV1(withPayload(deepPayload))).toThrow(ProjectV1LimitError);
    expect(() =>
      canonicalizeProjectV1(withPayload(Array.from({ length: PROJECT_V1_LIMITS.maxNodes + 1 }, () => null))),
    ).toThrow(ProjectV1LimitError);
    expect(() =>
      canonicalizeProjectV1({
        ...project,
        metadata: { ...project.metadata, description: 'x'.repeat(PROJECT_V1_LIMITS.maxJsonTextBytes + 1) },
      }),
    ).toThrow(ProjectV1LimitError);
  });

  it('excludes only non-semantic update and generator-build metadata from hashes', async () => {
    const first = {
      ...createMinimalProjectV1(),
      metadata: {
        ...createMinimalProjectV1().metadata,
        generator: { name: 'Broadset', version: '1.0.0', build: 'first-build' },
      },
    };
    const second = {
      ...first,
      metadata: {
        ...first.metadata,
        updatedAt: utcTimestampSchema.parse('2026-07-10T09:00:00Z'),
        generator: { ...first.metadata.generator, build: 'other-build' },
      },
    };

    expect(await computeProjectSemanticHashV1(first)).toBe(await computeProjectSemanticHashV1(second));
    expect(
      await computeProjectSemanticHashV1({
        ...second,
        metadata: { ...second.metadata, generator: { ...second.metadata.generator, version: '2.0.0' } },
      }),
    ).not.toBe(await computeProjectSemanticHashV1(second));
  });

  it('matches the published multilingual semantic-hash vector', async () => {
    const project = createMinimalProjectV1();
    const multilingual = {
      ...project,
      metadata: { ...project.metadata, name: 'Ångström 東京 😀' },
    };

    expect(await computeProjectSemanticHashV1(multilingual)).toBe(
      'sha256:4aa31024997fab9fbbf9fc0131a2f8ea4fea7761cbca61e524a173076ffbe216',
    );
  });
});
