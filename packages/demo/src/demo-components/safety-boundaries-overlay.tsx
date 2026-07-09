import { computeSafetyBoundaries, type EditorStore } from '@broadset/editor';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const BROADCAST_OVERLAY_FILL = 'rgba(220, 38, 38, 0.2)';
const PRINT_OVERLAY_FILL = 'rgba(37, 99, 235, 0.2)';
const BOUNDARY_TEST_IDS = ['top', 'right', 'bottom', 'left'] as const;

type ViewMode = 'broadcast' | 'print' | 'none';

interface SafetyBoundariesSnapshot {
  readonly viewMode: ViewMode;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly padding: readonly [number, number, number, number];
}

function snapshotEquals(left: SafetyBoundariesSnapshot, right: SafetyBoundariesSnapshot): boolean {
  return (
    left.viewMode === right.viewMode &&
    left.canvasWidth === right.canvasWidth &&
    left.canvasHeight === right.canvasHeight &&
    left.padding[0] === right.padding[0] &&
    left.padding[1] === right.padding[1] &&
    left.padding[2] === right.padding[2] &&
    left.padding[3] === right.padding[3]
  );
}

function readSnapshot(store: EditorStore): SafetyBoundariesSnapshot {
  const state = store.getState();

  return {
    viewMode: state.canvasSettings.viewMode,
    canvasWidth: state.document.canvas.width,
    canvasHeight: state.document.canvas.height,
    padding: state.document.canvas.padding,
  };
}

function useSafetyBoundariesSnapshot(store: EditorStore): SafetyBoundariesSnapshot {
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

interface SafetyBoundariesOverlayProps {
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
}

export function SafetyBoundariesOverlay({
  editorStore,
  overlayRoot,
}: SafetyBoundariesOverlayProps): React.JSX.Element | null {
  const { viewMode, canvasWidth, canvasHeight, padding } = useSafetyBoundariesSnapshot(editorStore);

  if (viewMode === 'none' || canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }

  const boundaries = computeSafetyBoundaries({
    canvasWidth,
    canvasHeight,
    padding,
    viewMode,
  });

  if (boundaries.length === 0) {
    return null;
  }

  const fill = viewMode === 'print' ? PRINT_OVERLAY_FILL : BROADCAST_OVERLAY_FILL;

  return createPortal(
    <svg
      data-testid="safety-boundaries-overlay"
      style={{
        height: '100%',
        left: 0,
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        width: '100%',
      }}
      viewBox={`0 0 ${String(canvasWidth)} ${String(canvasHeight)}`}
    >
      {boundaries.map((boundary, index) => (
        <rect
          key={`${BOUNDARY_TEST_IDS[index] ?? String(index)}-${String(boundary.x)}-${String(boundary.y)}`}
          data-testid={`safety-boundary-${BOUNDARY_TEST_IDS[index] ?? String(index)}`}
          fill={fill}
          height={boundary.height}
          x={boundary.x}
          y={boundary.y}
          width={boundary.width}
        />
      ))}
    </svg>,
    overlayRoot,
  );
}
