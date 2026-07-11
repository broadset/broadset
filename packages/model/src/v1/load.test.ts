import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { loadProjectV1Json, parseProjectV1Unknown } from './index';

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
});
