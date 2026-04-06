import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Runtime element data — arbitrary key-value pairs injected at runtime. */
export type ElementData = Readonly<Record<string, unknown>>;

/** The element data map keyed by element ID. */
export type ElementDataMap = Readonly<Record<string, ElementData>>;

/** State shape for the data store. */
export interface DataStoreState {
  readonly elements: ElementDataMap;
  readonly updateElementData: (elementId: string, data: ElementData) => void;
  readonly setElementData: (elementId: string, data: ElementData) => void;
  readonly bulkUpdate: (updates: Readonly<Record<string, ElementData>>) => void;
}

/** The zustand store instance with selector-based subscriptions for runtime data. */
export interface BroadsetDataStore extends StoreApi<DataStoreState> {
  subscribe: {
    (listener: (state: DataStoreState, previousState: DataStoreState) => void): () => void;
    <TSelected>(
      selector: (state: DataStoreState) => TSelected,
      listener: (value: TSelected, previousValue: TSelected) => void,
    ): () => void;
  };
}

/** Creates an independent runtime data store for provider-scoped live bindings. */
export function createDataStore(initialElements: ElementDataMap = {}): BroadsetDataStore {
  return createStore<DataStoreState>()(
    subscribeWithSelector((set) => ({
      elements: initialElements,
      updateElementData(elementId: string, data: ElementData): void {
        set((state) => ({
          elements: {
            ...state.elements,
            [elementId]: { ...(state.elements[elementId] ?? {}), ...data },
          },
        }));
      },
      setElementData(elementId: string, data: ElementData): void {
        set((state) => ({
          elements: {
            ...state.elements,
            [elementId]: data,
          },
        }));
      },
      bulkUpdate(updates: Readonly<Record<string, ElementData>>): void {
        set((state) => {
          const nextElements: Record<string, ElementData> = { ...state.elements };

          for (const [elementId, data] of Object.entries(updates)) {
            nextElements[elementId] = {
              ...(nextElements[elementId] ?? {}),
              ...data,
            };
          }

          return { elements: nextElements };
        });
      },
    })),
  ) as BroadsetDataStore;
}
