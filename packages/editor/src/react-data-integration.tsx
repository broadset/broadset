import React, {
  Component,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { BroadsetDataStore, ElementData } from './data-store';
import type { EditorStore } from './store-actions';

const DataStoreContext = createContext<BroadsetDataStore | null>(null);

const EditorContext = createContext<{
  readonly store: EditorStore;
  readonly components: ReadonlyArray<{
    readonly type: string;
    readonly [key: string]: unknown;
  }>;
} | null>(null);

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

/** Returns the element data for a given element ID and enforces provider scope. */
export function useElementData(elementId: string): ElementData | undefined {
  const store = useContext(DataStoreContext);

  if (store === null) {
    throw new Error('useElementData must be used inside a BroadsetDataStoreProvider');
  }

  return useSyncExternalStore(
    (onStoreChange) =>
      store.subscribe(
        (state) => state.elements[elementId],
        (_value, _previousValue) => {
          onStoreChange();
        },
      ),
    () => store.getState().elements[elementId],
  );
}

/** Returns the raw data store API or null when outside provider scope. */
export function useDataStoreApi(): BroadsetDataStore | null {
  return useContext(DataStoreContext);
}

/** Provider that wires the editor store, optional runtime data store, and component registry. */
export function EditorProvider({
  store,
  dataStore,
  components,
  children,
}: {
  readonly store: EditorStore;
  readonly dataStore: BroadsetDataStore | null;
  readonly components?: ReadonlyArray<{
    readonly type: string;
    readonly [key: string]: unknown;
  }>;
  readonly children: ReactNode;
}): React.JSX.Element {
  const editorTree = (
    <EditorContext.Provider value={{ store, components: components ?? [] }}>{children}</EditorContext.Provider>
  );

  return dataStore === null ? editorTree : (
      <BroadsetDataStoreProvider store={dataStore}>{editorTree}</BroadsetDataStoreProvider>
    );
}

/** Returns the current editor store. Must be used inside an EditorProvider. */
export function useEditorStore(): EditorStore {
  const contextValue = useContext(EditorContext);

  if (contextValue === null) {
    throw new Error('useEditorStore must be used inside an EditorProvider');
  }

  return contextValue.store;
}

/** Returns the registered component plugins inside the EditorProvider tree. */
export function useComponentRegistry(): ReadonlyArray<{
  readonly type: string;
  readonly [key: string]: unknown;
}> {
  const contextValue = useContext(EditorContext);

  if (contextValue === null) {
    throw new Error('useComponentRegistry must be used inside an EditorProvider');
  }

  return contextValue.components;
}

export interface PlaybackState {
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly speed: number;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seek: (timeMs: number) => void;
  readonly stop: () => void;
}

const PlaybackContext = createContext<PlaybackState | null>(null);

/** Provider that manages timeline playback state for descendant components. */
export function PlaybackProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Playback speed is fixed at 1.0 for now. Wrap in useState if dynamic
  // playback speed (e.g. 0.5x / 2x scrubbing) is ever added.
  const speed = 1;
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      return;
    }

    const tick = (now: number): void => {
      if (lastFrameRef.current !== null) {
        const delta = (now - lastFrameRef.current) * speed;

        setCurrentTime((prev) => prev + delta);
      }

      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seek = useCallback((timeMs: number) => {
    setCurrentTime(timeMs);
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const state: PlaybackState = useMemo(
    () => ({
      isPlaying,
      currentTime,
      speed,
      play,
      pause,
      seek,
      stop,
    }),
    [isPlaying, currentTime, play, pause, seek, stop],
  );

  return <PlaybackContext.Provider value={state}>{children}</PlaybackContext.Provider>;
}

/** Returns playback state and controls. Must be used inside a PlaybackProvider. */
export function usePlayback(): PlaybackState {
  const context = useContext(PlaybackContext);

  if (context === null) {
    throw new Error('usePlayback must be used inside a PlaybackProvider');
  }

  return context;
}

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/** Error boundary that keeps the app running and shows a recovery UI when the editor subtree throws. */
export class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('EditorErrorBoundary caught an error:', error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div
          style={{
            display: 'flex',
            minHeight: '100%',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface, rgba(15, 23, 42, 0.92))',
            padding: '2rem',
          }}
        >
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <div aria-hidden="true" style={{ color: 'var(--danger, #ef4444)', fontSize: '1.5rem' }}>
              ⚠
            </div>
            <h2 style={{ margin: '0.5rem 0 0', fontSize: '1.25rem' }}>Something went wrong</h2>
            <p style={{ marginTop: '0.75rem', opacity: 0.8 }}>{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              style={{
                marginTop: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid transparent',
                backgroundColor: 'var(--primary, #2563eb)',
                color: '#ffffff',
                padding: '0.625rem 1rem',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
