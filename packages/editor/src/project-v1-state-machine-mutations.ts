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

export function removeStateMachineInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly stateMachineId: Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    if (!document.stateMachines.some(({ id }) => id === options.stateMachineId)) return document;

    return { ...document, stateMachines: document.stateMachines.filter(({ id }) => id !== options.stateMachineId) };
  });
  // Dangling send-event references (lifecycle, entry/exit actions, transitions) fail semantic
  // validation, so commitDocument returns the original project — removal is rejected, not partial.
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
