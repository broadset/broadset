import { type EditorConfig, projectFormatV1 } from '@broadset/model';
import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { EditingMode, PlacementPoint, PlacementState } from '../editing-state';
import { removeDocumentElementsV1 } from '../project-v1-mutations';
import { updateElementRectV1 } from '../v1-element-geometry';
import {
  createProjectEditorClipboardState,
  type ProjectClipboardPortV1,
  type ProjectEditorClipboardState,
} from './project-store-clipboard';
import { createProjectEditorEditingActions } from './project-store-editing';
import {
  applyProjectElementUpdate,
  type ProjectElementUpdateV1,
} from './project-store-element-update';
import type { ProjectReorderDirection } from './project-store-mutations';
import {
  insertElementIntoProject,
  isValidProject,
  movePageRootInstanceInProject,
  reorderElementInProject,
  reorderPageRootInstanceInProject,
  reparentElementInProject,
  updateElementInProject,
  updateElementsInProject,
} from './project-store-mutations';
import { createProjectEditorNavigationActions } from './project-store-navigation';
import {
  createProjectEditorPlaybackState,
  type ProjectEditorPlaybackState,
  resolvePreviewSequenceId,
} from './project-store-playback';
import { resolveRequiredElementIds } from './project-store-required';
import {
  createProjectEditorSelectionActions,
  filterInstanceAddresses,
  firstInstanceAddressForElement,
} from './project-store-selection';
import {
  createProjectEditorSnapshotState,
  type ProjectEditorSnapshotState,
} from './project-store-snapshots';
import { createProjectEditorUiState, type ProjectEditorUiState } from './project-store-ui';

export type { ProjectClipboardPortV1 } from './project-store-clipboard';
export type { ProjectElementUpdateV1 } from './project-store-element-update';
export type { ProjectReorderDirection } from './project-store-mutations';

type ProjectHistoryState = Pick<ProjectEditorState, 'blobs' | 'project'>;

export interface ProjectEditorState
  extends ProjectEditorUiState,
    ProjectEditorClipboardState,
    ProjectEditorPlaybackState,
    ProjectEditorSnapshotState {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly activeDocumentId: projectFormatV1.Id;
  readonly activePageId: projectFormatV1.Id;
  readonly activeInstanceAddresses: readonly projectFormatV1.InstanceAddress[];
  readonly placement: PlacementState | null;
  readonly placementPreview: PlacementPoint | null;
  readonly pathEditingElementId: projectFormatV1.Id | null;
  readonly pathDrawingElementId: projectFormatV1.Id | null;
  readonly clipPathEditingElementId: projectFormatV1.Id | null;
  readonly motionPathEditingElementId: projectFormatV1.Id | null;
  readonly inlineTextEditingElementId: projectFormatV1.Id | null;
  readonly editingMode: EditingMode;
  readonly setProject: (
    project: projectFormatV1.BroadsetProjectV1,
    blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>,
  ) => boolean;
  readonly getProject: () => projectFormatV1.BroadsetProjectV1;
  readonly setActiveDocument: (documentId: projectFormatV1.Id) => boolean;
  readonly setActivePage: (pageId: projectFormatV1.Id) => boolean;
  readonly switchPage: (index: number) => boolean;
  readonly addPage: (page: projectFormatV1.PageDefinition) => boolean;
  readonly removePage: (pageId: projectFormatV1.Id) => boolean;
  readonly setPageRootVisibility: (rootInstanceId: projectFormatV1.Id, visible: boolean) => boolean;
  readonly updateActiveDocument: (
    updater: (document: projectFormatV1.BroadsetDocumentV1) => projectFormatV1.BroadsetDocumentV1,
  ) => boolean;
  readonly setActiveElements: (elementIds: readonly projectFormatV1.Id[]) => void;
  readonly selectElement: (elementId: projectFormatV1.Id | null) => void;
  readonly toggleSelectElement: (elementId: projectFormatV1.Id) => void;
  readonly setActiveInstances: (addresses: readonly projectFormatV1.InstanceAddress[]) => void;
  readonly selectInstance: (address: projectFormatV1.InstanceAddress | null) => void;
  readonly toggleSelectInstance: (address: projectFormatV1.InstanceAddress) => void;
  readonly beginPlacement: (elementType: string) => void;
  readonly updatePlacement: (placement: PlacementState, preview?: PlacementPoint | null) => void;
  readonly cancelPlacement: () => void;
  readonly enterPathEditing: (elementId: projectFormatV1.Id) => void;
  readonly enterClipPathEditing: (elementId: projectFormatV1.Id) => void;
  readonly startPathDrawing: (elementId: projectFormatV1.Id) => void;
  readonly finishPathDrawing: () => void;
  readonly addElement: (element: projectFormatV1.Element) => projectFormatV1.Id | null;
  readonly updateElement: (
    elementId: projectFormatV1.Id,
    updater: (element: projectFormatV1.Element) => projectFormatV1.Element,
  ) => boolean;
  readonly reparentElement: (elementId: projectFormatV1.Id, parentId: projectFormatV1.Id | null) => boolean;
  readonly reorderElement: (elementId: projectFormatV1.Id, direction: ProjectReorderDirection) => boolean;
  readonly reorderRootInstance: (
    rootInstanceId: projectFormatV1.Id,
    direction: ProjectReorderDirection,
  ) => boolean;
  readonly moveRootInstance: (
    rootInstanceId: projectFormatV1.Id,
    targetRootInstanceId: projectFormatV1.Id,
    position: 'before' | 'after',
  ) => boolean;
  readonly updateElementEphemeral: (elementId: projectFormatV1.Id, update: ProjectElementUpdateV1) => boolean;
  readonly commitElementUpdate: (elementId: projectFormatV1.Id, update: ProjectElementUpdateV1) => boolean;
  readonly commitGroupMove: (
    updates: readonly {
      readonly elementId: projectFormatV1.Id;
      readonly position: { readonly x: number; readonly y: number };
    }[],
  ) => boolean;
  readonly removeElements: (elementIds: readonly projectFormatV1.Id[]) => void;
  readonly removeElement: (elementId: projectFormatV1.Id) => void;
  readonly toggleLock: (elementId: projectFormatV1.Id) => boolean;
  readonly toggleVisibility: (elementId: projectFormatV1.Id) => boolean;
  readonly toggleInstanceVisibility: (address: projectFormatV1.InstanceAddress) => boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

export type ProjectEditorStore = StoreApi<ProjectEditorState> & {
  readonly temporal: StoreApi<TemporalState<ProjectHistoryState>>;
};

export interface CreateProjectEditorStoreOptions {
  readonly project?: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly maxUndoSteps?: number;
  readonly config?: Partial<EditorConfig>;
  readonly createId?: (() => projectFormatV1.Id) | undefined;
  readonly now?: (() => string) | undefined;
  readonly clipboard?: ProjectClipboardPortV1 | undefined;
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

export function createProjectEditorStore(options: CreateProjectEditorStoreOptions = {}): ProjectEditorStore {
  const initialProject = options.project ?? projectFormatV1.createProjectV1();
  const initialLocation = resolveInitialLocation(initialProject);
  const requiredElementIds = resolveRequiredElementIds(options.config);
  const createId = options.createId ?? (() => projectFormatV1.idSchema.parse(crypto.randomUUID()));
  const now = options.now ?? (() => new Date().toISOString());
  const initialSequenceId = resolvePreviewSequenceId({
    project: initialProject,
    documentId: initialLocation.activeDocumentId,
    pageId: initialLocation.activePageId,
  });
  const temporalReference: { current: StoreApi<TemporalState<ProjectHistoryState>> | null } = { current: null };
  const store: ProjectEditorStore = createStore<ProjectEditorState>()(
    temporal(
      (set, get) => ({
        project: initialProject,
        blobs: options.blobs ?? new Map<projectFormatV1.Sha256Digest, Uint8Array>(),
        ...initialLocation,
        activeInstanceAddresses: [],
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
        ...createProjectEditorUiState((updater) => {
          set((state) => updater(state));
        }, options.config),
        ...createProjectEditorSnapshotState(set, { createId, now }),
        ...createProjectEditorClipboardState({ getState: get, setState: set }, { createId, port: options.clipboard }),
        ...createProjectEditorPlaybackState({ getState: get, setState: set }, initialSequenceId),
        setProject(
          project: projectFormatV1.BroadsetProjectV1,
          blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map(),
        ): boolean {
          if (!isValidProject(project)) return false;

          const location = resolveInitialLocation(project);
          const playbackSequenceId = resolvePreviewSequenceId({
            project,
            documentId: location.activeDocumentId,
            pageId: location.activePageId,
          });

          set({
            project,
            blobs,
            ...location,
            activeInstanceAddresses: [],
            placement: null,
            placementPreview: null,
            pathEditingElementId: null,
            pathDrawingElementId: null,
            clipPathEditingElementId: null,
            motionPathEditingElementId: null,
            inlineTextEditingElementId: null,
            editingMode: { type: 'none' },
            editingGuideId: null,
            snapshots: [],
            playbackSequenceId,
            playbackTick: 0,
            playbackPlaying: false,
          });
          temporalReference.current?.getState().clear();

          return true;
        },
        getProject(): projectFormatV1.BroadsetProjectV1 {
          return get().project;
        },
        ...createProjectEditorNavigationActions({ getState: get, setState: set }),
        ...createProjectEditorSelectionActions(set),
        ...createProjectEditorEditingActions(set, firstInstanceAddressForElement),
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

            const address = firstInstanceAddressForElement({ ...state, project }, element.id);

            return {
              project,
              activeInstanceAddresses: address === undefined ? [] : [address],
            };
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
        reorderRootInstance(rootInstanceId: projectFormatV1.Id, direction: ProjectReorderDirection): boolean {
          let reordered = false;

          set((state) => {
            const project = reorderPageRootInstanceInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId: state.activePageId,
              rootInstanceId,
              direction,
            });

            if (project === state.project) return {};

            reordered = true;

            return { project };
          });

          return reordered;
        },
        moveRootInstance(
          rootInstanceId: projectFormatV1.Id,
          targetRootInstanceId: projectFormatV1.Id,
          position: 'before' | 'after',
        ): boolean {
          let moved = false;

          set((state) => {
            const project = movePageRootInstanceInProject({
              project: state.project,
              documentId: state.activeDocumentId,
              pageId: state.activePageId,
              rootInstanceId,
              targetRootInstanceId,
              position,
            });

            if (project === state.project) return {};

            moved = true;

            return { project };
          });

          return moved;
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
              requiredElementIds,
            });

            return project === state.project ?
                {}
              : {
                  project,
                  activeInstanceAddresses: filterInstanceAddresses(
                    { ...state, project },
                    state.activeInstanceAddresses,
                  ),
                };
          });
        },
        removeElement(elementId: projectFormatV1.Id): void {
          get().removeElements([elementId]);
        },
        toggleLock(elementId: projectFormatV1.Id): boolean {
          return get().updateElement(elementId, (element) => ({ ...element, locked: !element.locked }));
        },
        toggleVisibility(elementId: projectFormatV1.Id): boolean {
          const state = get();
          const address = firstInstanceAddressForElement(state, elementId);

          return address !== undefined && get().toggleInstanceVisibility(address);
        },
        toggleInstanceVisibility(address: projectFormatV1.InstanceAddress): boolean {
          const state = get();
          const page = state.project.documents
            .find((candidate) => candidate.id === state.activeDocumentId)
            ?.pages.find((candidate) => candidate.id === state.activePageId);
          const instance = page?.rootInstances.find((candidate) => candidate.id === address.rootInstanceId);

          if (instance === undefined || filterInstanceAddresses(state, [address]).length === 0) return false;

          return get().setPageRootVisibility(instance.id, instance.visible === false);
        },
        undo(): void {
          temporalReference.current?.getState().undo();
        },
        redo(): void {
          temporalReference.current?.getState().redo();
        },
      }),
      {
        partialize: (state) => ({ project: state.project, blobs: state.blobs }),
        limit: options.maxUndoSteps ?? DEFAULT_MAX_UNDO_STEPS,
        equality: (previous, current) => previous.project === current.project && previous.blobs === current.blobs,
      },
    ),
  );

  temporalReference.current = store.temporal;

  return store;
}
