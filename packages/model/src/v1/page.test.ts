import { describe, expect, it } from 'vitest';

import { pageDefinitionSchema } from './page';

function createRootInstance(instanceId: string, elementId: string) {
  return {
    id: instanceId,
    elementId,
    overrides: [],
    componentPropertyValues: [],
  };
}

function createPage(rootInstances: readonly Readonly<Record<string, unknown>>[]) {
  return {
    id: 'page-1',
    name: 'Program',
    locale: 'fi-FI',
    notes: { paragraphs: [] },
    rootInstances,
    descendantOverrides: [
      {
        address: {
          rootInstanceId: 'instance-a',
          componentInstancePath: ['nested-instance'],
          elementId: 'headline',
        },
        overrides: [
          {
            target: {
              entity: {
                projectId: 'project-1',
                documentId: 'document-1',
                entityKind: 'element',
                entityId: 'headline',
                instancePath: ['instance-a', 'nested-instance'],
              },
              pointer: '/text/paragraphs',
            },
            value: { type: 'string', value: 'Breaking news' },
          },
        ],
      },
    ],
    selectedVariableModes: { 'brand-colors': 'night' },
    sampleDataSetId: 'sample-evening',
    sequenceId: 'sequence-in',
    extensions: [],
  };
}

describe('pageDefinitionSchema', () => {
  it('allows repeated definitions through independent page instance ids', () => {
    const page = createPage([createRootInstance('instance-a', 'shared-root'), createRootInstance('instance-b', 'shared-root')]);

    expect(pageDefinitionSchema.parse(page).rootInstances.map((item) => item.id)).toEqual([
      'instance-a',
      'instance-b',
    ]);
  });

  it('preserves sparse root and descendant overrides with stable instance addresses', () => {
    const root = {
      ...createRootInstance('instance-a', 'shared-root'),
      visible: false,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 80, 40] },
      overrides: [
        {
          target: {
            entity: { projectId: 'project-1', entityKind: 'element', entityId: 'shared-root' },
            pointer: '/appearance/opacity',
          },
          value: { type: 'number', value: 0.75 },
        },
      ],
      componentPropertyValues: [
        { exposedPropertyId: 'title', value: { type: 'string', value: 'Evening news' } },
      ],
    };
    const page = createPage([root]);

    expect(pageDefinitionSchema.parse(page)).toEqual(page);
  });

  it('rejects duplicate root instance ids without rejecting a repeated definition id', () => {
    expect(
      pageDefinitionSchema.safeParse(
        createPage([createRootInstance('same-instance', 'shared-root'), createRootInstance('same-instance', 'other-root')]),
      ).success,
    ).toBe(false);
  });

  it('rejects duplicate descendant instance addresses', () => {
    const page = createPage([createRootInstance('instance-a', 'shared-root')]);
    const descendant = page.descendantOverrides[0];

    expect(pageDefinitionSchema.safeParse({ ...page, descendantOverrides: [descendant, descendant] }).success).toBe(false);
  });

  it('rejects duplicate sparse override targets within one instance layer', () => {
    const target = {
      entity: { projectId: 'project-1', entityKind: 'element', entityId: 'shared-root' },
      pointer: '/appearance/opacity',
    };
    const override = { target, value: { type: 'number', value: 0.5 } };
    const root = { ...createRootInstance('instance-a', 'shared-root'), overrides: [override, override] };

    expect(pageDefinitionSchema.safeParse(createPage([root])).success).toBe(false);
  });

  it('rejects unknown fields at every page layer', () => {
    const page = createPage([createRootInstance('instance-a', 'shared-root')]);

    expect(pageDefinitionSchema.safeParse({ ...page, unexpected: true }).success).toBe(false);
    expect(
      pageDefinitionSchema.safeParse({ ...page, rootInstances: [{ ...page.rootInstances[0], unexpected: true }] }).success,
    ).toBe(false);
    expect(
      pageDefinitionSchema.safeParse({
        ...page,
        descendantOverrides: [{ ...page.descendantOverrides[0], unexpected: true }],
      }).success,
    ).toBe(false);
  });
});
