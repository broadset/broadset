import type { EditorStore } from '@broadset/editor';
import { useCallback, useRef, useSyncExternalStore } from 'react';

import { ELEMENT_TOOL_TYPES } from './constants';

export function useEditorSnapshot(store: EditorStore) {
  return useSyncExternalStore(
    (onStoreChange) =>
      store.subscribe(() => {
        onStoreChange();
      }),
    () => store.getState(),
    () => store.getState(),
  );
}

type SnapshotSelector<TSelected> = (state: ReturnType<EditorStore['getState']>) => TSelected;
type SnapshotEquality<TSelected> = (left: TSelected, right: TSelected) => boolean;

export function useEditorSelector<TSelected>(
  store: EditorStore,
  selector: SnapshotSelector<TSelected>,
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

export interface CanvasViewportSnapshot {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

function areViewportsEqual(left: CanvasViewportSnapshot, right: CanvasViewportSnapshot): boolean {
  return left.zoom === right.zoom && left.panX === right.panX && left.panY === right.panY;
}

export function useCanvasViewport(store: EditorStore): CanvasViewportSnapshot {
  const selector = useCallback(
    (state: ReturnType<EditorStore['getState']>): CanvasViewportSnapshot => ({
      panX: state.canvasSettings.panX,
      panY: state.canvasSettings.panY,
      zoom: state.canvasSettings.zoom,
    }),
    [],
  );

  return useEditorSelector(store, selector, areViewportsEqual);
}

export function useCanvasZoomPercent(store: EditorStore): number {
  return useEditorSelector(store, (state) => Math.round(state.canvasSettings.zoom * 100));
}

export function getElementLabel(type: string | null): string {
  if (type === null) {
    return 'Element';
  }

  return ELEMENT_TOOL_TYPES.find((entry) => entry.type === type)?.label ?? type;
}
