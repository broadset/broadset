import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  createDefaultElement,
  createDefaultFeatureConfig,
  createEmptyBroadsetDocument,
  type EditorConfig,
  type EditorFeatureConfig,
  type ElementOverride,
  type ElementPosition,
} from '@broadset/model';
import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { getElementDefaults } from './element-defaults';
import { createUIActionsSlice, type UIActionsState } from './store-ui-actions';

const DEFAULT_MAX_UNDO_STEPS = 50;

export type EditingMode =
  | { readonly type: 'none' }
  | { readonly type: 'placement'; readonly elementType: string }
  | { readonly type: 'path-editing'; readonly elementId: string }
  | { readonly type: 'path-drawing'; readonly elementId: string }
  | { readonly type: 'inline-text'; readonly elementId: string }
  | { readonly type: 'clip-path-editing'; readonly elementId: string };

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface ElementUpdate {
  readonly position?: ElementPosition;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly content?: string;
}

interface PartializedState {
  readonly document: BroadsetDocument;
  readonly documentMode: 'screen' | 'print';
  readonly featureConfig: EditorFeatureConfig;
}

export interface EditorState extends UIActionsState {
  readonly document: BroadsetDocument;
  readonly documentMode: 'screen' | 'print';
  readonly featureConfig: EditorFeatureConfig;
  readonly activeElementIds: readonly string[];
  readonly activePageIndex: number;
  readonly pendingPlacementType: string | null;
  readonly pathEditingElementId: string | null;
  readonly pathDrawingElementId: string | null;
  readonly clipPathEditingElementId: string | null;
  readonly inlineTextEditingElementId: string | null;
  readonly editingMode: EditingMode;
  readonly loadTemplate: (document: BroadsetDocument) => void;
  readonly setDocument: (document: BroadsetDocument) => void;
  readonly getDocument: () => BroadsetDocument;
  readonly updateFeatureConfig: (partial: Partial<EditorFeatureConfig>) => void;
  readonly selectElement: (elementId: string | null) => void;
  readonly setActiveElements: (elementIds: readonly string[]) => void;
  readonly toggleSelectElement: (elementId: string) => void;
  readonly enterPathEditing: (elementId: string) => void;
  readonly updateElementEphemeral: (elementId: string, updates: ElementUpdate) => void;
  readonly commitElementUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly commitGroupMove: (
    updates: ReadonlyArray<{ readonly elementId: string; readonly position: ElementPosition }>,
  ) => void;
  readonly updateElementStyle: (elementId: string, style: Partial<BroadsetElementStyle>) => void;
  readonly reorderElement: (elementId: string, direction: ReorderDirection) => void;
  readonly addElement: (typeOrElement: string | BroadsetElement) => string;
  readonly removeElement: (elementId: string) => void;
  readonly removeElements: (elementIds: readonly string[]) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly groupElements: () => void;
  readonly ungroupElements: () => void;
  readonly toggleLock: (elementId: string) => void;
  readonly toggleVisibility: (elementId: string) => void;
}

export type EditorStore = StoreApi<EditorState> & {
  temporal: StoreApi<TemporalState<PartializedState>>;
};

export interface CreateEditorStoreOptions {
  readonly config?: Partial<EditorConfig>;
}

function createEditingMode(
  pendingPlacementType: string | null,
  pathEditingElementId: string | null,
  pathDrawingElementId: string | null,
  inlineTextEditingElementId: string | null,
  clipPathEditingElementId: string | null = null,
): EditingMode {
  if (clipPathEditingElementId !== null) {
    return { type: 'clip-path-editing', elementId: clipPathEditingElementId };
  }

  if (inlineTextEditingElementId !== null) {
    return { type: 'inline-text', elementId: inlineTextEditingElementId };
  }

  if (pathDrawingElementId !== null) {
    return { type: 'path-drawing', elementId: pathDrawingElementId };
  }

  if (pathEditingElementId !== null) {
    return { type: 'path-editing', elementId: pathEditingElementId };
  }

  if (pendingPlacementType !== null) {
    return { type: 'placement', elementType: pendingPlacementType };
  }

  return { type: 'none' };
}

function filterSelectionToExisting(document: BroadsetDocument, elementIds: readonly string[]): readonly string[] {
  const existingIds = new Set(document.elements.map((element) => element.id));

  return elementIds.filter((elementId) => existingIds.has(elementId));
}

function createInteractionState(
  activeElementIds: readonly string[],
  pendingPlacementType: string | null,
  pathEditingElementId: string | null,
  pathDrawingElementId: string | null,
  inlineTextEditingElementId: string | null = null,
  clipPathEditingElementId: string | null = null,
): Pick<
  EditorState,
  | 'activeElementIds'
  | 'pendingPlacementType'
  | 'pathEditingElementId'
  | 'pathDrawingElementId'
  | 'clipPathEditingElementId'
  | 'inlineTextEditingElementId'
  | 'editingMode'
> {
  return {
    activeElementIds,
    pendingPlacementType,
    pathEditingElementId,
    pathDrawingElementId,
    clipPathEditingElementId,
    inlineTextEditingElementId,
    editingMode: createEditingMode(
      pendingPlacementType,
      pathEditingElementId,
      pathDrawingElementId,
      inlineTextEditingElementId,
      clipPathEditingElementId,
    ),
  };
}

function applySelectionSideEffects(
  state: Pick<
    EditorState,
    | 'pendingPlacementType'
    | 'pathEditingElementId'
    | 'pathDrawingElementId'
    | 'clipPathEditingElementId'
    | 'inlineTextEditingElementId'
  >,
  nextActiveElementIds: readonly string[],
): Pick<
  EditorState,
  | 'activeElementIds'
  | 'pendingPlacementType'
  | 'pathEditingElementId'
  | 'pathDrawingElementId'
  | 'clipPathEditingElementId'
  | 'inlineTextEditingElementId'
  | 'editingMode'
> {
  const nextPathEditingElementId =
    state.pathEditingElementId !== null && nextActiveElementIds.includes(state.pathEditingElementId) ?
      state.pathEditingElementId
    : null;
  const nextPathDrawingElementId =
    state.pathDrawingElementId !== null && nextActiveElementIds.includes(state.pathDrawingElementId) ?
      state.pathDrawingElementId
    : null;
  const nextClipPathEditingElementId =
    state.clipPathEditingElementId !== null && nextActiveElementIds.includes(state.clipPathEditingElementId) ?
      state.clipPathEditingElementId
    : null;
  const nextInlineTextEditingElementId =
    state.inlineTextEditingElementId !== null && nextActiveElementIds.includes(state.inlineTextEditingElementId) ?
      state.inlineTextEditingElementId
    : null;
  const nextPendingPlacementType = nextActiveElementIds.length === 0 ? state.pendingPlacementType : null;

  return createInteractionState(
    nextActiveElementIds,
    nextPendingPlacementType,
    nextPathEditingElementId,
    nextPathDrawingElementId,
    nextInlineTextEditingElementId,
    nextClipPathEditingElementId,
  );
}

function applyElementUpdate(element: BroadsetElement, updates: ElementUpdate): BroadsetElement {
  return {
    ...element,
    ...(updates.position !== undefined ? { position: updates.position } : {}),
    ...(updates.width !== undefined ? { width: updates.width } : {}),
    ...(updates.height !== undefined ? { height: updates.height } : {}),
    ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
    ...(updates.content !== undefined ? { content: updates.content } : {}),
  };
}

function updateDocumentElement(
  document: BroadsetDocument,
  elementId: string,
  updater: (element: BroadsetElement) => BroadsetElement,
): BroadsetDocument {
  return {
    ...document,
    elements: document.elements.map((element) => (element.id === elementId ? updater(element) : element)),
  };
}

function updateDocumentElements(
  document: BroadsetDocument,
  elementIds: ReadonlySet<string>,
  updater: (element: BroadsetElement) => BroadsetElement,
): BroadsetDocument {
  return {
    ...document,
    elements: document.elements.map((element) => (elementIds.has(element.id) ? updater(element) : element)),
  };
}

function collectDescendantIds(document: BroadsetDocument, rootElementId: string): ReadonlySet<string> {
  const pendingIds = [rootElementId];
  const collectedIds = new Set<string>(pendingIds);

  while (pendingIds.length > 0) {
    const currentId = pendingIds.pop();

    if (currentId === undefined) {
      continue;
    }

    for (const element of document.elements) {
      if (element.parentId === currentId && !collectedIds.has(element.id)) {
        collectedIds.add(element.id);
        pendingIds.push(element.id);
      }
    }
  }

  return collectedIds;
}

function toggleOverrideVisibility(
  pageOverrides: readonly ElementOverride[],
  elementId: string,
): readonly ElementOverride[] {
  const overrideIndex = pageOverrides.findIndex((override) => override.elementId === elementId);

  if (overrideIndex === -1) {
    return [...pageOverrides, { elementId, visible: false }];
  }

  return pageOverrides.map((override, index) => {
    if (index !== overrideIndex) {
      return override;
    }

    const currentVisible = override.visible ?? true;

    return {
      ...override,
      visible: !currentVisible,
    };
  });
}

export function createEmptyEditorDocument(): BroadsetDocument {
  return createEmptyBroadsetDocument();
}

export function createEditorStore(options: CreateEditorStoreOptions = {}): EditorStore {
  const maxUndoSteps = options.config?.maxUndoSteps ?? DEFAULT_MAX_UNDO_STEPS;
  const requiredElementIds = new Set(options.config?.requiredElements ?? []);
  const temporalRef: { current: StoreApi<TemporalState<PartializedState>> | null } = { current: null };

  const store: EditorStore = createStore<EditorState>()(
    temporal(
      (set, get) => ({
        document: createEmptyEditorDocument(),
        documentMode: 'screen',
        featureConfig: createDefaultFeatureConfig('screen'),
        activeElementIds: [],
        activePageIndex: 0,
        pendingPlacementType: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
        ...createUIActionsSlice((updater) => {
          set((state) => updater(state));
        }, options.config),
        loadTemplate(document: BroadsetDocument): void {
          set({
            document,
            documentMode: document.documentMode,
            featureConfig: createDefaultFeatureConfig(document.documentMode),
            activePageIndex: 0,
            ...createInteractionState([], null, null, null),
          });
          temporalRef.current?.getState().clear();
        },
        setDocument(document: BroadsetDocument): void {
          set((state) => ({
            document,
            documentMode: document.documentMode,
            featureConfig: createDefaultFeatureConfig(document.documentMode),
            activeElementIds: filterSelectionToExisting(document, state.activeElementIds),
          }));
        },
        getDocument(): BroadsetDocument {
          return get().document;
        },
        updateFeatureConfig(partial: Partial<EditorFeatureConfig>): void {
          set((state) => ({
            featureConfig: {
              ...state.featureConfig,
              ...partial,
            },
          }));
        },
        selectElement(elementId: string | null): void {
          set((state) => applySelectionSideEffects(state, elementId === null ? [] : [elementId]));
        },
        setActiveElements(elementIds: readonly string[]): void {
          set((state) => applySelectionSideEffects(state, [...elementIds]));
        },
        toggleSelectElement(elementId: string): void {
          set((state) => {
            const isAlreadySelected = state.activeElementIds.includes(elementId);
            const nextActiveElementIds =
              isAlreadySelected ?
                state.activeElementIds.filter((activeId) => activeId !== elementId)
              : [...state.activeElementIds, elementId];

            return applySelectionSideEffects(state, nextActiveElementIds);
          });
        },
        enterPathEditing(elementId: string): void {
          set(createInteractionState([elementId], null, elementId, null));
        },
        updateElementEphemeral(elementId: string, updates: ElementUpdate): void {
          temporalRef.current?.getState().pause();
          set((state) => ({
            document: updateDocumentElement(state.document, elementId, (element) =>
              applyElementUpdate(element, updates),
            ),
          }));
          temporalRef.current?.getState().resume();
        },
        commitElementUpdate(elementId: string, updates: ElementUpdate): void {
          set((state) => ({
            document: updateDocumentElement(state.document, elementId, (element) =>
              applyElementUpdate(element, updates),
            ),
          }));
        },
        commitGroupMove(
          updates: ReadonlyArray<{ readonly elementId: string; readonly position: ElementPosition }>,
        ): void {
          set((state) => {
            const positionsById = new Map(updates.map((update) => [update.elementId, update.position]));
            const nextDocument = {
              ...state.document,
              elements: state.document.elements.map((element) => {
                const nextPosition = positionsById.get(element.id);

                return nextPosition === undefined ? element : { ...element, position: nextPosition };
              }),
            };

            return { document: nextDocument };
          });
        },
        updateElementStyle(elementId: string, style: Partial<BroadsetElementStyle>): void {
          set((state) => ({
            document: updateDocumentElement(state.document, elementId, (element) => ({
              ...element,
              style: {
                ...element.style,
                ...style,
              },
            })),
          }));
        },
        reorderElement(elementId: string, direction: ReorderDirection): void {
          set((state) => {
            const currentIndex = state.document.elements.findIndex((element) => element.id === elementId);

            if (currentIndex === -1) {
              return {};
            }

            const nextElements = [...state.document.elements];

            switch (direction) {
              case 'forward': {
                if (currentIndex >= nextElements.length - 1) {
                  return {};
                }

                const [element] = nextElements.splice(currentIndex, 1);

                if (element === undefined) {
                  return {};
                }

                nextElements.splice(currentIndex + 1, 0, element);
                break;
              }

              case 'backward': {
                if (currentIndex <= 0) {
                  return {};
                }

                const [element] = nextElements.splice(currentIndex, 1);

                if (element === undefined) {
                  return {};
                }

                nextElements.splice(currentIndex - 1, 0, element);
                break;
              }

              case 'front': {
                if (currentIndex === nextElements.length - 1) {
                  return {};
                }

                const [element] = nextElements.splice(currentIndex, 1);

                if (element === undefined) {
                  return {};
                }

                nextElements.push(element);
                break;
              }

              case 'back': {
                if (currentIndex === 0) {
                  return {};
                }

                const [element] = nextElements.splice(currentIndex, 1);

                if (element === undefined) {
                  return {};
                }

                nextElements.unshift(element);
                break;
              }
            }

            return {
              document: {
                ...state.document,
                elements: nextElements,
              },
            };
          });
        },
        addElement(typeOrElement: string | BroadsetElement): string {
          const nextElement =
            typeof typeOrElement === 'string' ?
              (() => {
                const defaults = getElementDefaults(typeOrElement);

                return {
                  ...createDefaultElement(typeOrElement, {
                    width: defaults.width,
                    height: defaults.height,
                    content: defaults.content,
                  }),
                  name: typeOrElement,
                };
              })()
            : typeOrElement;
          const entersPathDrawing = nextElement.type === 'path' && nextElement.content.trim() === '';

          set((state) => ({
            document: {
              ...state.document,
              elements: [...state.document.elements, nextElement],
            },
            ...createInteractionState([nextElement.id], null, null, entersPathDrawing ? nextElement.id : null),
          }));

          return nextElement.id;
        },
        removeElement(elementId: string): void {
          if (requiredElementIds.has(elementId)) {
            return;
          }

          set((state) => {
            const affectedIds = collectDescendantIds(state.document, elementId);
            const promotedIds = new Set<string>(
              [...affectedIds].filter((affectedId) => affectedId !== elementId && requiredElementIds.has(affectedId)),
            );
            const deletedIds = new Set<string>([...affectedIds].filter((affectedId) => !promotedIds.has(affectedId)));
            const nextDocument: BroadsetDocument = {
              ...state.document,
              elements: state.document.elements
                .filter((element) => !deletedIds.has(element.id))
                .map((element) =>
                  promotedIds.has(element.id) ?
                    {
                      ...element,
                      parentId: null,
                    }
                  : element,
                ),
              pages: state.document.pages.map((page) => ({
                ...page,
                overrides: page.overrides.filter((override) => !deletedIds.has(override.elementId)),
              })),
            };
            const nextActiveElementIds = state.activeElementIds.filter((activeId) => !deletedIds.has(activeId));
            const nextPathEditingElementId =
              state.pathEditingElementId !== null && deletedIds.has(state.pathEditingElementId) ?
                null
              : state.pathEditingElementId;
            const nextPathDrawingElementId =
              state.pathDrawingElementId !== null && deletedIds.has(state.pathDrawingElementId) ?
                null
              : state.pathDrawingElementId;
            const nextClipPathEditingElementId =
              state.clipPathEditingElementId !== null && deletedIds.has(state.clipPathEditingElementId) ?
                null
              : state.clipPathEditingElementId;
            const nextInlineTextEditingElementId =
              state.inlineTextEditingElementId !== null && deletedIds.has(state.inlineTextEditingElementId) ?
                null
              : state.inlineTextEditingElementId;

            return {
              document: nextDocument,
              ...createInteractionState(
                nextActiveElementIds,
                state.pendingPlacementType,
                nextPathEditingElementId,
                nextPathDrawingElementId,
                nextInlineTextEditingElementId,
                nextClipPathEditingElementId,
              ),
            };
          });
        },
        removeElements(elementIds: readonly string[]): void {
          const removableIds = elementIds.filter((elementId) => !requiredElementIds.has(elementId));

          if (removableIds.length === 0) {
            return;
          }

          set((state) => {
            const allDeletedIds = new Set<string>();

            for (const elementId of removableIds) {
              const descendants = collectDescendantIds(state.document, elementId);

              for (const descendantId of descendants) {
                if (!requiredElementIds.has(descendantId)) {
                  allDeletedIds.add(descendantId);
                }
              }
            }

            const nextDocument: BroadsetDocument = {
              ...state.document,
              elements: state.document.elements
                .filter((element) => !allDeletedIds.has(element.id))
                .map((element) =>
                  (
                    requiredElementIds.has(element.id) &&
                    element.parentId !== null &&
                    allDeletedIds.has(element.parentId)
                  ) ?
                    { ...element, parentId: null }
                  : element,
                ),
              pages: state.document.pages.map((page) => ({
                ...page,
                overrides: page.overrides.filter((override) => !allDeletedIds.has(override.elementId)),
              })),
            };
            const nextActiveElementIds = state.activeElementIds.filter((activeId) => !allDeletedIds.has(activeId));
            const nextPathEditingElementId =
              state.pathEditingElementId !== null && allDeletedIds.has(state.pathEditingElementId) ?
                null
              : state.pathEditingElementId;
            const nextPathDrawingElementId =
              state.pathDrawingElementId !== null && allDeletedIds.has(state.pathDrawingElementId) ?
                null
              : state.pathDrawingElementId;
            const nextClipPathEditingElementId =
              state.clipPathEditingElementId !== null && allDeletedIds.has(state.clipPathEditingElementId) ?
                null
              : state.clipPathEditingElementId;
            const nextInlineTextEditingElementId =
              state.inlineTextEditingElementId !== null && allDeletedIds.has(state.inlineTextEditingElementId) ?
                null
              : state.inlineTextEditingElementId;

            return {
              document: nextDocument,
              ...createInteractionState(
                nextActiveElementIds,
                state.pendingPlacementType,
                nextPathEditingElementId,
                nextPathDrawingElementId,
                nextInlineTextEditingElementId,
                nextClipPathEditingElementId,
              ),
            };
          });
        },
        undo(): void {
          temporalRef.current?.getState().undo();
        },
        redo(): void {
          temporalRef.current?.getState().redo();
        },
        groupElements(): void {
          set((state) => {
            if (state.activeElementIds.length < 2) {
              return {};
            }

            const groupId = crypto.randomUUID();

            return {
              document: updateDocumentElements(state.document, new Set(state.activeElementIds), (element) => ({
                ...element,
                groupId,
              })),
            };
          });
        },
        ungroupElements(): void {
          set((state) => ({
            document: updateDocumentElements(state.document, new Set(state.activeElementIds), (element) => ({
              ...element,
              groupId: null,
            })),
          }));
        },
        toggleLock(elementId: string): void {
          set((state) => ({
            document: updateDocumentElement(state.document, elementId, (element) => ({
              ...element,
              locked: !element.locked,
            })),
          }));
        },
        toggleVisibility(elementId: string): void {
          set((state) => ({
            document: {
              ...state.document,
              pages: state.document.pages.map((page, pageIndex) =>
                pageIndex === state.activePageIndex ?
                  {
                    ...page,
                    overrides: toggleOverrideVisibility(page.overrides, elementId),
                  }
                : page,
              ),
            },
          }));
        },
      }),
      {
        partialize: (state) => ({
          document: state.document,
          documentMode: state.documentMode,
          featureConfig: state.featureConfig,
        }),
        limit: maxUndoSteps,
        equality: (previousState, currentState) =>
          previousState.document === currentState.document &&
          previousState.documentMode === currentState.documentMode &&
          previousState.featureConfig === currentState.featureConfig,
      },
    ),
  );

  temporalRef.current = store.temporal;

  return store;
}
