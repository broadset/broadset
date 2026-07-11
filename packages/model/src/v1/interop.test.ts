import { describe, expect, it } from 'vitest';

import { interopRegistrySchema } from './index';

describe('interopRegistrySchema', () => {
  it('parses an empty strict registry', () => {
    const registry = { sources: [], records: [] };

    expect(interopRegistrySchema.parse(registry)).toEqual(registry);
  });

  it('requires a warning location', () => {
    expect(
      interopRegistrySchema.safeParse({
        sources: [],
        records: [
          {
            id: 'record',
            sourceId: 'source',
            target: { projectId: 'project', entityKind: 'project', entityId: 'project' },
            baselineSemanticHash: `sha256:${'0'.repeat(64)}`,
            mappingConfidence: 1,
            editability: 'native',
            warnings: [{ code: 'warning', severity: 'warning', message: 'Warning', dimension: 'semantics' }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
