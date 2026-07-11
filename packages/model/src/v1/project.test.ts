import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { broadsetProjectV1Schema } from './index';

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

  it('rejects metadata with updatedAt earlier by an exact instant', () => {
    const project = createMinimalProjectV1();

    expect(
      broadsetProjectV1Schema.safeParse({
        ...project,
        metadata: {
          ...project.metadata,
          createdAt: '2025-01-01T00:00:00.000000001Z',
          updatedAt: '2025-01-01T00:00:00.000000000Z',
        },
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate track IDs through aggregate structural parsing', () => {
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

    expect(
      broadsetProjectV1Schema.safeParse({
        ...project,
        documents: [{ ...project.documents[0], sequences: [sequence] }],
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-duration keyframe through aggregate structural parsing', () => {
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

    expect(
      broadsetProjectV1Schema.safeParse({
        ...project,
        documents: [{ ...project.documents[0], sequences: [sequence] }],
      }).success,
    ).toBe(false);
  });
});
