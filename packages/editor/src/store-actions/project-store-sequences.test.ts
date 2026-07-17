import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore } from './project-store';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function idFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`gen-${String(next++)}`);
}

function createMotionProject(): projectFormatV1.BroadsetProjectV1 {
  const element = projectFormatV1.createElementV1({
    id: id('headline'),
    name: 'Headline',
    geometry: projectFormatV1.createElementGeometry({ width: 200, height: 80 }),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
  const page = projectFormatV1.createPageV1({
    id: id('page-1'),
    rootInstances: [{ id: id('root-1'), elementId: element.id, overrides: [], componentPropertyValues: [] }],
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('doc-1'),
    kind: 'motion',
    timebase: {
      frameRate: { numerator: 30, denominator: 1 },
      ticksPerSecond: 30,
      timecode: { nominalFramesPerSecond: 30, dropFrame: false },
    },
    elements: [element],
    pages: [page],
  });

  return projectFormatV1.createProjectV1({ documents: [document] });
}

const OPACITY_TARGET: projectFormatV1.PropertyTarget = {
  entity: { projectId: id('project'), documentId: id('doc-1'), entityKind: 'element', entityId: id('headline') },
  pointer: '/appearance/opacity',
};

function activeSequence(store: ReturnType<typeof createProjectEditorStore>): projectFormatV1.Sequence | undefined {
  return store.getState().project.documents[0]?.sequences[0];
}

describe('project v1 sequence authoring actions', () => {
  it('authors a sequence, track, and keyframe end to end and keeps the project valid', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });

    const sequenceId = store.getState().addSequence({ name: 'Intro', durationTicks: 60 });

    expect(sequenceId).not.toBeNull();
    if (sequenceId === null) return;

    expect(
      store.getState().createTrack({
        sequenceId,
        name: 'Opacity',
        target: OPACITY_TARGET,
        valueType: 'number',
        tick: 0,
        value: { type: 'number', value: 0 },
      }),
    ).toBe(true);

    const trackId = activeSequence(store)?.tracks[0]?.id;

    expect(trackId).toBeDefined();
    if (trackId === undefined) return;

    expect(
      store.getState().addKeyframe({ sequenceId, trackId, tick: 30, value: { type: 'number', value: 1 } }),
    ).toBe(true);

    const keyframes = activeSequence(store)?.tracks[0]?.keyframes ?? [];

    expect(keyframes.map(({ tick }) => tick)).toEqual([0, 30]);
    expect(keyframes[keyframes.length - 1]?.interpolation).toBeUndefined();
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('makes keyframe authoring undoable and removes the track with its final keyframe', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });
    const sequenceId = store.getState().addSequence({ name: 'Intro', durationTicks: 60 });

    if (sequenceId === null) throw new Error('Expected a sequence id');

    store.getState().createTrack({
      sequenceId,
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      tick: 0,
      value: { type: 'number', value: 0 },
    });

    const trackId = activeSequence(store)?.tracks[0]?.id;

    if (trackId === undefined) throw new Error('Expected a track id');

    const keyframeId = activeSequence(store)?.tracks[0]?.keyframes[0]?.id;

    if (keyframeId === undefined) throw new Error('Expected a keyframe id');

    expect(store.getState().removeKeyframe({ sequenceId, trackId, keyframeId })).toBe(true);
    expect(activeSequence(store)?.tracks).toEqual([]);

    store.getState().undo();

    expect(activeSequence(store)?.tracks[0]?.keyframes.map(({ id: keyframe }) => keyframe)).toEqual([keyframeId]);
  });

  it('fails soft for unknown sequences and tracks', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });

    expect(
      store.getState().addKeyframe({
        sequenceId: id('missing'),
        trackId: id('missing'),
        tick: 0,
        value: { type: 'number', value: 0 },
      }),
    ).toBe(false);
    expect(store.getState().removeSequence(id('missing'))).toBe(false);
  });
});
