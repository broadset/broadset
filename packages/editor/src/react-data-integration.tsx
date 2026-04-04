import type { ReactNode } from 'react';
import React, { Component, createContext, useContext, useSyncExternalStore } from 'react';

import type { BroadsetDataStore, DataStoreState, ElementData } from './data-store';
import type { EditorStore } from './store-actions';

/* =========================================================
   BroadsetDataStore React integration
   ========================================================= */

const DataStoreContext = createContext<BroadsetDataStore | null>(null);

/** Provider that makes a BroadsetDataStore available to descendant components. */
export function BroadsetDataStoreProvider({
  store,
  children,
}: {
  readonly store: BroadsetDataStore;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <DataStoreContext.Provider value={store}>{children}</DataStoreContext.Provider>;
}

/**
 * Returns the element data for a given element ID.
 * Must be called inside a `BroadsetDataStoreProvider`.
 * Throws if used outside the provider.
 */
export function useElementData(elementId: string): ElementData | undefined {
  const store = useContext(DataStoreContext);

  if (store === null) {
    throw new Error('useElementData must be used inside a BroadsetDataStoreProvider');
  }

  return useSyncExternalStore(
    (onStoreChange) => {
      return store.subscribe((state: DataStoreState) => state.elements[elementId], onStoreChange);
    },
    () => store.getState().elements[elementId],
  );
}

/**
 * Returns the raw data store API or null when outside a provider.
 * This is intentionally nullable for safe optional use.
 */
export function useDataStoreApi(): BroadsetDataStore | null {
  return useContext(DataStoreContext);
}

/* =========================================================
   Editor Provider
   ========================================================= */

interface EditorContextValue {
  readonly store: EditorStore;
  readonly components: ReadonlyArray<{ readonly type: string; readonly [key: string]: unknown }>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

/** Provider that wires the editor store, data store, and component registry. */
export function EditorProvider({
  store,
  dataStore,
  components,
  children,
}: {
  readonly store: EditorStore;
  readonly dataStore: BroadsetDataStore | null;
  readonly components?: ReadonlyArray<{ readonly type: string; readonly [key: string]: unknown }>;
  readonly children: ReactNode;
}): React.JSX.Element {
  const value: EditorContextValue = {
    store,
    components: components ?? [],
  };

  const inner = <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;

  if (dataStore !== null) {
    return <BroadsetDataStoreProvider store={dataStore}>{inner}</BroadsetDataStoreProvider>;
  }

  return inner;
}

/** Returns the editor store. Must be inside an EditorProvider. */
export function useEditorStore(): EditorStore {
  const ctx = useContext(EditorContext);

  if (ctx === null) {
    throw new Error('useEditorStore must be used inside an EditorProvider');
  }

  return ctx.store;
}

/** Returns registered component plugins. Must be inside an EditorProvider. */
export function useComponentRegistry(): ReadonlyArray<{ readonly type: string; readonly [key: string]: unknown }> {
  const ctx = useContext(EditorContext);

  if (ctx === null) {
    throw new Error('useComponentRegistry must be used inside an EditorProvider');
  }

  return ctx.components;
}

/* =========================================================
   Error Boundary
   ========================================================= */

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Error boundary that catches rendering errors and shows a recovery UI.
 */
export class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('EditorErrorBoundary caught an error:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h2>Something went wrong</h2>
          <p style={{ marginTop: '1rem', opacity: 0.7 }}>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
