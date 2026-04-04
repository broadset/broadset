import { subscribeWithSelector } from 'zustand/middleware';
import type { StoreApi } from 'zustand/vanilla';
import { createStore } from 'zustand/vanilla';

/** Runtime element data — arbitrary key-value pairs injected at runtime. */
export type ElementData = Record<string, unknown>;

/** The element data map keyed by element ID. */
export type ElementDataMap = Record<string, ElementData>;

/** State shape for the data store. */
export interface DataStoreState {
  readonly elements: ElementDataMap;

  /** Merge partial data into an element's existing data (shallow merge). */
  readonly updateElementData: (elementId: string, data: ElementData) => void;

  /** Fully replace an element's data, discarding all prior fields. */
  readonly setElementData: (elementId: string, data: ElementData) => void;

  /** Merge-update multiple elements in a single atomic notification. */
  readonly bulkUpdate: (updates: Record<string, ElementData>) => void;
}

/** The zustand store instance with selector-based subscriptions for runtime data. */
export interface BroadsetDataStore extends StoreApi<DataStoreState> {
  subscribe: {
    (listener: (state: DataStoreState, prev: DataStoreState) => void): () => void;
    <U>(selector: (state: DataStoreState) => U, listener: (value: U, prev: U) => void): () => void;
  };
}

/**
 * Creates an independent runtime data store.
 *
 * @param initialElements - Optional element data to seed the store with.
 */
export function createDataStore(initialElements?: ElementDataMap): BroadsetDataStore {
  return createStore<DataStoreState>()(
    subscribeWithSelector((set) => ({
      elements: initialElements ?? {},

      updateElementData(elementId: string, data: ElementData): void {
        set((state) => ({
          elements: {
            ...state.elements,
            [elementId]: { ...state.elements[elementId], ...data },
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

      bulkUpdate(updates: Record<string, ElementData>): void {
        set((state) => {
          const merged: ElementDataMap = { ...state.elements };

          for (const [id, data] of Object.entries(updates)) {
            merged[id] = { ...merged[id], ...data };
          }

          return { elements: merged };
        });
      },
    })),
  );
}
