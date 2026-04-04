import type {
  AnimationRegistryEntry,
  BroadsetElement,
  BroadsetElementStyle,
  Canvas,
  EditorConfig,
  EditorFeatureConfig,
  ElementPosition,
} from '@broadset/model';
import { createDefaultElement, createDefaultFeatureConfig } from '@broadset/model';
import type { TemporalState } from 'zundo';
import { temporal } from 'zundo';
import type { StoreApi, StoreMutatorIdentifier } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { UIActionsState } from './store-ui-actions';
import { createUIActionsSlice } from './store-ui-actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_UNDO_STEPS = 50;
const DEFAULT_TEXT_CONTENT = 'New Text';

// ---------------------------------------------------------------------------
// Internal document types (typed elements, unlike model's PageElement)
// ---------------------------------------------------------------------------

export interface EditorPage {
  readonly id: string;
  readonly elements: readonly BroadsetElement[];
}

export interface EditorDocument {
  readonly id: string;
  readonly documentMode: 'screen' | 'print';
  readonly canvas: Canvas;
  readonly pages: readonly EditorPage[];
  readonly animationRegistry: readonly AnimationRegistryEntry[];
}

export function createEmptyEditorDocument(): EditorDocument {
  return {
    id: crypto.randomUUID(),
    documentMode: 'screen',
    canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
    pages: [{ id: 'page-1', elements: [] }],
    animationRegistry: [],
  };
}

// ---------------------------------------------------------------------------
// Action-related types
// ---------------------------------------------------------------------------

export type EditingMode =
  | { readonly type: 'none' }
  | { readonly type: 'placement'; readonly elementType: string }
  | { readonly type: 'path-editing'; readonly elementId: string }
  | { readonly type: 'path-drawing'; readonly elementId: string };

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export interface ElementUpdate {
  readonly position?: ElementPosition;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly content?: string;
}

// ---------------------------------------------------------------------------
// Store state and store types
// ---------------------------------------------------------------------------

interface PartializedState {
  readonly document: EditorDocument;
  readonly documentMode: 'screen' | 'print';
  readonly featureConfig: EditorFeatureConfig;
}

export interface EditorState extends UIActionsState {
  readonly document: EditorDocument;
  readonly documentMode: 'screen' | 'print';
  readonly featureConfig: EditorFeatureConfig;
  readonly activeElementIds: readonly string[];
  readonly editingMode: EditingMode;
  readonly activePageIndex: number;

  loadTemplate: (doc: EditorDocument) => void;
  setDocument: (doc: EditorDocument) => void;
  getDocument: () => EditorDocument;
  updateFeatureConfig: (partial: Partial<EditorFeatureConfig>) => void;
  selectElement: (elementId: string | null) => void;
  toggleSelectElement: (elementId: string) => void;
  enterPathEditing: (elementId: string) => void;
  updateElementEphemeral: (elementId: string, updates: ElementUpdate) => void;
  commitElementUpdate: (elementId: string, updates: ElementUpdate) => void;
  commitGroupMove: (
    updates: ReadonlyArray<{
      readonly elementId: string;
      readonly position: ElementPosition;
    }>,
  ) => void;
  updateElementStyle: (elementId: string, style: Partial<BroadsetElementStyle>) => void;
  reorderElement: (elementId: string, direction: ReorderDirection) => void;
  addElement: (type: string) => string;
  removeElement: (elementId: string) => void;
  undo: () => void;
  redo: () => void;
  groupElements: () => void;
  ungroupElements: () => void;
  toggleLock: (elementId: string) => void;
  toggleVisibility: (elementId: string) => void;
}

export type EditorStore = StoreApi<EditorState> & {
  temporal: StoreApi<TemporalState<PartializedState>>;
};

export interface CreateEditorStoreOptions {
  readonly config?: Partial<EditorConfig>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updateElementInDoc(
  doc: EditorDocument,
  pageIndex: number,
  elementId: string,
  updater: (element: BroadsetElement) => BroadsetElement,
): EditorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page, i) => {
      if (i !== pageIndex) return page;

      return {
        ...page,
        elements: page.elements.map((el) => (el.id === elementId ? updater(el) : el)),
      };
    }),
  };
}

function updateMultipleElementsInDoc(
  doc: EditorDocument,
  pageIndex: number,
  elementIds: ReadonlySet<string>,
  updater: (element: BroadsetElement) => BroadsetElement,
): EditorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page, i) => {
      if (i !== pageIndex) return page;

      return {
        ...page,
        elements: page.elements.map((el) => (elementIds.has(el.id) ? updater(el) : el)),
      };
    }),
  };
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

function getEditorDefaultContent(type: string): string {
  if (type === 'text') return DEFAULT_TEXT_CONTENT;
  if (type === 'qrcode') return 'https://example.com';

  return '';
}

// ---------------------------------------------------------------------------
// Store Factory
// ---------------------------------------------------------------------------

export function createEditorStore(options?: CreateEditorStoreOptions): EditorStore {
  const maxUndoSteps = options?.config?.maxUndoSteps ?? DEFAULT_MAX_UNDO_STEPS;
  const requiredElementIds = new Set(options?.config?.requiredElements ?? []);

  const temporalRef: {
    current: StoreApi<TemporalState<PartializedState>> | null;
  } = { current: null };

  const store = createStore(
    temporal<EditorState, [StoreMutatorIdentifier, unknown][], [], PartializedState>(
      (set, get): EditorState => ({
        // --- Initial state ---
        document: createEmptyEditorDocument(),
        documentMode: 'screen' as const,
        featureConfig: createDefaultFeatureConfig('screen'),
        activeElementIds: [],
        editingMode: { type: 'none' } as EditingMode,
        activePageIndex: 0,

        // --- UI actions slice (pages, canvas settings, guides, palette) ---
        ...createUIActionsSlice((updater) => {
          set(updater);
        }, options?.config),

        // --- Document lifecycle ---

        loadTemplate: (doc: EditorDocument): void => {
          set({
            document: doc,
            documentMode: doc.documentMode,
            featureConfig: createDefaultFeatureConfig(doc.documentMode),
            activeElementIds: [],
            editingMode: { type: 'none' } as EditingMode,
            activePageIndex: 0,
          });
          temporalRef.current?.getState().clear();
        },

        setDocument: (doc: EditorDocument): void => {
          set({ document: doc });
        },

        getDocument: (): EditorDocument => get().document,

        updateFeatureConfig: (partial: Partial<EditorFeatureConfig>): void => {
          set((state) => ({
            featureConfig: { ...state.featureConfig, ...partial },
          }));
        },

        // --- Selection ---

        selectElement: (elementId: string | null): void => {
          set((state) => {
            const nextActiveIds: readonly string[] = elementId === null ? [] : [elementId];

            const { editingMode } = state;
            let nextEditingMode: EditingMode = editingMode;

            if (editingMode.type === 'path-editing' || editingMode.type === 'path-drawing') {
              if (elementId === null || elementId !== editingMode.elementId) {
                nextEditingMode = { type: 'none' };
              }
            }

            return {
              activeElementIds: nextActiveIds,
              editingMode: nextEditingMode,
            };
          });
        },

        toggleSelectElement: (elementId: string): void => {
          set((state) => {
            const ids = state.activeElementIds;
            const exists = ids.includes(elementId);

            return {
              activeElementIds: exists ? ids.filter((id) => id !== elementId) : [...ids, elementId],
            };
          });
        },

        enterPathEditing: (elementId: string): void => {
          set({
            editingMode: {
              type: 'path-editing' as const,
              elementId,
            },
          });
        },

        // --- Ephemeral & committed updates ---

        updateElementEphemeral: (elementId: string, updates: ElementUpdate): void => {
          temporalRef.current?.getState().pause();
          set((state) => ({
            document: updateElementInDoc(state.document, state.activePageIndex, elementId, (el) =>
              applyElementUpdate(el, updates),
            ),
          }));
          temporalRef.current?.getState().resume();
        },

        commitElementUpdate: (elementId: string, updates: ElementUpdate): void => {
          set((state) => ({
            document: updateElementInDoc(state.document, state.activePageIndex, elementId, (el) =>
              applyElementUpdate(el, updates),
            ),
          }));
        },

        commitGroupMove: (
          updates: ReadonlyArray<{
            readonly elementId: string;
            readonly position: ElementPosition;
          }>,
        ): void => {
          set((state) => {
            let doc = state.document;

            for (const { elementId, position } of updates) {
              doc = updateElementInDoc(doc, state.activePageIndex, elementId, (el) => ({ ...el, position }));
            }

            return { document: doc };
          });
        },

        // --- Style ---

        updateElementStyle: (elementId: string, style: Partial<BroadsetElementStyle>): void => {
          set((state) => ({
            document: updateElementInDoc(state.document, state.activePageIndex, elementId, (el) => ({
              ...el,
              style: { ...el.style, ...style },
            })),
          }));
        },

        // --- Layer reordering ---

        reorderElement: (elementId: string, direction: ReorderDirection): void => {
          set((state) => {
            const page = state.document.pages[state.activePageIndex];

            if (!page) return state;

            const elements = [...page.elements];
            const idx = elements.findIndex((e) => e.id === elementId);

            if (idx === -1) return state;

            let newElements: BroadsetElement[];

            switch (direction) {
              case 'forward': {
                if (idx >= elements.length - 1) return state;
                newElements = [...elements];

                const next = newElements[idx + 1];
                const current = newElements[idx];

                if (!next || !current) return state;
                newElements[idx] = next;
                newElements[idx + 1] = current;
                break;
              }

              case 'backward': {
                if (idx <= 0) return state;
                newElements = [...elements];

                const prev = newElements[idx - 1];
                const current = newElements[idx];

                if (!prev || !current) return state;
                newElements[idx] = prev;
                newElements[idx - 1] = current;
                break;
              }

              case 'front': {
                const el = elements[idx];

                if (!el) return state;
                newElements = [...elements.slice(0, idx), ...elements.slice(idx + 1), el];
                break;
              }

              case 'back': {
                const el = elements[idx];

                if (!el) return state;
                newElements = [el, ...elements.slice(0, idx), ...elements.slice(idx + 1)];
                break;
              }
            }

            return {
              document: {
                ...state.document,
                pages: state.document.pages.map((p, i) =>
                  i === state.activePageIndex ? { ...p, elements: newElements } : p,
                ),
              },
            };
          });
        },

        // --- Element add / remove ---

        addElement: (type: string): string => {
          const content = getEditorDefaultContent(type);
          const newElement = createDefaultElement(type, { content });
          const newId = newElement.id;

          set((state) => {
            const page = state.document.pages[state.activePageIndex];

            if (!page) return state;

            const isPathDrawing = type === 'path' && content === '';

            return {
              document: {
                ...state.document,
                pages: state.document.pages.map((p, i) =>
                  i === state.activePageIndex ? { ...p, elements: [...p.elements, newElement] } : p,
                ),
              },
              activeElementIds: [newId],
              ...(isPathDrawing ?
                {
                  editingMode: {
                    type: 'path-drawing' as const,
                    elementId: newId,
                  },
                }
              : {}),
            };
          });

          return newId;
        },

        removeElement: (elementId: string): void => {
          if (requiredElementIds.has(elementId)) return;

          set((state) => {
            const page = state.document.pages[state.activePageIndex];

            if (!page) return state;

            return {
              document: {
                ...state.document,
                pages: state.document.pages.map((p, i) =>
                  i === state.activePageIndex ?
                    {
                      ...p,
                      elements: p.elements.filter((e) => e.id !== elementId),
                    }
                  : p,
                ),
              },
              activeElementIds: state.activeElementIds.filter((id) => id !== elementId),
            };
          });
        },

        // --- Undo / redo ---

        undo: (): void => {
          temporalRef.current?.getState().undo();
        },

        redo: (): void => {
          temporalRef.current?.getState().redo();
        },

        // --- Grouping ---

        groupElements: (): void => {
          set((state) => {
            if (state.activeElementIds.length < 2) return state;

            const groupId = crypto.randomUUID();
            const selectedIds = new Set(state.activeElementIds);

            return {
              document: updateMultipleElementsInDoc(state.document, state.activePageIndex, selectedIds, (el) => ({
                ...el,
                groupId,
              })),
            };
          });
        },

        ungroupElements: (): void => {
          set((state) => {
            const selectedIds = new Set(state.activeElementIds);

            return {
              document: updateMultipleElementsInDoc(state.document, state.activePageIndex, selectedIds, (el) => ({
                ...el,
                groupId: null,
              })),
            };
          });
        },

        // --- Locking ---

        toggleLock: (elementId: string): void => {
          set((state) => ({
            document: updateElementInDoc(state.document, state.activePageIndex, elementId, (el) => ({
              ...el,
              screen: { ...el.screen, locked: !el.screen.locked },
            })),
          }));
        },

        toggleVisibility: (elementId: string): void => {
          set((state) => ({
            document: updateElementInDoc(state.document, state.activePageIndex, elementId, (el) => ({
              ...el,
              screen: {
                ...el.screen,
                visibility: el.screen.visibility === 'offscreen' ? ('onscreen' as const) : ('offscreen' as const),
              },
            })),
          }));
        },
      }),
      {
        partialize: (state: EditorState): PartializedState => ({
          document: state.document,
          documentMode: state.documentMode,
          featureConfig: state.featureConfig,
        }),
        limit: maxUndoSteps,
        equality: (pastState: PartializedState, currentState: PartializedState): boolean =>
          pastState.document === currentState.document &&
          pastState.documentMode === currentState.documentMode &&
          pastState.featureConfig === currentState.featureConfig,
      },
    ),
  );

  temporalRef.current = store.temporal;

  return store as EditorStore;
}
