import type { projectFormatV1 } from '@broadset/model';

import { isValidProject } from './store-actions/project-store-mutations';

type Project = projectFormatV1.BroadsetProjectV1;
type Document = projectFormatV1.BroadsetDocumentV1;
type Id = projectFormatV1.Id;

export type LifecyclePhase = 'in' | 'hold' | 'update' | 'out';

const EMPTY_PHASES = { in: [], hold: [], update: [], out: [] } as const;

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

function isLifecycleEmpty(lifecycle: projectFormatV1.LifecycleDefinition): boolean {
  return (
    lifecycle.in.length === 0 &&
    lifecycle.hold.length === 0 &&
    lifecycle.update.length === 0 &&
    lifecycle.out.length === 0
  );
}

/** IN/HOLD/UPDATE/OUT are fixed slots, not removable custom states (animation-state.md). */
export function setLifecyclePhaseActionsInProject(options: {
  readonly project: Project;
  readonly documentId: Id;
  readonly phase: LifecyclePhase;
  readonly actions: readonly projectFormatV1.SequenceAction[];
  readonly createId: () => Id;
}): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    const current = document.lifecycle ?? { id: options.createId(), ...EMPTY_PHASES };
    const next: projectFormatV1.LifecycleDefinition = { ...current, [options.phase]: options.actions };

    if (isLifecycleEmpty(next)) {
      if (document.lifecycle === undefined) return document;

      const { lifecycle: _drop, ...withoutLifecycle } = document;

      return withoutLifecycle;
    }

    return { ...document, lifecycle: next };
  });
}

export function clearLifecycleInProject(options: { readonly project: Project; readonly documentId: Id }): Project {
  return commitDocument(options.project, options.documentId, (document) => {
    if (document.lifecycle === undefined) return document;

    const { lifecycle: _drop, ...withoutLifecycle } = document;

    return withoutLifecycle;
  });
}
