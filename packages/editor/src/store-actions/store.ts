import {
  type BooleanOperation,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  createDefaultAnimationConfig,
  createDefaultElement,
  createDefaultFeatureConfig,
  createEmptyBroadsetDocument,
  type EditorConfig,
  type EditorFeatureConfig,
  type ElementAnimationConfig,
  type ElementPosition,
  migrateLegacyColor,
  type Page,
  type PageElementInstance,
  resolveContentAsPlainString,
} from '@broadset/model';
import { temporal, type TemporalState } from 'zundo';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { EditingMode, PlacementPoint, PlacementState } from '../editing-state';
import { getElementDefaults } from '../element-defaults';
import { createUIActionsSlice, type UIActionsState } from '../store-ui-actions';
import { createSnapshot, ensureSnapshotName, MAX_SNAPSHOTS } from './history';
import { applySelectionSideEffects, createInteractionState, filterSelectionToExisting } from './selection';
import {
  computeRemoveElementsState,
  computeRemoveElementState,
  type ReorderDirection,
  reorderElementInList,
} from './store-element-reducers';
import {
  applyElementUpdate,
  applyPageInstancePositionBatch,
  applyPageInstanceTransformUpdate,
  togglePageElementVisibility,
  updateDocumentElement,
  updateDocumentElements,
} from './transform';

const DEFAULT_MAX_UNDO_STEPS = 50;

const STYLE_COLOR_FIELDS = ['fontColor', 'backgroundColor', 'borderColor', 'stroke', 'fill'] as const;

/**
 * Coerces any string values on color-valued fields of a style input
 * to `BroadsetColor` via `migrateLegacyColor`. Callers may pass either
 * the canonical structured form or a legacy CSS string — normalization
 * happens once at the store boundary so the persisted `element.style`
 * is always `BroadsetElementStyle`.
 */
function normalizeStyleInput(style: Partial<BroadsetElementStyleInput>): Partial<BroadsetElementStyle> {
  const result: Record<string, unknown> = { ...style };

  for (const field of STYLE_COLOR_FIELDS) {
    const value = result[field];

    if (typeof value === 'string') {
      result[field] = migrateLegacyColor(value);
    }
  }

  return result;
}

/**
 * Root elements must have a matching page instance on the active page so the
 * renderer and layer flows include them. Children (non-root) inherit their
 * root's instance, so they do not get a direct page instance.
 */
function createRootPageInstance(element: BroadsetElement): PageElementInstance {
  return {
    elementId: element.id,
    transform: {
      position: { x: element.position.x, y: element.position.y, z: 0 },
      rotation: { x: 0, y: 0, z: element.rotation },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

function insertRootElementIntoActivePage(
  pages: readonly Page[],
  activePageIndex: number,
  element: BroadsetElement,
): readonly Page[] {
  if (element.parentId !== null) {
    return pages;
  }

  const instance = createRootPageInstance(element);

  return pages.map((page, pageIndex) =>
    pageIndex === activePageIndex ? { ...page, elements: [...page.elements, instance] } : page,
  );
}

export type { ReorderDirection } from './store-element-reducers';

export interface NamedSnapshot {
  readonly id: string;
  readonly name: string;
  readonly timestamp: string;
  readonly document: BroadsetDocument;
}

export interface ElementUpdate {
  readonly position?: ElementPosition;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly content?: string;
  readonly assetId?: string | null;
  readonly name?: string;
  readonly booleanOperation?: BooleanOperation | null;
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
  readonly placement: PlacementState | null;
  readonly placementPreview: PlacementPoint | null;
  readonly pathEditingElementId: string | null;
  readonly pathDrawingElementId: string | null;
  readonly clipPathEditingElementId: string | null;
  readonly motionPathEditingElementId: string | null;
  readonly inlineTextEditingElementId: string | null;
  readonly editingMode: EditingMode;
  readonly loadTemplate: (document: BroadsetDocument) => void;
  readonly setDocument: (document: BroadsetDocument) => void;
  readonly getDocument: () => BroadsetDocument;
  readonly updateFeatureConfig: (partial: Partial<EditorFeatureConfig>) => void;
  readonly getElementAnimationConfig: (elementId: string) => ElementAnimationConfig | null;
  readonly updateElementAnimationConfig: (
    elementId: string,
    updater: (config: ElementAnimationConfig) => ElementAnimationConfig,
  ) => ElementAnimationConfig;
  readonly removeElementAnimationConfig: (elementId: string) => void;
  readonly selectElement: (elementId: string | null) => void;
  readonly setActiveElements: (elementIds: readonly string[]) => void;
  readonly toggleSelectElement: (elementId: string) => void;
  readonly enterPathEditing: (elementId: string) => void;
  readonly updateElementEphemeral: (elementId: string, updates: ElementUpdate) => void;
  readonly commitElementUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly commitGroupMove: (
    updates: ReadonlyArray<{ readonly elementId: string; readonly position: ElementPosition }>,
  ) => void;
  readonly updateElementStyle: (elementId: string, style: Partial<BroadsetElementStyleInput>) => void;
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
  readonly snapshots: readonly NamedSnapshot[];
  readonly saveSnapshot: (name: string) => string;
  readonly restoreSnapshot: (id: string) => void;
  readonly renameSnapshot: (id: string, newName: string) => void;
  readonly deleteSnapshot: (id: string) => void;
}

export type EditorStore = StoreApi<EditorState> & {
  temporal: StoreApi<TemporalState<PartializedState>>;
};

export interface CreateEditorStoreOptions {
  readonly config?: Partial<EditorConfig>;
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
        placement: null,
        placementPreview: null,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
        snapshots: [],
        ...createUIActionsSlice((updater) => {
          set((state) => updater(state));
        }, options.config),
        loadTemplate(document: BroadsetDocument): void {
          set({
            document,
            documentMode: document.documentMode,
            featureConfig: createDefaultFeatureConfig(document.documentMode),
            activePageIndex: 0,
            snapshots: [],
            placementPreview: null,
            ...createInteractionState([], null, null, null),
          });
          temporalRef.current?.getState().clear();
        },
        setDocument(document: BroadsetDocument): void {
          set((state) => {
            const maxPageIndex = Math.max(0, document.pages.length - 1);
            const clampedActivePageIndex = Math.min(Math.max(0, state.activePageIndex), maxPageIndex);

            return {
              document,
              documentMode: document.documentMode,
              featureConfig: createDefaultFeatureConfig(document.documentMode),
              activeElementIds: filterSelectionToExisting(document, state.activeElementIds),
              activePageIndex: clampedActivePageIndex,
            };
          });
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
        getElementAnimationConfig(elementId: string): ElementAnimationConfig | null {
          return get().document.animations.find((animation) => animation.elementId === elementId)?.config ?? null;
        },
        updateElementAnimationConfig(
          elementId: string,
          updater: (config: ElementAnimationConfig) => ElementAnimationConfig,
        ): ElementAnimationConfig {
          let nextConfig = createDefaultAnimationConfig();

          set((state) => {
            const existingAnimation = state.document.animations.find((animation) => animation.elementId === elementId);
            const baseConfig = existingAnimation?.config ?? createDefaultAnimationConfig();

            nextConfig = updater(baseConfig);

            const animations =
              existingAnimation === undefined ?
                [...state.document.animations, { elementId, config: nextConfig }]
              : state.document.animations.map((animation) =>
                  animation.elementId === elementId ? { ...animation, config: nextConfig } : animation,
                );

            return {
              document: {
                ...state.document,
                animations,
              },
            };
          });

          return nextConfig;
        },
        removeElementAnimationConfig(elementId: string): void {
          set((state) => ({
            document: {
              ...state.document,
              animations: state.document.animations.filter((animation) => animation.elementId !== elementId),
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
          set((state) => {
            let nextDoc = updateDocumentElement(state.document, elementId, (element) =>
              applyElementUpdate(element, updates),
            );

            if (updates.position !== undefined || updates.rotation !== undefined) {
              nextDoc = applyPageInstanceTransformUpdate(nextDoc, state.activePageIndex, elementId, {
                ...(updates.position !== undefined ?
                  { position: { x: updates.position.x, y: updates.position.y } }
                : {}),
                ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
              });
            }

            return { document: nextDoc };
          });
          temporalRef.current?.getState().resume();
        },
        commitElementUpdate(elementId: string, updates: ElementUpdate): void {
          set((state) => {
            let nextDoc = updateDocumentElement(state.document, elementId, (element) =>
              applyElementUpdate(element, updates),
            );

            if (updates.position !== undefined || updates.rotation !== undefined) {
              nextDoc = applyPageInstanceTransformUpdate(nextDoc, state.activePageIndex, elementId, {
                ...(updates.position !== undefined ?
                  { position: { x: updates.position.x, y: updates.position.y } }
                : {}),
                ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
              });
            }

            return { document: nextDoc };
          });
        },
        commitGroupMove(
          updates: ReadonlyArray<{ readonly elementId: string; readonly position: ElementPosition }>,
        ): void {
          set((state) => {
            const positionsById = new Map(updates.map((update) => [update.elementId, update.position]));
            let nextDocument = updateDocumentElements(state.document, new Set(positionsById.keys()), (element) => {
              const nextPosition = positionsById.get(element.id);

              return nextPosition === undefined ? element : { ...element, position: nextPosition };
            });

            nextDocument = applyPageInstancePositionBatch(
              nextDocument,
              state.activePageIndex,
              updates.map((u) => ({ elementId: u.elementId, position: { x: u.position.x, y: u.position.y } })),
            );

            return { document: nextDocument };
          });
        },
        updateElementStyle(elementId: string, style: Partial<BroadsetElementStyleInput>): void {
          const normalized = normalizeStyleInput(style);

          set((state) => ({
            document: updateDocumentElement(state.document, elementId, (element) => ({
              ...element,
              style: {
                ...element.style,
                ...normalized,
              },
            })),
          }));
        },
        reorderElement(elementId: string, direction: ReorderDirection): void {
          set((state) => {
            const nextElements = reorderElementInList(state.document.elements, elementId, direction);

            return nextElements === null ? {} : { document: { ...state.document, elements: nextElements } };
          });
        },
        addElement(typeOrElement: string | BroadsetElement): string {
          const nextElement =
            typeof typeOrElement === 'string' ?
              (() => {
                const defaults = getElementDefaults(typeOrElement);

                return createDefaultElement(typeOrElement, {
                  name: defaults.name,
                  width: defaults.width,
                  height: defaults.height,
                  content: defaults.content,
                  style: defaults.style,
                });
              })()
            : typeOrElement;
          const entersPathDrawing =
            nextElement.type === 'path' && resolveContentAsPlainString(nextElement.content).trim() === '';

          set((state) => ({
            document: {
              ...state.document,
              elements: [...state.document.elements, nextElement],
              pages: insertRootElementIntoActivePage(state.document.pages, state.activePageIndex, nextElement),
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
            return computeRemoveElementState(state, elementId, requiredElementIds) ?? {};
          });
        },
        removeElements(elementIds: readonly string[]): void {
          set((state) => {
            return computeRemoveElementsState(state, elementIds, requiredElementIds) ?? {};
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
                    elements: togglePageElementVisibility(page.elements, elementId, state.document.elements),
                  }
                : page,
              ),
            },
          }));
        },
        saveSnapshot(name: string): string {
          const trimmed = ensureSnapshotName(name);

          const state = get();

          if (state.snapshots.length >= MAX_SNAPSHOTS) {
            throw new Error(`Maximum number of snapshots (${String(MAX_SNAPSHOTS)}) reached`);
          }

          if (state.snapshots.some((s) => s.name === trimmed)) {
            throw new Error(`A snapshot named "${trimmed}" already exists`);
          }

          const snapshot = createSnapshot(trimmed, state.document);

          set({ snapshots: [...state.snapshots, snapshot] });

          return snapshot.id;
        },
        restoreSnapshot(id: string): void {
          const state = get();
          const snapshot = state.snapshots.find((s) => s.id === id);

          if (snapshot === undefined) {
            return;
          }

          const newDocumentMode = snapshot.document.documentMode;

          set({
            document: structuredClone(snapshot.document),
            documentMode: newDocumentMode,
            featureConfig:
              newDocumentMode === state.documentMode ?
                state.featureConfig
              : createDefaultFeatureConfig(newDocumentMode),
            activePageIndex: 0,
            placementPreview: null,
            ...createInteractionState([], null, null, null),
          });
        },
        renameSnapshot(id: string, newName: string): void {
          const trimmed = ensureSnapshotName(newName);

          const state = get();

          if (state.snapshots.some((s) => s.name === trimmed && s.id !== id)) {
            throw new Error(`A snapshot named "${trimmed}" already exists`);
          }

          set({
            snapshots: state.snapshots.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
          });
        },
        deleteSnapshot(id: string): void {
          set((state) => ({
            snapshots: state.snapshots.filter((s) => s.id !== id),
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
