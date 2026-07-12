import { projectFormatV1 } from '@broadset/model';
import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { EditingMode, PlacementPoint, PlacementState } from '../editing-state';
import { removeDocumentElementsV1 } from '../project-v1-mutations';
import { updateElementRectV1 } from '../v1-element-geometry';
import type { ProjectReorderDirection } from './project-store-mutations';
import {
  insertElementIntoProject,
  insertPageIntoProject,
  removePageFromProject,
  reorderElementInProject,
  reparentElementInProject,
  setPageRootVisibilityInProject,
  updateDocumentInProject,
  updateElementInProject,
  updateElementsInProject,
} from './project-store-mutations';

export type { ProjectReorderDirection } from './project-store-mutations';

export interface ProjectElementUpdateV1 {
  readonly position?: { readonly x: number; readonly y: number };
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly name?: string;
}

interface ProjectHistoryState {
  readonly project: projectFormatV1.BroadsetProjectV1;
}

export interface ProjectEditorState {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly activeDocumentId: projectFormatV1.Id;
  readonly activePageId: projectFormatV1.Id;
  readonly activeElementIds: readonly projectFormatV1.Id[];
  readonly placement: PlacementState | null;
  readonly placementPreview: PlacementPoint | null;
  readonly pathEditingElementId: projectFormatV1.Id | null;
  readonly pathDrawingElementId: projectFormatV1.Id | null;
  readonly clipPathEditingElementId: projectFormatV1.Id | null;
  readonly motionPathEditingElementId: projectFormatV1.Id | null;
  readonly inlineTextEditingElementId: projectFormatV1.Id | null;
  readonly editingMode: EditingMode;
  readonly setProject: (project: projectFormatV1.BroadsetProjectV1) => void;
  readonly getProject: () => projectFormatV1.BroadsetProjectV1;
  readonly setActiveDocument: (documentId: projectFormatV1.Id) => boolean;
  readonly setActivePage: (pageId: projectFormatV1.Id) => boolean;
  readonly addPage: (page: projectFormatV1.PageDefinition) => boolean;
  readonly removePage: (pageId: projectFormatV1.Id) => boolean;
  readonly setPageRootVisibility: (elementId: projectFormatV1.Id, visible: boolean) => boolean;
  readonly updateActiveDocument: (
    updater: (document: projectFormatV1.BroadsetDocumentV1) => projectFormatV1.BroadsetDocumentV1,
  ) => boolean;
  readonly setActiveElements: (elementIds: readonly projectFormatV1.Id[]) => void;
  readonly selectElement: (elementId: projectFormatV1.Id | null) => void;
  readonly toggleSelectElement: (elementId: projectFormatV1.Id) => void;
  readonly enterPathEditing: (elementId: projectFormatV1.Id) => void;
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
  readonly updateElementEphemeral: (
    elementId: projectFormatV1.Id,
    update: ProjectElementUpdateV1,
  ) => boolean;
  readonly commitElementUpdate: (
    elementId: projectFormatV1.Id,
    update: ProjectElementUpdateV1,
  ) => boolean;
  readonly commitGroupMove: (
    updates: readonly {
      readonly elementId: projectFormatV1.Id;
      readonly position: { readonly x: number; readonly y: number };
    }[],
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

function applyProjectElementUpdate(
  element: projectFormatV1.Element,
  update: ProjectElementUpdateV1,
): projectFormatV1.Element {
  const geometryUpdated = updateElementRectV1(element, {
    ...(update.position === undefined ? {} : { x: update.position.x, y: update.position.y }),
    ...(update.width === undefined ? {} : { width: update.width }),
    ...(update.height === undefined ? {} : { height: update.height }),
    ...(update.rotation === undefined ? {} : { rotation: update.rotation }),
  });

  return update.name === undefined || update.name === geometryUpdated.name
    ? geometryUpdated
    : { ...geometryUpdated, name: update.name };
}

function createSelectionUpdate(
  state: ProjectEditorState,
  elementIds: readonly projectFormatV1.Id[],
): Partial<ProjectEditorState> {
  const activeElementIds = filterElementIds(state.project, state.activeDocumentId, elementIds);
  const editingElementId =
    state.pathEditingElementId ??
    state.pathDrawingElementId ??
    state.clipPathEditingElementId ??
    state.motionPathEditingElementId ??
    state.inlineTextEditingElementId;
  const preservesEditing =
    editingElementId !== null && activeElementIds.length === 1 && activeElementIds[0] === editingElementId;

  return preservesEditing
    ? { activeElementIds }
    : {
        activeElementIds,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
      };
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
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
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
        addPage(page: projectFormatV1.PageDefinition): boolean {
          let added = false;

          set((state) => {
            const project = insertPageIntoProject({
              project: state.project,
              documentId: state.activeDocumentId,
              page,
            });

            if (project === state.project) return {};

            added = true;

            return { project };
          });

          return added;
        },
        removePage(pageId: projectFormatV1.Id): boolean {
          let removed = false;

          set((state) => {
            const project = removePageFromProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId,
            });

            if (project === state.project) return {};

            const document = project.documents.find((candidate) => candidate.id === state.activeDocumentId);
            const activePageId = state.activePageId === pageId ? document?.pages[0]?.id : state.activePageId;

            if (activePageId === undefined) return {};

            removed = true;

            return { project, activePageId, activeElementIds: [] };
          });

          return removed;
        },
        setPageRootVisibility(elementId: projectFormatV1.Id, visible: boolean): boolean {
          let updated = false;

          set((state) => {
            const project = setPageRootVisibilityInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId: state.activePageId,
              elementId,
              visible,
            });

            if (project === state.project) return {};

            updated = true;

            return { project };
          });

          return updated;
        },
        updateActiveDocument(
          updater: (document: projectFormatV1.BroadsetDocumentV1) => projectFormatV1.BroadsetDocumentV1,
        ): boolean {
          let updated = false;

          set((state) => {
            const project = updateDocumentInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              updater,
            });

            if (project === state.project) return {};

            updated = true;

            return { project };
          });

          return updated;
        },
        setActiveElements(elementIds: readonly projectFormatV1.Id[]): void {
          set((state) => createSelectionUpdate(state, elementIds));
        },
        selectElement(elementId: projectFormatV1.Id | null): void {
          set((state) => createSelectionUpdate(state, elementId === null ? [] : [elementId]));
        },
        toggleSelectElement(elementId: projectFormatV1.Id): void {
          set((state) => {
            const elementIds = state.activeElementIds.includes(elementId)
              ? state.activeElementIds.filter((activeId) => activeId !== elementId)
              : [...state.activeElementIds, elementId];

            return createSelectionUpdate(state, elementIds);
          });
        },
        enterPathEditing(elementId: projectFormatV1.Id): void {
          set((state) => {
            const selection = filterElementIds(state.project, state.activeDocumentId, [elementId]);

            return selection.length === 0
              ? {}
              : {
                  activeElementIds: selection,
                  pathEditingElementId: elementId,
                  pathDrawingElementId: null,
                  clipPathEditingElementId: null,
                  motionPathEditingElementId: null,
                  inlineTextEditingElementId: null,
                  editingMode: { type: 'path-editing', elementId },
                };
          });
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
        updateElementEphemeral(elementId: projectFormatV1.Id, update: ProjectElementUpdateV1): boolean {
          let updated = false;

          temporalReference.current?.getState().pause();

          try {
            set((state) => {
              const project = updateElementInProject({
                project: state.project,
                documentId: state.activeDocumentId,
                elementId,
                updater: (element) => applyProjectElementUpdate(element, update),
              });

              if (project === state.project) return {};

              updated = true;

              return { project };
            });
          } finally {
            temporalReference.current?.getState().resume();
          }

          return updated;
        },
        commitElementUpdate(elementId: projectFormatV1.Id, update: ProjectElementUpdateV1): boolean {
          return get().updateElement(elementId, (element) => applyProjectElementUpdate(element, update));
        },
        commitGroupMove(
          updates: readonly {
            readonly elementId: projectFormatV1.Id;
            readonly position: { readonly x: number; readonly y: number };
          }[],
        ): boolean {
          const positions = new Map(updates.map((update) => [update.elementId, update.position]));
          let moved = false;

          set((state) => {
            const project = updateElementsInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              elementIds: new Set(positions.keys()),
              updater: (element) => {
                const position = positions.get(element.id);

                return position === undefined ? element : updateElementRectV1(element, position);
              },
            });

            if (project === state.project) return {};

            moved = true;

            return { project };
          });

          return moved;
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
