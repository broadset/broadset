import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { loadProjectV1Json, parseProjectV1Unknown, PROJECT_V1_LIMITS } from './index';

describe('v1 project loading', () => {
  it('loads structurally and semantically valid JSON without applying defaults', async () => {
    const project = createMinimalProjectV1();
    const result = await loadProjectV1Json(JSON.stringify(project));

    expect(result).toEqual({ status: 'loaded', project, diagnostics: [] });
  });

  it('quarantines invalid JSON with exact original text', async () => {
    const source = '{"schemaVersion":1';
    const result = await loadProjectV1Json(source);

    expect(result).toEqual({
      status: 'quarantined',
      originalText: source,
      diagnostics: [expect.objectContaining({ code: 'invalid-json', severity: 'error' })],
    });
  });

  it('quarantines unsupported identity without rewriting it', async () => {
    const source = '{"schemaVersion":1,"id":"legacy"}';
    const result = await loadProjectV1Json(source);

    expect(result.status).toBe('quarantined');
    if (result.status !== 'quarantined') throw new Error('Expected quarantined project');
    expect(result.originalText).toBe(source);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-version' }));
  });

  it('distinguishes structural and semantic invalidity', () => {
    const project = createMinimalProjectV1();
    const structural = parseProjectV1Unknown({ ...project, unexpected: true });
    const semantic = parseProjectV1Unknown({
      ...project,
      documents: [{ ...project.documents[0], outputProfileIds: ['missing-profile'] }],
    });

    expect(structural.status).toBe('quarantined');
    expect(structural.diagnostics.some(({ code }) => code === 'structural-invalid')).toBe(true);
    expect(semantic.status).toBe('quarantined');
    expect(semantic.diagnostics.some(({ code }) => code === 'semantic-invalid')).toBe(true);
    expect(semantic.diagnostics.some(({ code }) => code !== 'semantic-invalid')).toBe(true);
  });

  it('uses the empty JSON Pointer for root structural issues', () => {
    const result = parseProjectV1Unknown({ ...createMinimalProjectV1(), unexpected: true });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'structural-invalid', pointer: '' }));
  });

  it('quarantines oversized JSON before parsing', async () => {
    const source = ' '.repeat(PROJECT_V1_LIMITS.maxJsonTextBytes + 1);
    const result = await loadProjectV1Json(source);

    expect(result).toEqual(
      expect.objectContaining({
        status: 'quarantined',
        originalText: source,
        diagnostics: [expect.objectContaining({ code: 'input-too-large' })],
      }),
    );
  });

  it('quarantines 5k-depth JSON and unknown values without throwing', async () => {
    const depth = 5_000;
    const source = `${'['.repeat(depth)}null${']'.repeat(depth)}`;
    let value: unknown = null;

    for (let index = 0; index < depth; index += 1) value = [value];

    const loaded = await loadProjectV1Json(source);
    const parsed = parseProjectV1Unknown(value);

    expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ code: 'input-too-deep' }));
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ code: 'input-too-deep' }));
  });

  it('quarantines hostile node counts before Zod traversal', () => {
    const input = Array.from({ length: PROJECT_V1_LIMITS.maxNodes + 1 }, () => null);
    const result = parseProjectV1Unknown(input);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'input-too-complex' }));
  });

  it('quarantines cross-field and projected-identity failures semantically', () => {
    const project = createMinimalProjectV1();
    const inverted = parseProjectV1Unknown({
      ...project,
      metadata: {
        ...project.metadata,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    });
    const duplicate = parseProjectV1Unknown({
      ...project,
      documents: [project.documents[0], { ...project.documents[0], name: 'Duplicate ID' }],
    });

    expect(inverted.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'project.invalid-timestamp-order', pointer: '/metadata/updatedAt' }),
    );
    expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({ code: 'identity.duplicate' }));
  });

  it('validates long flat reference chains without recursive overflow', () => {
    const project = createMinimalProjectV1();
    const styles = Array.from({ length: 2_000 }, (_, index) => ({
      id: `style-${String(index)}`,
      name: `Style ${String(index)}`,
      kind: 'appearance' as const,
      source:
        index === 1_999
          ? { kind: 'properties' as const, entries: [] }
          : { kind: 'alias' as const, styleId: `style-${String(index + 1)}` },
    }));
    const result = parseProjectV1Unknown({
      ...project,
      resources: { ...project.resources, styles },
    });

    expect(result.status).toBe('loaded');
  });
});
