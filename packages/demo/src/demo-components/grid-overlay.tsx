import type { EditorStore } from '@broadset/editor';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const GRID_STROKE_COLOR = 'rgba(148, 163, 184, 0.28)';
const GRID_STROKE_WIDTH_PX = 1;
const MIN_GRID_SIZE = 2;

interface GridOverlaySnapshot {
  readonly showGrid: boolean;
  readonly gridSize: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

function snapshotEquals(left: GridOverlaySnapshot, right: GridOverlaySnapshot): boolean {
  return (
    left.showGrid === right.showGrid &&
    left.gridSize === right.gridSize &&
    left.canvasWidth === right.canvasWidth &&
    left.canvasHeight === right.canvasHeight
  );
}

function readSnapshot(store: EditorStore): GridOverlaySnapshot {
  const state = store.getState();

  return {
    showGrid: state.gridSettings.showGrid,
    gridSize: state.gridSettings.gridSize,
    canvasWidth: state.document.canvas.width,
    canvasHeight: state.document.canvas.height,
  };
}

function useGridSnapshot(store: EditorStore): GridOverlaySnapshot {
  const cacheRef = useRef(readSnapshot(store));
  const subscribe = useMemo(
    () =>
      (onStoreChange: () => void): (() => void) =>
        store.subscribe(() => {
          const next = readSnapshot(store);

          if (!snapshotEquals(cacheRef.current, next)) {
            cacheRef.current = next;
            onStoreChange();
          }
        }),
    [store],
  );

  return useSyncExternalStore(
    subscribe,
    () => cacheRef.current,
    () => cacheRef.current,
  );
}

interface GridOverlayProps {
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
}

export function GridOverlay({ editorStore, overlayRoot }: GridOverlayProps): React.JSX.Element | null {
  const { showGrid, gridSize, canvasWidth, canvasHeight } = useGridSnapshot(editorStore);

  if (!showGrid || gridSize < MIN_GRID_SIZE || canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }

  const verticalLines: React.ReactNode[] = [];
  const horizontalLines: React.ReactNode[] = [];

  for (let x = gridSize; x < canvasWidth; x += gridSize) {
    verticalLines.push(
      <line
        key={`v-${String(x)}`}
        stroke={GRID_STROKE_COLOR}
        strokeWidth={GRID_STROKE_WIDTH_PX}
        vectorEffect="non-scaling-stroke"
        x1={x}
        x2={x}
        y1={0}
        y2={canvasHeight}
      />,
    );
  }

  for (let y = gridSize; y < canvasHeight; y += gridSize) {
    horizontalLines.push(
      <line
        key={`h-${String(y)}`}
        stroke={GRID_STROKE_COLOR}
        strokeWidth={GRID_STROKE_WIDTH_PX}
        vectorEffect="non-scaling-stroke"
        x1={0}
        x2={canvasWidth}
        y1={y}
        y2={y}
      />,
    );
  }

  return createPortal(
    <svg
      data-testid="grid-overlay"
      style={{
        height: '100%',
        left: 0,
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        width: '100%',
      }}
    >
      {verticalLines}
      {horizontalLines}
    </svg>,
    overlayRoot,
  );
}
