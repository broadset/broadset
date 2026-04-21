import type { EditorStore, PlacementState } from '@broadset/editor';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const DASH_ARRAY = '4 3';
const STROKE_COLOR = '#4285f4';
const FILL_COLOR = 'rgba(66, 133, 244, 0.08)';
const STROKE_WIDTH_PX = 1;
const VERTEX_RADIUS_PX = 3;
const PATH_POINT_EXPRESSION = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;

interface PlacementOverlaySnapshot {
  readonly placement: PlacementState | null;
  readonly preview: { readonly x: number; readonly y: number } | null;
  readonly pathDrawingElementId: string | null;
  readonly pathLastVertex: { readonly x: number; readonly y: number } | null;
}

function snapshotEquals(left: PlacementOverlaySnapshot, right: PlacementOverlaySnapshot): boolean {
  return (
    left.placement === right.placement &&
    left.preview === right.preview &&
    left.pathDrawingElementId === right.pathDrawingElementId &&
    left.pathLastVertex?.x === right.pathLastVertex?.x &&
    left.pathLastVertex?.y === right.pathLastVertex?.y
  );
}

function readPathLastVertex(
  store: EditorStore,
  drawingId: string | null,
): { readonly x: number; readonly y: number } | null {
  if (drawingId === null) return null;

  const state = store.getState();
  const element = state.document.elements.find((candidate) => candidate.id === drawingId);

  if (element === undefined) return null;

  // Find the last M/L point in content, map to world coords using element position.
  const matches = Array.from(element.content.matchAll(PATH_POINT_EXPRESSION));
  const last = matches.at(-1);

  if (last === undefined) return null;

  const relativeX = Number.parseFloat(last[2] ?? '0');
  const relativeY = Number.parseFloat(last[3] ?? '0');

  return {
    x: element.position.x + relativeX,
    y: element.position.y + relativeY,
  };
}

function readSnapshot(store: EditorStore): PlacementOverlaySnapshot {
  const state = store.getState();

  return {
    placement: state.placement,
    preview: state.placementPreview,
    pathDrawingElementId: state.pathDrawingElementId,
    pathLastVertex: readPathLastVertex(store, state.pathDrawingElementId),
  };
}

function usePlacementSnapshot(store: EditorStore): PlacementOverlaySnapshot {
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

function renderPlacementShape(
  placement: PlacementState,
  preview: { readonly x: number; readonly y: number },
): React.ReactNode {
  if (placement.type === 'placement-extent') {
    const x = Math.min(placement.anchor.x, preview.x);
    const y = Math.min(placement.anchor.y, preview.y);
    const width = Math.max(Math.abs(preview.x - placement.anchor.x), 1);
    const height = Math.max(Math.abs(preview.y - placement.anchor.y), 1);

    return (
      <rect
        data-testid="placement-preview-rect"
        fill={FILL_COLOR}
        height={height}
        stroke={STROKE_COLOR}
        strokeDasharray={DASH_ARRAY}
        strokeWidth={STROKE_WIDTH_PX}
        vectorEffect="non-scaling-stroke"
        width={width}
        x={x}
        y={y}
      />
    );
  }

  if (placement.type === 'placement-ellipse-radius') {
    const rx = Math.max(Math.abs(preview.x - placement.anchor.x), 1);
    const ry = Math.max(Math.abs(preview.y - placement.anchor.y), 1);

    return (
      <ellipse
        cx={placement.anchor.x}
        cy={placement.anchor.y}
        data-testid="placement-preview-ellipse"
        fill={FILL_COLOR}
        rx={rx}
        ry={ry}
        stroke={STROKE_COLOR}
        strokeDasharray={DASH_ARRAY}
        strokeWidth={STROKE_WIDTH_PX}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  if (placement.type === 'placement-ellipse-rotation') {
    const rotationDegrees =
      (Math.atan2(preview.y - placement.anchor.y, preview.x - placement.anchor.x) * 180) / Math.PI;

    return (
      <ellipse
        cx={placement.anchor.x}
        cy={placement.anchor.y}
        data-testid="placement-preview-ellipse-rotation"
        fill={FILL_COLOR}
        rx={Math.max(placement.radius.rx, 1)}
        ry={Math.max(placement.radius.ry, 1)}
        stroke={STROKE_COLOR}
        strokeDasharray={DASH_ARRAY}
        strokeWidth={STROKE_WIDTH_PX}
        transform={`rotate(${String(rotationDegrees)} ${String(placement.anchor.x)} ${String(placement.anchor.y)})`}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return (
    <circle
      cx={preview.x}
      cy={preview.y}
      data-testid="placement-preview-anchor"
      fill={FILL_COLOR}
      r={VERTEX_RADIUS_PX}
      stroke={STROKE_COLOR}
      strokeWidth={STROKE_WIDTH_PX}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function renderPathDrawingPreview(
  lastVertex: { readonly x: number; readonly y: number },
  preview: { readonly x: number; readonly y: number },
): React.ReactNode {
  return (
    <line
      data-testid="placement-preview-path-line"
      stroke={STROKE_COLOR}
      strokeDasharray={DASH_ARRAY}
      strokeWidth={STROKE_WIDTH_PX}
      vectorEffect="non-scaling-stroke"
      x1={lastVertex.x}
      x2={preview.x}
      y1={lastVertex.y}
      y2={preview.y}
    />
  );
}

function resolvePreviewContent(snapshot: PlacementOverlaySnapshot): React.ReactNode {
  const { preview } = snapshot;

  if (preview === null) return null;

  if (snapshot.pathDrawingElementId !== null && snapshot.pathLastVertex !== null) {
    return renderPathDrawingPreview(snapshot.pathLastVertex, preview);
  }

  if (snapshot.placement !== null) {
    return renderPlacementShape(snapshot.placement, preview);
  }

  return null;
}

interface PlacementPreviewOverlayProps {
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
}

export function PlacementPreviewOverlay({
  editorStore,
  overlayRoot,
}: PlacementPreviewOverlayProps): React.JSX.Element | null {
  const snapshot = usePlacementSnapshot(editorStore);

  if (snapshot.preview === null) {
    return null;
  }

  // Path-drawing takes priority when active: rubber-band from the last committed
  // vertex to the current cursor position.
  const content = resolvePreviewContent(snapshot);

  if (content === null) {
    return null;
  }

  return createPortal(
    <svg
      data-testid="placement-preview-overlay"
      style={{
        height: '100%',
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        width: '100%',
      }}
    >
      {content}
    </svg>,
    overlayRoot,
  );
}
