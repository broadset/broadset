import { createProjectEditorStore, type ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { V1SequenceSidebar } from './v1-sequence-sidebar';

function firstTrack(store: ProjectEditorStore): projectFormatV1.Track {
  const track = store.getState().project.documents[0]?.sequences[0]?.tracks[0];

  if (track === undefined) throw new Error('Expected a seeded track');

  return track;
}

function firstSequenceId(store: ProjectEditorStore): projectFormatV1.Id {
  const sequenceId = store.getState().project.documents[0]?.sequences[0]?.id;

  if (sequenceId === undefined) throw new Error('Expected a seeded sequence');

  return sequenceId;
}

describe('V1SequenceSidebar', () => {
  it('edits a keyframe value through the invariant-safe sequence command', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const keyframe = firstTrack(store).keyframes[0];

    if (keyframe?.value.type !== 'number') throw new Error('Expected a number keyframe');

    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.change(screen.getByTestId(`keyframe-value-${keyframe.id}`), { target: { value: '0.25' } });

    await waitFor(() => {
      const updated = firstTrack(store).keyframes.find(({ id }) => id === keyframe.id);

      expect(updated?.value).toEqual({ type: 'number', value: 0.25 });
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('adds and removes a keyframe on an existing track', async () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });
    const track = firstTrack(store);
    const sequenceId = firstSequenceId(store);
    const usedTicks = new Set(track.keyframes.map(({ tick }) => tick));

    let freeTick = 1;

    while (usedTicks.has(freeTick)) freeTick += 1;

    store.getState().seekPlaybackTick(freeTick);
    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.click(screen.getByTestId(`add-keyframe-${track.id}`));

    await waitFor(() => {
      const ticks = firstTrack(store).keyframes.map(({ tick }) => tick);

      expect(ticks).toContain(freeTick);
    });

    const added = firstTrack(store).keyframes.find(({ tick }) => tick === freeTick);

    if (added === undefined) throw new Error('Expected the added keyframe');

    fireEvent.click(screen.getByTestId(`remove-keyframe-${added.id}`));

    await waitFor(() => {
      expect(firstTrack(store).keyframes.map(({ id }) => id)).not.toContain(added.id);
    });

    expect(store.getState().playbackSequenceId).toBe(sequenceId);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('adds a canonical two-state modifier state machine from the animation state sections', () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'New modifier name' }), { target: { value: 'Flash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));

    const machines = store.getState().project.documents[0]?.stateMachines ?? [];
    const added = machines.find((machine) => machine.name === 'Flash');

    expect(added?.states.map(({ name }) => name)).toEqual(['inactive', 'active']);
    expect(added?.states.flatMap(({ values }) => values)).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
