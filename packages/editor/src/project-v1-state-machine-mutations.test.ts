import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { setLifecyclePhaseActionsInProject } from './project-v1-lifecycle-mutations';
import { reverseSequenceV1 } from './project-v1-reverse-sequence';
import { addSequenceInProject, createSequenceV1 } from './project-v1-sequence-mutations';
import {
  createModifierStateMachine,
  removeStateInProject,
  removeStateMachineInProject,
  removeTransitionInProject,
  setModifierReverseExitInProject,
  upsertStateInProject,
  upsertStateMachineInProject,
  upsertTransitionInProject,
} from './project-v1-state-machine-mutations';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function idFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`lc-${String(next++)}`);
}

/** Motion document with one element and one page-root instance, ready for animation authoring. */
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

describe('modifier state machine factory', () => {
  it('compiles a friendly modifier into an independent two-state machine', () => {
    const createId = idFactory();
    const { stateMachine, activateEventId, deactivateEventId } = createModifierStateMachine({
      name: 'Highlight',
      createId,
      activeValues: [
        {
          id: createId(),
          target: {
            entity: {
              projectId: id('project'),
              documentId: id('doc-1'),
              entityKind: 'element',
              entityId: id('headline'),
            },
            pointer: '/appearance/opacity',
          },
          value: { type: 'number', value: 0.5 },
        },
      ],
    });

    expect(stateMachine.states.map(({ name }) => name)).toEqual(['inactive', 'active']);
    expect(stateMachine.initialStateId).toBe(stateMachine.states[0]?.id);
    expect(stateMachine.transitions).toHaveLength(2);
    expect(stateMachine.transitions[0]?.trigger).toEqual({ kind: 'event', eventId: activateEventId });
    expect(stateMachine.transitions[1]?.trigger).toEqual({ kind: 'event', eventId: deactivateEventId });

    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    expect(project.documents[0]?.stateMachines).toHaveLength(1);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);
  });
});

describe('state machine transforms', () => {
  it('rejects duplicate transition priorities for the same source and trigger', () => {
    const createId = idFactory();
    const base = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const [activateTransition] = base.stateMachine.transitions;

    if (activateTransition === undefined) throw new Error('Expected the modifier activate transition');

    const duplicated: projectFormatV1.StateMachine = {
      ...base.stateMachine,
      transitions: [
        activateTransition,
        { ...activateTransition, id: createId() }, // same source, same trigger, same priority
      ],
    };
    const project = createMotionProject();
    const next = upsertStateMachineInProject({ project, documentId: id('doc-1'), stateMachine: duplicated });

    expect(next).toBe(project); // model 'state.duplicate-priority' rejects it
  });

  it('upserts by stable id and removes machines that are unreferenced', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const withMachine = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });
    const renamed = upsertStateMachineInProject({
      project: withMachine,
      documentId: id('doc-1'),
      stateMachine: { ...stateMachine, name: 'Renamed' },
    });

    expect(renamed.documents[0]?.stateMachines).toHaveLength(1);
    expect(renamed.documents[0]?.stateMachines[0]?.name).toBe('Renamed');

    const removed = removeStateMachineInProject({
      project: renamed,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
    });

    expect(removed.documents[0]?.stateMachines).toEqual([]);
  });

  it('rejects removal while a lifecycle send-event action still references the machine', () => {
    const createId = idFactory();
    const { stateMachine, activateEventId } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    let project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    project = addSequenceInProject({
      project,
      documentId: id('doc-1'),
      sequence: createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 }),
    });
    project = setLifecyclePhaseActionsInProject({
      project,
      documentId: id('doc-1'),
      phase: 'in',
      actions: [{ kind: 'send-event', stateMachineId: stateMachine.id, eventId: activateEventId }],
      createId,
    });

    const next = removeStateMachineInProject({ project, documentId: id('doc-1'), stateMachineId: stateMachine.id });

    expect(next).toBe(project);
  });
});

describe('state CRUD transforms', () => {
  it('upserts a new state by append and an existing state by replace, leaving other machines untouched', () => {
    const createId = idFactory();
    const first = createModifierStateMachine({ name: 'M1', createId, activeValues: [] });
    const second = createModifierStateMachine({ name: 'M2', createId, activeValues: [] });
    let project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine: first.stateMachine,
    });

    project = upsertStateMachineInProject({ project, documentId: id('doc-1'), stateMachine: second.stateMachine });

    const secondMachineBefore = project.documents[0]?.stateMachines.find(
      ({ id: machineId }) => machineId === second.stateMachine.id,
    );
    const newState: projectFormatV1.State = {
      id: createId(),
      name: 'idle',
      values: [],
      entryActions: [],
      exitActions: [],
    };
    const withNewState = upsertStateInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: first.stateMachine.id,
      state: newState,
    });
    const firstMachine = withNewState.documents[0]?.stateMachines.find(
      ({ id: machineId }) => machineId === first.stateMachine.id,
    );

    expect(firstMachine?.states).toHaveLength(3);
    expect(firstMachine?.states.at(-1)).toEqual(newState);
    expect(
      withNewState.documents[0]?.stateMachines.find(({ id: machineId }) => machineId === second.stateMachine.id),
    ).toBe(secondMachineBefore);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(withNewState)).toEqual([]);

    const renamedState: projectFormatV1.State = { ...newState, name: 'idle-renamed' };
    const withRenamedState = upsertStateInProject({
      project: withNewState,
      documentId: id('doc-1'),
      stateMachineId: first.stateMachine.id,
      state: renamedState,
    });
    const firstMachineRenamed = withRenamedState.documents[0]?.stateMachines.find(
      ({ id: machineId }) => machineId === first.stateMachine.id,
    );

    expect(firstMachineRenamed?.states).toHaveLength(3);
    expect(firstMachineRenamed?.states.at(-1)?.name).toBe('idle-renamed');
  });

  it('removes a non-referenced, non-initial state', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const idleState: projectFormatV1.State = {
      id: createId(),
      name: 'idle',
      values: [],
      entryActions: [],
      exitActions: [],
    };
    let project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    project = upsertStateInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      state: idleState,
    });

    const next = removeStateInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      stateId: idleState.id,
    });
    const machine = next.documents[0]?.stateMachines.find(({ id: machineId }) => machineId === stateMachine.id);

    expect(machine?.states.map(({ id: stateId }) => stateId)).not.toContain(idleState.id);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(next)).toEqual([]);
  });

  it('rejects removal of the initial state', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    const next = removeStateInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      stateId: stateMachine.initialStateId,
    });

    expect(next).toBe(project);
  });

  it('rejects removal of a state referenced by a transition', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const activeState = stateMachine.states[1];

    if (activeState === undefined) throw new Error('Expected the modifier active state');

    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    const next = removeStateInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      stateId: activeState.id,
    });

    expect(next).toBe(project);
  });
});

describe('transition CRUD transforms', () => {
  it('upserts a new transition by append and an existing transition by replace', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });
    const newTransition: projectFormatV1.Transition = {
      id: createId(),
      sourceStateId: stateMachine.initialStateId,
      targetStateId: stateMachine.initialStateId,
      trigger: { kind: 'event', eventId: createId() },
      priority: 1,
      actions: [],
    };
    const withNewTransition = upsertTransitionInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      transition: newTransition,
    });
    const machine = withNewTransition.documents[0]?.stateMachines.find(
      ({ id: machineId }) => machineId === stateMachine.id,
    );

    expect(machine?.transitions).toHaveLength(3);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(withNewTransition)).toEqual([]);

    const replacedTransition: projectFormatV1.Transition = { ...newTransition, priority: 2 };
    const withReplaced = upsertTransitionInProject({
      project: withNewTransition,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      transition: replacedTransition,
    });
    const machineReplaced = withReplaced.documents[0]?.stateMachines.find(
      ({ id: machineId }) => machineId === stateMachine.id,
    );

    expect(machineReplaced?.transitions).toHaveLength(3);
    expect(
      machineReplaced?.transitions.find(({ id: transitionId }) => transitionId === newTransition.id)?.priority,
    ).toBe(2);
  });

  it('rejects a transition that duplicates an existing [source, trigger, priority] tuple', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const [activateTransition] = stateMachine.transitions;

    if (activateTransition === undefined) throw new Error('Expected the modifier activate transition');

    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });
    const duplicate: projectFormatV1.Transition = { ...activateTransition, id: createId() };

    const next = upsertTransitionInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      transition: duplicate,
    });

    expect(next).toBe(project);
  });

  it('removes a transition', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const [, deactivateTransition] = stateMachine.transitions;

    if (deactivateTransition === undefined) throw new Error('Expected the modifier deactivate transition');

    const project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });

    const next = removeTransitionInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      transitionId: deactivateTransition.id,
    });
    const machine = next.documents[0]?.stateMachines.find(({ id: machineId }) => machineId === stateMachine.id);

    expect(machine?.transitions).toHaveLength(1);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(next)).toEqual([]);
  });
});

describe('setModifierReverseExitInProject', () => {
  it('adds the reversed sequence and wires it as the sole action on the deactivation transition', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    let project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine,
    });
    const source = createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 });

    project = addSequenceInProject({ project, documentId: id('doc-1'), sequence: source });

    const reversed = reverseSequenceV1({ sequence: source, name: 'Intro (exit)', createId });
    const next = setModifierReverseExitInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: stateMachine.id,
      reversedSequence: reversed,
    });

    expect(next.documents[0]?.sequences.map(({ id: sequenceId }) => sequenceId)).toContain(reversed.id);

    const machine = next.documents[0]?.stateMachines.find(({ id: machineId }) => machineId === stateMachine.id);
    const deactivationTransition = machine?.transitions.find(
      ({ targetStateId }) => targetStateId === stateMachine.initialStateId,
    );

    expect(deactivationTransition?.actions).toEqual([
      { kind: 'play-sequence', sequenceId: reversed.id, behavior: 'restart' },
    ]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(next)).toEqual([]);
  });

  it('no-ops when the machine has no unique deactivation transition', () => {
    const createId = idFactory();
    const { stateMachine } = createModifierStateMachine({ name: 'M', createId, activeValues: [] });
    const [activateTransition] = stateMachine.transitions;

    if (activateTransition === undefined) throw new Error('Expected the modifier activate transition');

    const noDeactivation: projectFormatV1.StateMachine = { ...stateMachine, transitions: [activateTransition] };
    let project = upsertStateMachineInProject({
      project: createMotionProject(),
      documentId: id('doc-1'),
      stateMachine: noDeactivation,
    });
    const source = createSequenceV1({ id: id('seq-1'), name: 'Intro', durationTicks: 60 });

    project = addSequenceInProject({ project, documentId: id('doc-1'), sequence: source });

    const reversed = reverseSequenceV1({ sequence: source, name: 'Intro (exit)', createId });
    const next = setModifierReverseExitInProject({
      project,
      documentId: id('doc-1'),
      stateMachineId: noDeactivation.id,
      reversedSequence: reversed,
    });

    expect(next).toBe(project);
  });
});
