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

describe('animation-state store actions', () => {
  it('authors lifecycle, modifier machine, and reverse exit end to end, undoably', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });
    const sequenceId = store.getState().addSequence({ name: 'Intro', durationTicks: 60 });

    if (sequenceId === null) throw new Error('expected sequence');

    expect(
      store.getState().setLifecyclePhaseActions('in', [{ kind: 'play-sequence', sequenceId, behavior: 'restart' }]),
    ).toBe(true);
    expect(store.getState().project.documents[0]?.lifecycle?.in).toHaveLength(1);

    const machineId = store.getState().addModifierStateMachine({ name: 'Highlight', activeValues: [] });

    expect(machineId).not.toBeNull();
    expect(store.getState().project.documents[0]?.stateMachines).toHaveLength(1);

    const exitId = store.getState().createReverseExitSequence(sequenceId, 'Intro (exit)');

    expect(exitId).not.toBeNull();
    expect(store.getState().project.documents[0]?.sequences.map(({ name }) => name)).toContain('Intro (exit)');

    store.getState().undo(); // reverse exit
    expect(store.getState().project.documents[0]?.sequences).toHaveLength(1);

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('fails soft on unknown ids', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });

    expect(store.getState().createReverseExitSequence(id('missing'), 'x')).toBeNull();
    expect(store.getState().removeStateMachine(id('missing'))).toBe(false);
  });

  it('authors state and transition CRUD through the store, undoably, and fails soft on unknown ids', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });
    const machineId = store.getState().addModifierStateMachine({ name: 'Highlight', activeValues: [] });

    if (machineId === null) throw new Error('expected machine');

    const machineBefore = store
      .getState()
      .project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId);

    if (machineBefore === undefined) throw new Error('expected machine in project');

    const newState: projectFormatV1.State = {
      id: id('idle'),
      name: 'idle',
      values: [],
      entryActions: [],
      exitActions: [],
    };

    expect(store.getState().upsertState(machineId, newState)).toBe(true);
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.states,
    ).toHaveLength(3);

    store.getState().undo();
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.states,
    ).toHaveLength(2);

    expect(store.getState().upsertState(machineId, newState)).toBe(true);
    expect(store.getState().removeState(machineId, newState.id)).toBe(true);
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.states,
    ).toHaveLength(2);

    store.getState().undo(); // undoes removeState
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.states,
    ).toHaveLength(3);

    const newTransition: projectFormatV1.Transition = {
      id: id('extra-transition'),
      sourceStateId: machineBefore.initialStateId,
      targetStateId: machineBefore.initialStateId,
      trigger: { kind: 'event', eventId: id('extra-event') },
      priority: 1,
      actions: [],
    };

    expect(store.getState().upsertTransition(machineId, newTransition)).toBe(true);
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.transitions,
    ).toHaveLength(3);

    store.getState().undo();
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.transitions,
    ).toHaveLength(2);

    expect(store.getState().upsertTransition(machineId, newTransition)).toBe(true);
    expect(store.getState().removeTransition(machineId, newTransition.id)).toBe(true);
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.transitions,
    ).toHaveLength(2);

    store.getState().undo(); // undoes removeTransition
    expect(
      store.getState().project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId)
        ?.transitions,
    ).toHaveLength(3);

    const before = store.getState().project;

    expect(store.getState().upsertState(id('missing'), newState)).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().removeState(machineId, id('missing'))).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().upsertTransition(id('missing'), newTransition)).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().removeTransition(machineId, id('missing'))).toBe(false);
    expect(store.getState().project).toBe(before);

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });

  it('wires a reverse-exit sequence onto the deactivation transition through the store, undoably', () => {
    const store = createProjectEditorStore({ project: createMotionProject(), createId: idFactory() });
    const sequenceId = store.getState().addSequence({ name: 'Intro', durationTicks: 60 });

    if (sequenceId === null) throw new Error('expected sequence');

    const machineId = store.getState().addModifierStateMachine({ name: 'Highlight', activeValues: [] });

    if (machineId === null) throw new Error('expected machine');

    const reversedId = store
      .getState()
      .setModifierReverseExit({ stateMachineId: machineId, sourceSequenceId: sequenceId, name: 'Intro (exit)' });

    expect(reversedId).not.toBeNull();
    expect(store.getState().project.documents[0]?.sequences).toHaveLength(2);

    const machine = store
      .getState()
      .project.documents[0]?.stateMachines.find(({ id: candidateId }) => candidateId === machineId);

    if (machine === undefined) throw new Error('expected machine in project');

    const deactivationTransition = machine.transitions.find(
      ({ targetStateId }) => targetStateId === machine.initialStateId,
    );

    expect(deactivationTransition?.actions).toEqual([
      { kind: 'play-sequence', sequenceId: reversedId, behavior: 'restart' },
    ]);

    store.getState().undo();
    expect(store.getState().project.documents[0]?.sequences).toHaveLength(1);

    expect(
      store
        .getState()
        .setModifierReverseExit({ stateMachineId: id('missing'), sourceSequenceId: sequenceId, name: 'x' }),
    ).toBeNull();
    expect(
      store
        .getState()
        .setModifierReverseExit({ stateMachineId: machineId, sourceSequenceId: id('missing'), name: 'x' }),
    ).toBeNull();

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(store.getState().project)).toEqual([]);
  });
});
