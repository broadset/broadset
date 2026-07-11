import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  broadsetProjectV1Schema,
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
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
          payload: { '\u{1f600}': 1e30, '\ufffd': 0.000001, negativeZero: -0 },
        },
      ],
    });

    expect(canonical).toContain('{"negativeZero":0,"😀":1e+30,"�":0.000001}');
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
});
