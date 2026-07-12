import { projectFormatV1 } from '@broadset/model';
import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { removeDocumentElementsV1 } from '../project-v1-mutations';

interface ProjectHistoryState {
  readonly project: projectFormatV1.BroadsetProjectV1;
}

export type ProjectReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface ProjectEditorState {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly activeDocumentId: projectFormatV1.Id;
  readonly activePageId: projectFormatV1.Id;
  readonly activeElementIds: readonly projectFormatV1.Id[];
  readonly setProject: (project: projectFormatV1.BroadsetProjectV1) => void;
  readonly getProject: () => projectFormatV1.BroadsetProjectV1;
  readonly setActiveDocument: (documentId: projectFormatV1.Id) => boolean;
  readonly setActivePage: (pageId: projectFormatV1.Id) => boolean;
  readonly setActiveElements: (elementIds: readonly projectFormatV1.Id[]) => void;
  readonly addElement: (element: projectFormatV1.Element) => projectFormatV1.Id | null;
  readonly updateElement: (
    elementId: projectFormatV1.Id,
    updater: (element: projectFormatV1.Element) => projectFormatV1.Element,
  ) => boolean;
  readonly reparentElement: (
    elementId: projectFormatV1.Id,
    parentId: projectFormatV1.Id | null,
  ) => boolean;
  readonly reorderElement: (
    elementId: projectFormatV1.Id,
    direction: ProjectReorderDirection,
  ) => boolean;
  readonly removeElements: (elementIds: readonly projectFormatV1.Id[]) => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

export type ProjectEditorStore = StoreApi<ProjectEditorState> & {
  readonly temporal: StoreApi<TemporalState<ProjectHistoryState>>;
};

export interface CreateProjectEditorStoreOptions {
  readonly project?: projectFormatV1.BroadsetProjectV1;
  readonly maxUndoSteps?: number;
}

const DEFAULT_MAX_UNDO_STEPS = 50;

function resolveInitialLocation(project: projectFormatV1.BroadsetProjectV1): {
  readonly activeDocumentId: projectFormatV1.Id;
  readonly activePageId: projectFormatV1.Id;
} {
  const document = project.documents[0];

  if (document === undefined) throw new Error('A v1 project must contain at least one document');

  const page = document.pages[0];

  if (page === undefined) throw new Error('A v1 document must contain at least one page');

  return { activeDocumentId: document.id, activePageId: page.id };
}

function filterElementIds(
  project: projectFormatV1.BroadsetProjectV1,
  documentId: projectFormatV1.Id,
  elementIds: readonly projectFormatV1.Id[],
): readonly projectFormatV1.Id[] {
  const document = project.documents.find((candidate) => candidate.id === documentId);

  if (document === undefined) return [];

  const existingIds = new Set(document.elements.map((element) => element.id));

  return elementIds.filter((elementId) => existingIds.has(elementId));
}

function isValidProject(project: projectFormatV1.BroadsetProjectV1): boolean {
  const hasStructuralFailure = projectFormatV1
    .parseProjectV1Unknown(project)
    .diagnostics.some((diagnostic) => diagnostic.code === 'structural-invalid');

  return !hasStructuralFailure && projectFormatV1.validateBroadsetProjectV1Semantics(project).length === 0;
}

function insertElementIntoProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly element: projectFormatV1.Element;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);

  if (document === undefined || document.elements.some((element) => element.id === options.element.id)) {
    return options.project;
  }

  const hasValidParent =
    options.element.parentId === null ||
    document.elements.some((element) => element.id === options.element.parentId && element.kind === 'group');

  if (!hasValidParent) return options.project;

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: [...document.elements, options.element],
    pages: document.pages.map((page) => ({
      ...page,
      rootInstances:
        page.id === options.pageId && options.element.parentId === null
          ? [
              ...page.rootInstances,
              {
                id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
                elementId: options.element.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ]
          : page.rootInstances,
    })),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === options.documentId ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

function updateElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly updater: (element: projectFormatV1.Element) => projectFormatV1.Element;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined) return options.project;

  const nextElement = options.updater(element);

  if (nextElement === element || nextElement.id !== element.id) return options.project;

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate) => (candidate.id === element.id ? nextElement : candidate)),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

function collectSubtreeIds(
  elements: readonly projectFormatV1.Element[],
  rootElementId: projectFormatV1.Id,
): ReadonlySet<projectFormatV1.Id> {
  const subtreeIds = new Set<projectFormatV1.Id>([rootElementId]);
  let previousSize = -1;

  while (previousSize !== subtreeIds.size) {
    previousSize = subtreeIds.size;
    elements.forEach((element) => {
      if (element.parentId !== null && subtreeIds.has(element.parentId)) subtreeIds.add(element.id);
    });
  }

  return subtreeIds;
}

function reparentElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined || element.parentId === options.parentId) return options.project;

  const subtreeIds = collectSubtreeIds(document.elements, element.id);
  const parent =
    options.parentId === null ? undefined : document.elements.find((candidate) => candidate.id === options.parentId);

  if (options.parentId !== null && (parent?.kind !== 'group' || subtreeIds.has(options.parentId))) {
    return options.project;
  }

  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate) =>
      candidate.id === element.id ? { ...candidate, parentId: options.parentId } : candidate,
    ),
    pages: document.pages.map((page) => {
      const withoutMovedRoot = page.rootInstances.filter((instance) => instance.elementId !== element.id);
      const shouldAddRoot = element.parentId !== null && options.parentId === null && page.id === options.pageId;
      let rootInstances = page.rootInstances;

      if (options.parentId !== null) rootInstances = withoutMovedRoot;

      if (shouldAddRoot) {
        rootInstances = [
          ...withoutMovedRoot,
          {
            id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
            elementId: element.id,
            overrides: [],
            componentPropertyValues: [],
          },
        ];
      }

      return {
        ...page,
        rootInstances,
        descendantOverrides: page.descendantOverrides.filter(
          (entry) => !subtreeIds.has(entry.address.elementId),
        ),
      };
    }),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

function resolveReorderDestination(options: {
  readonly currentIndex: number;
  readonly lastIndex: number;
  readonly direction: ProjectReorderDirection;
}): number {
  switch (options.direction) {
    case 'back':
      return 0;
    case 'backward':
      return Math.max(0, options.currentIndex - 1);
    case 'forward':
      return Math.min(options.lastIndex, options.currentIndex + 1);
    case 'front':
      return options.lastIndex;
  }
}

function reorderElementInProject(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly elementId: projectFormatV1.Id;
  readonly direction: ProjectReorderDirection;
}): projectFormatV1.BroadsetProjectV1 {
  const document = options.project.documents.find((candidate) => candidate.id === options.documentId);
  const element = document?.elements.find((candidate) => candidate.id === options.elementId);

  if (document === undefined || element === undefined) return options.project;

  const siblingIndexes = document.elements
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.parentId === element.parentId)
    .map(({ index }) => index);
  const siblings = siblingIndexes.map((index) => document.elements[index]).filter((candidate) => candidate !== undefined);
  const currentIndex = siblings.findIndex((candidate) => candidate.id === element.id);
  const destinationIndex = resolveReorderDestination({
    currentIndex,
    lastIndex: siblings.length - 1,
    direction: options.direction,
  });

  if (currentIndex < 0 || currentIndex === destinationIndex) return options.project;

  const reorderedSiblings = [...siblings];
  const removed = reorderedSiblings.splice(currentIndex, 1)[0];

  if (removed === undefined) return options.project;

  reorderedSiblings.splice(destinationIndex, 0, removed);

  const replacements = new Map(
    siblingIndexes.map((elementIndex, siblingIndex) => [elementIndex, reorderedSiblings[siblingIndex]]),
  );
  const nextDocument: projectFormatV1.BroadsetDocumentV1 = {
    ...document,
    elements: document.elements.map((candidate, index) => replacements.get(index) ?? candidate),
  };
  const candidate: projectFormatV1.BroadsetProjectV1 = {
    ...options.project,
    documents: options.project.documents.map((entry) => (entry.id === document.id ? nextDocument : entry)),
  };

  return isValidProject(candidate) ? candidate : options.project;
}

export function createProjectEditorStore(
  options: CreateProjectEditorStoreOptions = {},
): ProjectEditorStore {
  const initialProject = options.project ?? projectFormatV1.createProjectV1();
  const initialLocation = resolveInitialLocation(initialProject);
  const temporalReference: { current: StoreApi<TemporalState<ProjectHistoryState>> | null } = { current: null };
  const store: ProjectEditorStore = createStore<ProjectEditorState>()(
    temporal(
      (set, get) => ({
        project: initialProject,
        ...initialLocation,
        activeElementIds: [],
        setProject(project: projectFormatV1.BroadsetProjectV1): void {
          const location = resolveInitialLocation(project);

          set({ project, ...location, activeElementIds: [] });
          temporalReference.current?.getState().clear();
        },
        getProject(): projectFormatV1.BroadsetProjectV1 {
          return get().project;
        },
        setActiveDocument(documentId: projectFormatV1.Id): boolean {
          let activated = false;

          set((state) => {
            const document = state.project.documents.find((candidate) => candidate.id === documentId);
            const page = document?.pages[0];

            if (document === undefined || page === undefined) return {};

            activated = true;

            return {
              activeDocumentId: document.id,
              activePageId: page.id,
              activeElementIds: [],
            };
          });

          return activated;
        },
        setActivePage(pageId: projectFormatV1.Id): boolean {
          let activated = false;

          set((state) => {
            const document = state.project.documents.find(
              (candidate) => candidate.id === state.activeDocumentId,
            );

            if (document?.pages.some((page) => page.id === pageId) !== true) return {};

            activated = true;

            return { activePageId: pageId, activeElementIds: [] };
          });

          return activated;
        },
        setActiveElements(elementIds: readonly projectFormatV1.Id[]): void {
          set((state) => ({
            activeElementIds: filterElementIds(state.project, state.activeDocumentId, elementIds),
          }));
        },
        addElement(element: projectFormatV1.Element): projectFormatV1.Id | null {
          let addedElementId: projectFormatV1.Id | null = null;

          set((state) => {
            const project = insertElementIntoProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId: state.activePageId,
              element,
            });

            if (project === state.project) return {};

            addedElementId = element.id;

            return { project, activeElementIds: [element.id] };
          });

          return addedElementId;
        },
        updateElement(
          elementId: projectFormatV1.Id,
          updater: (element: projectFormatV1.Element) => projectFormatV1.Element,
        ): boolean {
          let updated = false;

          set((state) => {
            const project = updateElementInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              elementId,
              updater,
            });

            if (project === state.project) return {};

            updated = true;

            return { project };
          });

          return updated;
        },
        reparentElement(elementId: projectFormatV1.Id, parentId: projectFormatV1.Id | null): boolean {
          let reparented = false;

          set((state) => {
            const project = reparentElementInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId: state.activePageId,
              elementId,
              parentId,
            });

            if (project === state.project) return {};

            reparented = true;

            return { project };
          });

          return reparented;
        },
        reorderElement(elementId: projectFormatV1.Id, direction: ProjectReorderDirection): boolean {
          let reordered = false;

          set((state) => {
            const project = reorderElementInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              elementId,
              direction,
            });

            if (project === state.project) return {};

            reordered = true;

            return { project };
          });

          return reordered;
        },
        removeElements(elementIds: readonly projectFormatV1.Id[]): void {
          set((state) => {
            const project = removeDocumentElementsV1({
              project: state.project,
              documentId: state.activeDocumentId,
              elementIds,
            });

            return project === state.project
              ? {}
              : {
                  project,
                  activeElementIds: filterElementIds(project, state.activeDocumentId, state.activeElementIds),
                };
          });
        },
        undo(): void {
          temporalReference.current?.getState().undo();
        },
        redo(): void {
          temporalReference.current?.getState().redo();
        },
      }),
      {
        partialize: (state) => ({ project: state.project }),
        limit: options.maxUndoSteps ?? DEFAULT_MAX_UNDO_STEPS,
        equality: (previous, current) => previous.project === current.project,
      },
    ),
  );

  temporalReference.current = store.temporal;

  return store;
}
