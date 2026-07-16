import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { createProjectEditorStore } from './project-store';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createProject(): projectFormatV1.BroadsetProjectV1 {
  const sequence: projectFormatV1.Sequence = {
    id: id('preview-sequence'),
    name: 'Preview sequence',
    durationTicks: 100,
    loop: { kind: 'none' },
    tracks: [],
    markers: [],
    cues: [],
    childClips: [],
  };
  const page = projectFormatV1.createPageV1({ id: id('preview-page') });
  const document: projectFormatV1.BroadsetDocumentV1 = {
    ...projectFormatV1.createDocumentV1({ id: id('preview-document'), kind: 'motion', timebase: {
      frameRate: { numerator: 25, denominator: 1 },
      ticksPerSecond: 1000,
      timecode: { nominalFramesPerSecond: 25, dropFrame: false },
    }, pages: [page] }),
    sequences: [sequence],
  };

  return projectFormatV1.createProjectV1({ documents: [document] });
}

describe('project v1 preview transport', () => {
  it('uses stable sequence identity, clamps exact-tick seeks, and keeps transport outside undo history', () => {
    const store = createProjectEditorStore({ project: createProject() });

    expect(store.getState().playbackSequenceId).toBe(id('preview-sequence'));
    expect(store.getState().seekPlaybackTick(40)).toBe(true);
    expect(store.getState().playbackTick).toBe(40);
    expect(store.getState().seekPlaybackTick(500)).toBe(true);
    expect(store.getState().playbackTick).toBe(100);
    expect(store.temporal.getState().pastStates).toHaveLength(0);

    expect(store.getState().setPlaybackPlaying(true)).toBe(true);
    expect(store.getState().playbackPlaying).toBe(true);
    store.getState().resetPlayback();
    expect(store.getState()).toMatchObject({ playbackPlaying: false, playbackTick: 0 });
  });

  it('fails soft for unknown sequences and invalid ticks', () => {
    const store = createProjectEditorStore({ project: createProject() });

    expect(store.getState().setPlaybackSequence(id('missing'))).toBe(false);
    expect(store.getState().seekPlaybackTick(-1)).toBe(false);
    expect(store.getState().seekPlaybackTick(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
