import { createProjectEditorStore, type ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function addModifier(name: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'New modifier name' }), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));
}

function findMachineByName(store: ProjectEditorStore, name: string): projectFormatV1.StateMachine | undefined {
  return store.getState().project.documents[0]?.stateMachines.find((machine) => machine.name === name);
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

  it("adds a transition through a modifier's state-machine editor, preserving other machines", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');
    addModifier('Glow');

    const flash = findMachineByName(store, 'Flash');
    const glow = findMachineByName(store, 'Glow');

    if (flash === undefined || glow === undefined) throw new Error('Expected Flash and Glow machines');

    const glowTransitionsBefore = glow.transitions;
    const activeStateId = flash.states.find((candidate) => candidate.name === 'active')?.id;

    if (activeStateId === undefined) throw new Error('Expected an active state on Flash');

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const addRow = within(editor).getByTestId('sm-add-transition-row');

    fireEvent.click(within(addRow).getByRole('button', { name: /target state/i }));
    fireEvent.click(screen.getByRole('option', { name: 'active' }));
    fireEvent.click(within(addRow).getByTestId('sm-add-transition'));

    const updatedFlash = findMachineByName(store, 'Flash');
    const added = updatedFlash?.transitions.find(
      (transition) => transition.targetStateId === activeStateId && transition.trigger.kind === 'lifecycle',
    );

    expect(updatedFlash?.transitions).toHaveLength(3);
    expect(added?.sourceStateId).toBe(flash.initialStateId);
    expect(added?.targetStateId).toBe(activeStateId);
    expect(added?.trigger).toEqual({ kind: 'lifecycle', phase: 'out' });
    expect(added?.priority).toBe(0);
    expect(added?.actions).toEqual([]);
    expect(findMachineByName(store, 'Glow')?.transitions).toEqual(glowTransitionsBefore);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it("updates a transition's priority through the state-machine editor, preserving guard and actions", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const deactivationTransition = flash.transitions.find(
      ({ targetStateId }) => targetStateId === flash.initialStateId,
    );

    if (deactivationTransition === undefined) throw new Error('Expected a deactivation transition');

    const editor = screen.getByTestId(`state-machine-editor-${flash.id}`);
    const row = within(editor).getByTestId(`sm-transition-${deactivationTransition.id}`);
    const priorityInput = within(row).getByLabelText('Priority', { selector: 'input' });

    fireEvent.change(priorityInput, { target: { value: '5' } });
    fireEvent.blur(priorityInput);

    const updated = findMachineByName(store, 'Flash')?.transitions.find(
      (transition) => transition.id === deactivationTransition.id,
    );

    expect(updated?.priority).toBe(5);
    expect(updated?.guard).toEqual(deactivationTransition.guard);
    expect(updated?.actions).toEqual(deactivationTransition.actions);
    expect(updated?.sourceStateId).toBe(deactivationTransition.sourceStateId);
    expect(updated?.targetStateId).toBe(deactivationTransition.targetStateId);
    expect(updated?.trigger).toEqual(deactivationTransition.trigger);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it("wires a reverse-exit sequence onto a modifier's deactivation transition", () => {
    const store = createProjectEditorStore({ project: SAMPLE_PROJECT_V1 });

    render(<V1SequenceSidebar editorStore={store} />);

    addModifier('Flash');

    const flash = findMachineByName(store, 'Flash');

    if (flash === undefined) throw new Error('Expected a Flash machine');

    const sequencesBefore = store.getState().project.documents[0]?.sequences.length ?? 0;

    fireEvent.click(screen.getByRole('button', { name: 'Wire reverse exit into Flash' }));

    const documentAfter = store.getState().project.documents[0];
    const newSequence = documentAfter?.sequences.at(-1);

    expect(documentAfter?.sequences.length).toBe(sequencesBefore + 1);

    if (newSequence === undefined) throw new Error('Expected a reversed sequence');

    const updatedFlash = findMachineByName(store, 'Flash');
    const deactivationTransition = updatedFlash?.transitions.find(
      ({ targetStateId }) => targetStateId === updatedFlash.initialStateId,
    );

    expect(deactivationTransition?.actions).toEqual([
      { kind: 'play-sequence', sequenceId: newSequence.id, behavior: 'restart' },
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
