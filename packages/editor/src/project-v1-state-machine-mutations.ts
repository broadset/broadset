import type { projectFormatV1 } from '@broadset/model';

import { isValidProject } from './store-actions/project-store-mutations';

type Project = projectFormatV1.BroadsetProjectV1;
type Document = projectFormatV1.BroadsetDocumentV1;
type Id = projectFormatV1.Id;

/**
 * Apply a document updater, validate, and commit — but preserve the original project reference when
 * the updater reports no change (returns the same document), so callers can treat a missing-target
 * mutation as a genuine no-op via identity equality.
 */
function commitDocument(project: Project, documentId: Id, updater: (document: Document) => Document): Project {
  const document = project.documents.find(({ id }) => id === documentId);

  if (document === undefined) return project;

  const nextDocument = updater(document);

  if (nextDocument === document) return project;

  const candidate: Project = {
    ...project,
    documents: project.documents.map((entry) => (entry.id === documentId ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : project;
}

export function upsertStateMachineInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachine: projectFormatV1.StateMachine;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    const exists = document.stateMachines.some(({ id }) => id === options.stateMachine.id);
    const stateMachines =
      exists ?
        document.stateMachines.map((machine) =>
          machine.id === options.stateMachine.id ? options.stateMachine : machine,
        )
      : [...document.stateMachines, options.stateMachine];

    return { ...document, stateMachines };
  });
}

/**
 * Locate the target machine and apply `updater`, returning the SAME document reference when the
 * machine id is absent or the updater reports no change — so `commitDocument` treats a
 * missing-target mutation as a genuine identity no-op rather than a validated-away change.
 */
function updateMachineInDocument(
  document: Document,
  machineId: Id,
  updater: (machine: projectFormatV1.StateMachine) => projectFormatV1.StateMachine,
): Document {
  const machine = document.stateMachines.find(({ id }) => id === machineId);

  if (machine === undefined) return document;

  const nextMachine = updater(machine);

  if (nextMachine === machine) return document;

  return {
    ...document,
    stateMachines: document.stateMachines.map((candidate) => (candidate.id === machineId ? nextMachine : candidate)),
  };
}

export function removeStateMachineInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    if (!document.stateMachines.some(({ id }) => id === options.stateMachineId)) return document;

    return { ...document, stateMachines: document.stateMachines.filter(({ id }) => id !== options.stateMachineId) };
  });
  // Nothing else in a document references a state machine by id, so this filter always succeeds —
  // there is no dangling-reference rejection path here (unlike state/transition removal below).
}

const MODIFIER_TRANSITION_PRIORITY = 0;

/** Friendly "modifier" compiles to an independent two-state machine; no binding collection exists. */
export function createModifierStateMachine(options: {
  readonly name: string;
  readonly createId: () => Id;
  readonly activeValues: readonly projectFormatV1.StateValue[];
}): {
  readonly stateMachine: projectFormatV1.StateMachine;
  readonly activateEventId: Id;
  readonly deactivateEventId: Id;
} {
  const inactiveId = options.createId();
  const activeId = options.createId();
  const activateEventId = options.createId();
  const deactivateEventId = options.createId();
  const stateMachine: projectFormatV1.StateMachine = {
    id: options.createId(),
    name: options.name,
    initialStateId: inactiveId,
    states: [
      { id: inactiveId, name: 'inactive', values: [], entryActions: [], exitActions: [] },
      { id: activeId, name: 'active', values: options.activeValues, entryActions: [], exitActions: [] },
    ],
    transitions: [
      {
        id: options.createId(),
        sourceStateId: inactiveId,
        targetStateId: activeId,
        trigger: { kind: 'event', eventId: activateEventId },
        priority: MODIFIER_TRANSITION_PRIORITY,
        actions: [],
      },
      {
        id: options.createId(),
        sourceStateId: activeId,
        targetStateId: inactiveId,
        trigger: { kind: 'event', eventId: deactivateEventId },
        priority: MODIFIER_TRANSITION_PRIORITY,
        actions: [],
      },
    ],
  };

  return { stateMachine, activateEventId, deactivateEventId };
}

export function upsertStateInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
  readonly state: projectFormatV1.State;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    updateMachineInDocument(document, options.stateMachineId, (machine) => {
      const exists = machine.states.some(({ id }) => id === options.state.id);
      const states =
        exists ?
          machine.states.map((state) => (state.id === options.state.id ? options.state : state))
        : [...machine.states, options.state];

      return { ...machine, states };
    }),
  );
}

export function removeStateInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
  readonly stateId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    updateMachineInDocument(document, options.stateMachineId, (machine) => {
      if (!machine.states.some(({ id }) => id === options.stateId)) return machine;

      return { ...machine, states: machine.states.filter(({ id }) => id !== options.stateId) };
    }),
  );
  // Removal of the initial state or a state still referenced by a transition source/target fails
  // semantic validation ('state.missing-initial' / 'state.missing-source' / 'state.missing-target'),
  // so commitDocument returns the original project — rejection, not a partial removal.
}

export function upsertTransitionInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
  readonly transition: projectFormatV1.Transition;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    updateMachineInDocument(document, options.stateMachineId, (machine) => {
      const exists = machine.transitions.some(({ id }) => id === options.transition.id);
      const transitions =
        exists ?
          machine.transitions.map((transition) =>
            transition.id === options.transition.id ? options.transition : transition,
          )
        : [...machine.transitions, options.transition];

      return { ...machine, transitions };
    }),
  );
  // A transition duplicating an existing [sourceStateId, trigger, priority] tuple fails
  // 'state.duplicate-priority' semantic validation, so commitDocument rejects it as a no-op.
}

export function removeTransitionInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
  readonly transitionId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) =>
    updateMachineInDocument(document, options.stateMachineId, (machine) => {
      if (!machine.transitions.some(({ id }) => id === options.transitionId)) return machine;

      return { ...machine, transitions: machine.transitions.filter(({ id }) => id !== options.transitionId) };
    }),
  );
}

const EXPECTED_DEACTIVATION_TRANSITION_COUNT = 1;

/**
 * Wire a pre-built reversed sequence onto a modifier machine's deactivation transition — the
 * unique transition whose targetStateId returns to the machine's initialStateId. Both the sequence
 * append and the transition rewrite land in one document updater so the play-sequence reference and
 * its target always validate together; if the machine is absent or the deactivation transition
 * isn't unique, the whole operation no-ops.
 */
export function setModifierReverseExitInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
  readonly reversedSequence: projectFormatV1.Sequence;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    const machine = document.stateMachines.find(({ id }) => id === options.stateMachineId);

    if (machine === undefined) return document;

    const deactivationTransitions = machine.transitions.filter(
      ({ targetStateId }) => targetStateId === machine.initialStateId,
    );

    if (deactivationTransitions.length !== EXPECTED_DEACTIVATION_TRANSITION_COUNT) return document;

    const [deactivationTransition] = deactivationTransitions;

    if (deactivationTransition === undefined) return document;

    const nextMachine: projectFormatV1.StateMachine = {
      ...machine,
      transitions: machine.transitions.map((transition) =>
        transition.id === deactivationTransition.id ?
          {
            ...transition,
            actions: [{ kind: 'play-sequence', sequenceId: options.reversedSequence.id, behavior: 'restart' }],
          }
        : transition,
      ),
    };

    return {
      ...document,
      sequences: [...document.sequences, options.reversedSequence],
      stateMachines: document.stateMachines.map((candidate) =>
        candidate.id === options.stateMachineId ? nextMachine : candidate,
      ),
    };
  });
}
