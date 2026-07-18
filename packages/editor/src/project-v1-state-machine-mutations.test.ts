import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { setLifecyclePhaseActionsInProject } from './project-v1-lifecycle-mutations';
import { addSequenceInProject, createSequenceV1 } from './project-v1-sequence-mutations';
import {
  createModifierStateMachine,
  removeStateMachineInProject,
  upsertStateMachineInProject,
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
