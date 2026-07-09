import {
  deleteClipPathPoint,
  type EditorStore,
  insertClipPathPoint,
  parsePolygonPoints,
  updateClipPathPoint,
} from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const HANDLE_RADIUS_PX = 6;
const HANDLE_STROKE_WIDTH_PX = 1.5;
const MIDPOINT_RADIUS_PX = 4;
const POLYGON_STROKE_WIDTH_PX = 1;
const HANDLE_STROKE_COLOR = '#4285f4';
const HANDLE_FILL_COLOR = '#ffffff';
const MIDPOINT_FILL_COLOR = 'rgba(66, 133, 244, 0.35)';

type PolygonPoint = { readonly x: number; readonly y: number };

type DragState = {
  readonly index: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startX: number;
  readonly startY: number;
  readonly pointerToCanvas: number;
  readonly elementWidth: number;
  readonly elementHeight: number;
};

function measureOverlayRatio(overlayRoot: HTMLElement): number {
  const rect = overlayRoot.getBoundingClientRect();
  const logicalWidth = overlayRoot.offsetWidth;

  if (logicalWidth <= 0 || rect.width <= 0) {
    return 1;
  }

  const ratio = rect.width / logicalWidth;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;

  return value;
}

/**
 * Interactive SVG overlay for clip-path editing. Renders one draggable handle
 * per polygon vertex plus a smaller midpoint handle on each edge that inserts
 * a new vertex on click. Lives inside the renderer's overlayRoot so it shares
 * the element transform chain, then counter-scales handle chips so they stay
 * constant on screen at any zoom.
 *
 * Alt-click on a vertex deletes it (the store enforces the 3-point minimum).
 */
export function ClipPathEditingOverlay({
  element,
  editorStore,
  overlayRoot,
}: {
  readonly element: BroadsetElement;
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
}): React.ReactPortal | null {
  const dragStateRef = useRef<DragState | null>(null);
  const [pointerToCanvas, setPointerToCanvas] = useState(() => measureOverlayRatio(overlayRoot));

  useLayoutEffect(() => {
    const measure = (): void => {
      const nextRatio = measureOverlayRatio(overlayRoot);

      setPointerToCanvas((previous) => (nextRatio === previous ? previous : nextRatio));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(overlayRoot);

    return () => {
      observer.disconnect();
    };
  }, [overlayRoot]);

  const points: readonly PolygonPoint[] = useMemo(() => {
    const parsed = parsePolygonPoints(element.style.customClipPath ?? '');

    return parsed ?? [];
  }, [element.style.customClipPath]);

  const screenPxPerCanvasUnit = 1 / pointerToCanvas;
  const handleRadius = HANDLE_RADIUS_PX * screenPxPerCanvasUnit;
  const midpointRadius = MIDPOINT_RADIUS_PX * screenPxPerCanvasUnit;
  const handleStrokeWidth = HANDLE_STROKE_WIDTH_PX * screenPxPerCanvasUnit;
  const polygonStrokeWidth = POLYGON_STROKE_WIDTH_PX * screenPxPerCanvasUnit;

  const elementWidth = Math.max(element.width, 1);
  const elementHeight = Math.max(element.height, 1);

  const beginDrag = useCallback(
    (index: number) =>
      (event: React.PointerEvent<SVGCircleElement>): void => {
        if (event.button !== 0) return;

        if (event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          deleteClipPathPoint(editorStore, index);

          return;
        }

        const point = points[index];

        if (point === undefined) return;

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        dragStateRef.current = {
          elementHeight,
          elementWidth,
          index,
          pointerToCanvas,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: point.x,
          startY: point.y,
        };
      },
    [editorStore, elementHeight, elementWidth, pointerToCanvas, points],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGCircleElement>): void => {
      const drag = dragStateRef.current;

      if (drag === null) return;

      event.preventDefault();

      const deltaCanvasX = (event.clientX - drag.startClientX) * drag.pointerToCanvas;
      const deltaCanvasY = (event.clientY - drag.startClientY) * drag.pointerToCanvas;
      const nextPercentX = clampPercent(drag.startX + (deltaCanvasX / drag.elementWidth) * 100);
      const nextPercentY = clampPercent(drag.startY + (deltaCanvasY / drag.elementHeight) * 100);

      updateClipPathPoint(editorStore, drag.index, nextPercentX, nextPercentY);
    },
    [editorStore],
  );

  const finishDrag = useCallback((event: React.PointerEvent<SVGCircleElement>): void => {
    if (dragStateRef.current === null) return;

    event.preventDefault();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
  }, []);

  const handleMidpointClick = useCallback(
    (afterIndex: number, nextPoint: PolygonPoint) =>
      (event: React.MouseEvent<SVGCircleElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        insertClipPathPoint(editorStore, afterIndex, nextPoint.x, nextPoint.y);
      },
    [editorStore],
  );

  if (points.length === 0) return null;

  const polygonPath = points
    .map((point, index) => {
      const x = (point.x / 100) * elementWidth;
      const y = (point.y / 100) * elementHeight;

      return `${index === 0 ? 'M' : 'L'}${String(x)},${String(y)}`;
    })
    .concat('Z')
    .join(' ');

  return createPortal(
    <div
      data-testid="clip-path-editing-overlay"
      style={{
        height: `${String(elementHeight)}px`,
        left: `${String(element.position.x)}px`,
        pointerEvents: 'none',
        position: 'absolute',
        top: `${String(element.position.y)}px`,
        width: `${String(elementWidth)}px`,
      }}
    >
      <svg
        height="100%"
        style={{ overflow: 'visible', pointerEvents: 'none' }}
        viewBox={`0 0 ${String(elementWidth)} ${String(elementHeight)}`}
        width="100%"
      >
        <path
          d={polygonPath}
          fill="rgba(66, 133, 244, 0.08)"
          stroke={HANDLE_STROKE_COLOR}
          strokeDasharray={`${String(4 * screenPxPerCanvasUnit)} ${String(4 * screenPxPerCanvasUnit)}`}
          strokeWidth={polygonStrokeWidth}
        />
        {points.map((point, index) => {
          const nextIndex = (index + 1) % points.length;
          const nextPoint = points[nextIndex];

          if (nextPoint === undefined) return null;

          const midX = ((point.x + nextPoint.x) / 2 / 100) * elementWidth;
          const midY = ((point.y + nextPoint.y) / 2 / 100) * elementHeight;
          const midPercent: PolygonPoint = { x: (point.x + nextPoint.x) / 2, y: (point.y + nextPoint.y) / 2 };

          return (
            <circle
              key={`midpoint-${String(index)}`}
              cx={midX}
              cy={midY}
              data-testid={`clip-path-midpoint-${String(index)}`}
              fill={MIDPOINT_FILL_COLOR}
              r={midpointRadius}
              stroke={HANDLE_STROKE_COLOR}
              strokeWidth={handleStrokeWidth}
              style={{ cursor: 'copy', pointerEvents: 'auto' }}
              onClick={handleMidpointClick(index, midPercent)}
            />
          );
        })}
        {points.map((point, index) => {
          const cx = (point.x / 100) * elementWidth;
          const cy = (point.y / 100) * elementHeight;

          return (
            <circle
              key={`handle-${String(index)}`}
              cx={cx}
              cy={cy}
              data-testid={`clip-path-handle-${String(index)}`}
              fill={HANDLE_FILL_COLOR}
              r={handleRadius}
              stroke={HANDLE_STROKE_COLOR}
              strokeWidth={handleStrokeWidth}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onPointerCancel={finishDrag}
              onPointerDown={beginDrag(index)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDrag}
            />
          );
        })}
      </svg>
    </div>,
    overlayRoot,
  );
}
