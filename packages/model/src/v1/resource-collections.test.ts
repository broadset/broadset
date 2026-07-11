import { describe, expect, it } from 'vitest';

import { sharedStyleSchema, variableCollectionSchema } from './index';

describe('v1 resource collection structural ownership', () => {
  it('defers projected duplicate mode IDs to semantic validation', () => {
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

    expect(result.success).toBe(true);
  });

  it('defers projected duplicate style entry IDs to semantic validation', () => {
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

    expect(result.success).toBe(true);
  });
});
