import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1, elementSchema, idSchema, resolvePropertyTargetValueType } from './index';
import { createReviewGroup, parseReviewProject } from './semantic-review-fixtures';

describe('property target resolution', () => {
  it('resolves only approved pointers in the addressed project and entity scope', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const baseElement = createReviewGroup('element');
    const element = elementSchema.parse({
      ...baseElement,
      appearance: {
        ...baseElement.appearance,
        fills: [
          {
            id: 'fill',
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 } },
          },
        ],
      },
    });
    const actual = parseReviewProject({ ...project, documents: [{ ...document, elements: [element] }] });
    const entity = { projectId: actual.id, documentId: document.id, entityKind: 'element', entityId: element.id };

    expect(resolvePropertyTargetValueType(actual, { entity, pointer: '/appearance/opacity' })).toBe('number');
    expect(
      resolvePropertyTargetValueType(actual, {
        entity: { ...entity, projectId: idSchema.parse('different-project') },
        pointer: '/appearance/opacity',
      }),
    ).toBeUndefined();
    expect(resolvePropertyTargetValueType(actual, { entity, pointer: '/id' })).toBeUndefined();
    expect(resolvePropertyTargetValueType(actual, { entity, pointer: '/image/assetId' })).toBeUndefined();
    expect(
      resolvePropertyTargetValueType(actual, {
        entity: { ...entity, entityKind: 'fill', entityId: idSchema.parse('fill') },
        pointer: '/opacity',
      }),
    ).toBe('number');
  });
});
