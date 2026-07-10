import { describe, expect, it } from 'vitest';

import { sharedStyleSchema, variableCollectionSchema } from './index';

describe('v1 resource collection diagnostics', () => {
  it('reports duplicate mode IDs at the exact collection path', () => {
    const result = variableCollectionSchema.safeParse({
      id: 'variables',
      name: 'Variables',
      modes: [
        { id: 'mode', name: 'First' },
        { id: 'mode', name: 'Second' },
      ],
      defaultModeId: 'mode',
      variables: [],
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected duplicate modes to fail');
    }

    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['modes', 1, 'id'] }));
  });

  it('reports duplicate style entry IDs at the exact nested collection path', () => {
    const result = sharedStyleSchema.safeParse({
      id: 'style',
      name: 'Style',
      kind: 'text',
      source: {
        kind: 'properties',
        entries: [
          { id: 'entry', pointer: '/size', value: { type: 'number', value: 12 } },
          { id: 'entry', pointer: '/weight', value: { type: 'integer', value: 400 } },
        ],
      },
    });

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error('Expected duplicate style entries to fail');
    }

    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['source', 'entries', 1, 'id'] }));
  });
});
