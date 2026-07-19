import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { broadsetProjectV1Schema, parseProjectV1Unknown } from './index';

function expectSemanticRejection(project: unknown, code: string): void {
  expect(broadsetProjectV1Schema.safeParse(project).success).toBe(true);

  const result = parseProjectV1Unknown(project);

  expect(result.status).toBe('quarantined');
  expect(result.diagnostics.some((diagnostic) => diagnostic.code === code)).toBe(true);
}

describe('broadsetProjectV1Schema', () => {
  it('parses a complete minimal v1 project without hidden defaults', () => {
    const project = createMinimalProjectV1();

    expect(broadsetProjectV1Schema.parse(project)).toEqual(project);
  });

  it.each([
    ['$schema', 'https://schema.broadset.dev/v2/project.schema.json'],
    ['format', 'other-project'],
    ['schemaVersion', 2],
  ])('rejects invalid identity field %s', (field, value) => {
    expect(broadsetProjectV1Schema.safeParse({ ...createMinimalProjectV1(), [field]: value }).success).toBe(false);
  });

  it('rejects runtime UI state at the root', () => {
    expect(broadsetProjectV1Schema.safeParse({ ...createMinimalProjectV1(), viewport: { zoom: 2 } }).success).toBe(
      false,
    );
  });

  it('defers metadata instant ordering to semantic validation', () => {
    const project = createMinimalProjectV1();

    expectSemanticRejection(
      {
        ...project,
        metadata: {
          ...project.metadata,
          createdAt: '2025-01-01T00:00:00.000000001Z',
          updatedAt: '2025-01-01T00:00:00.000000000Z',
        },
      },
      'project.invalid-timestamp-order',
    );
  });

  it('defers duplicate track IDs to semantic validation', () => {
    const project = createMinimalProjectV1();
    const target = {
      entity: {
        projectId: project.id,
        documentId: project.documents[0]?.id,
        entityKind: 'element',
        entityId: 'element',
      },
      pointer: '/appearance/opacity',
    };
    const track = {
      id: 'track',
      name: 'Track',
      target,
      valueType: 'number' as const,
      keyframes: [{ id: 'keyframe', tick: 0, value: { type: 'number' as const, value: 1 } }],
    };
    const sequence = {
      id: 'sequence',
      name: 'Sequence',
      durationTicks: 10,
      loop: { kind: 'none' as const },
      tracks: [track, track],
      markers: [],
      cues: [],
      childClips: [],
    };

    expectSemanticRejection(
      {
        ...project,
        documents: [{ ...project.documents[0], sequences: [sequence] }],
      },
      'identity.duplicate',
    );
  });

  it('defers out-of-duration keyframes to semantic validation', () => {
    const project = createMinimalProjectV1();
    const sequence = {
      id: 'sequence',
      name: 'Sequence',
      durationTicks: 10,
      loop: { kind: 'none' as const },
      tracks: [
        {
          id: 'track',
          name: 'Track',
          target: {
            entity: {
              projectId: project.id,
              documentId: project.documents[0]?.id,
              entityKind: 'element',
              entityId: 'element',
            },
            pointer: '/appearance/opacity',
          },
          valueType: 'number' as const,
          keyframes: [{ id: 'keyframe', tick: 11, value: { type: 'number' as const, value: 1 } }],
        },
      ],
      markers: [],
      cues: [],
      childClips: [],
    };

    expectSemanticRejection(
      {
        ...project,
        documents: [{ ...project.documents[0], sequences: [sequence] }],
      },
      'sequence.invalid-keyframe-tick',
    );
  });
});
