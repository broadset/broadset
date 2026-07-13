import { useCallback, useRef, useSyncExternalStore } from 'react';

interface SelectorStore<TState> {
  readonly getState: () => TState;
  readonly subscribe: (listener: () => void) => () => void;
}

type SnapshotSelector<TState, TSelected> = (state: TState) => TSelected;
type SnapshotEquality<TSelected> = (left: TSelected, right: TSelected) => boolean;

export function useEditorSelector<TState, TSelected>(
  store: SelectorStore<TState>,
  selector: SnapshotSelector<TState, TSelected>,
  equality: SnapshotEquality<TSelected> = Object.is,
): TSelected {
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equality);
  const selectedRef = useRef(selector(store.getState()));

  selectorRef.current = selector;
  equalityRef.current = equality;

  return useSyncExternalStore(
    (onStoreChange) =>
      store.subscribe(() => {
        onStoreChange();
      }),
    () => {
      const nextValue = selectorRef.current(store.getState());

      if (!equalityRef.current(selectedRef.current, nextValue)) {
        selectedRef.current = nextValue;
      }

      return selectedRef.current;
    },
    () => selectedRef.current,
  );
}

interface CanvasViewportSnapshot {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly perspective: number;
}

interface CanvasViewportHostState {
  readonly canvasSettings: CanvasViewportSnapshot;
}

function areViewportsEqual(left: CanvasViewportSnapshot, right: CanvasViewportSnapshot): boolean {
  return (
    left.zoom === right.zoom &&
    left.panX === right.panX &&
    left.panY === right.panY &&
    left.perspective === right.perspective
  );
}

export function useCanvasViewport<TState extends CanvasViewportHostState>(
  store: SelectorStore<TState>,
): CanvasViewportSnapshot {
  const selector = useCallback(
    (state: TState): CanvasViewportSnapshot => ({
      panX: state.canvasSettings.panX,
      panY: state.canvasSettings.panY,
      zoom: state.canvasSettings.zoom,
      perspective: state.canvasSettings.perspective,
    }),
    [],
  );

  return useEditorSelector(store, selector, areViewportsEqual);
}

export function useCanvasZoomPercent<TState extends CanvasViewportHostState>(store: SelectorStore<TState>): number {
  return useEditorSelector(store, (state) => Math.round(state.canvasSettings.zoom * 100));
}
