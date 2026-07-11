import { describe, expect, it } from 'vitest';

import { componentDefinitionSchema } from './index';

describe('componentDefinitionSchema', () => {
  it('requires at least one internal binding for every exposed property', () => {
    expect(
      componentDefinitionSchema.safeParse({
        id: 'component',
        name: 'Component',
        elements: [],
        rootElementIds: [],
        sequences: [],
        exposedProperties: [
          {
            id: 'title',
            label: 'Title',
            group: 'Content',
            valueSchema: { kind: 'string' },
            defaultValue: { type: 'string', value: 'Headline' },
            constraints: [],
            bindings: [],
          },
        ],
        extensions: [],
      }).success,
    ).toBe(false);
  });
});
