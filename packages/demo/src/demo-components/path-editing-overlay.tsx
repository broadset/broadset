import {
  type EditorStore,
  extractHandles,
  parsePath,
  type PathHandle,
  type PathSegment,
  refitPathBoundsFromSvg,
  serializePath,
} from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ANCHOR_RADIUS_PX = 5;
const CONTROL_RADIUS_PX = 4;
const HANDLE_STROKE_WIDTH_PX = 1.5;
const CONTROL_LINE_WIDTH_PX = 1;
const HANDLE_STROKE_COLOR = '#4285f4';
const HANDLE_FILL_COLOR = '#ffffff';

type DragState = {
  readonly handleKey: string;
  readonly segments: readonly PathSegment[];
  readonly segmentIndex: number;
  readonly xIndex: number;
  readonly yIndex: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startValueX: number;
  readonly startValueY: number;
  readonly pointerToCanvas: number;
  latestContent: string | null;
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

function buildHandleKey(handle: PathHandle): string {
  return `${String(handle.segmentIndex)}:${String(handle.xIndex)}:${String(handle.yIndex)}:${handle.type}`;
}

function patchSegments(
  segments: readonly PathSegment[],
  segmentIndex: number,
  xIndex: number,
  yIndex: number,
  nextX: number,
  nextY: number,
): readonly PathSegment[] {
  return segments.map((segment, index) => {
    if (index !== segmentIndex) return segment;

    const nextCoords = [...segment.coords];

    if (xIndex >= 0) nextCoords[xIndex] = nextX;
    if (yIndex >= 0) nextCoords[yIndex] = nextY;

    return { command: segment.command, coords: nextCoords };
  });
}

function findOwningAnchor(handles: readonly PathHandle[], controlIndex: number): PathHandle | null {
  const control = handles[controlIndex];

  if (control === undefined) return null;

  for (let index = controlIndex + 1; index < handles.length; index += 1) {
    const candidate = handles[index];

    if (candidate?.segmentIndex === control.segmentIndex && candidate.type === 'anchor') {
      return candidate;
    }
  }

  for (let index = controlIndex - 1; index >= 0; index -= 1) {
    const candidate = handles[index];

    if (candidate?.type === 'anchor') {
      return candidate;
    }
  }

  return null;
}

/**
 * Interactive SVG overlay for path editing mode. Renders draggable anchor and
 * Bézier-control handles over a path element. Lives inside the renderer's
 * overlayRoot so it shares the same pan/zoom/contentScale transform chain as
 * the rendered path, keeping handles pixel-aligned without any arithmetic
 * duplication.
 *
 * On unmount (when path editing exits) the element's bounding box is refitted
 * to the rendered SVG's tight bbox — this commits curve-accurate bounds that
 * are impossible to compute from path commands alone.
 */
export function PathEditingOverlay({
  element,
  editorStore,
  overlayRoot,
}: {
  readonly element: BroadsetElement;
  readonly editorStore: EditorStore;
  readonly overlayRoot: HTMLElement;
}): React.ReactPortal | null {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const elementRef = useRef(element);
  const [pointerToCanvas, setPointerToCanvas] = useState(() => measureOverlayRatio(overlayRoot));

  useEffect(() => {
    elementRef.current = element;
  }, [element]);

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

  const segments = useMemo(() => parsePath(element.content), [element.content]);
  const handles = useMemo(() => extractHandles(segments), [segments]);

  const screenPxPerCanvasUnit = 1 / pointerToCanvas;
  const anchorRadius = ANCHOR_RADIUS_PX * screenPxPerCanvasUnit;
  const controlRadius = CONTROL_RADIUS_PX * screenPxPerCanvasUnit;
  const handleStrokeWidth = HANDLE_STROKE_WIDTH_PX * screenPxPerCanvasUnit;
  const controlLineWidth = CONTROL_LINE_WIDTH_PX * screenPxPerCanvasUnit;

  const beginDrag = useCallback(
    (handle: PathHandle) =>
      (event: React.PointerEvent<SVGCircleElement>): void => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        const latestSegments = parsePath(elementRef.current.content);
        const segment = latestSegments[handle.segmentIndex];
        const startValueX = handle.xIndex >= 0 ? (segment?.coords[handle.xIndex] ?? 0) : Number.NaN;
        const startValueY = handle.yIndex >= 0 ? (segment?.coords[handle.yIndex] ?? 0) : Number.NaN;

        dragStateRef.current = {
          handleKey: buildHandleKey(handle),
          latestContent: null,
          pointerToCanvas,
          segmentIndex: handle.segmentIndex,
          segments: latestSegments,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startValueX,
          startValueY,
          xIndex: handle.xIndex,
          yIndex: handle.yIndex,
        };
      },
    [pointerToCanvas],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGCircleElement>): void => {
      const drag = dragStateRef.current;

      if (drag === null) return;

      event.preventDefault();

      const deltaCanvasX = (event.clientX - drag.startClientX) * drag.pointerToCanvas;
      const deltaCanvasY = (event.clientY - drag.startClientY) * drag.pointerToCanvas;
      const nextX = drag.xIndex >= 0 ? drag.startValueX + deltaCanvasX : 0;
      const nextY = drag.yIndex >= 0 ? drag.startValueY + deltaCanvasY : 0;
      const nextSegments = patchSegments(drag.segments, drag.segmentIndex, drag.xIndex, drag.yIndex, nextX, nextY);
      const nextContent = serializePath(nextSegments);

      drag.latestContent = nextContent;
      editorStore.getState().updateElementEphemeral(elementRef.current.id, { content: nextContent });
    },
    [editorStore],
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGCircleElement>): void => {
      const drag = dragStateRef.current;

      if (drag === null) return;

      event.preventDefault();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      dragStateRef.current = null;

      if (drag.latestContent !== null) {
        editorStore.getState().commitElementUpdate(elementRef.current.id, { content: drag.latestContent });
      }
    },
    [editorStore],
  );

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;

    return () => {
      const currentElement = elementRef.current;

      if (svg === null || path === null) return;

      try {
        const bbox = path.getBBox();

        if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return;

        const refit = refitPathBoundsFromSvg({
          pathData: currentElement.content,
          strokeWidth: currentElement.style.strokeWidth ?? 1,
          svgBBox: { height: bbox.height, width: bbox.width, x: bbox.x, y: bbox.y },
        });

        editorStore.getState().commitElementUpdate(currentElement.id, {
          content: refit.pathData,
          height: refit.height,
          position: { x: currentElement.position.x + refit.x, y: currentElement.position.y + refit.y },
          width: refit.width,
        });
      } catch {
        // getBBox may throw if the SVG has been detached; bounds refit is a best-effort tidy-up.
      }
    };
  }, [editorStore]);

  return createPortal(
    <div
      data-testid="path-editing-overlay"
      style={{
        height: `${String(Math.max(element.height, 1))}px`,
        left: `${String(element.position.x)}px`,
        pointerEvents: 'none',
        position: 'absolute',
        top: `${String(element.position.y)}px`,
        width: `${String(Math.max(element.width, 1))}px`,
      }}
    >
      <svg
        ref={svgRef}
        height="100%"
        style={{ overflow: 'visible', pointerEvents: 'none' }}
        viewBox={`0 0 ${String(Math.max(element.width, 1))} ${String(Math.max(element.height, 1))}`}
        width="100%"
      >
        <path
          ref={pathRef}
          d={element.content}
          fill="none"
          stroke="transparent"
          strokeWidth={0}
          vectorEffect="non-scaling-stroke"
        />
        {handles.map((handle, index) => {
          if (handle.type !== 'control') return null;

          const anchor = findOwningAnchor(handles, index);

          if (anchor === null) return null;

          const x1 = Number.isNaN(handle.x) ? 0 : handle.x;
          const y1 = Number.isNaN(handle.y) ? 0 : handle.y;
          const x2 = Number.isNaN(anchor.x) ? 0 : anchor.x;
          const y2 = Number.isNaN(anchor.y) ? 0 : anchor.y;

          return (
            <line
              key={`${buildHandleKey(handle)}-line`}
              opacity={0.5}
              stroke={HANDLE_STROKE_COLOR}
              strokeWidth={controlLineWidth}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
            />
          );
        })}
        {handles.map((handle) => {
          const cx = Number.isNaN(handle.x) ? 0 : handle.x;
          const cy = Number.isNaN(handle.y) ? 0 : handle.y;
          const radius = handle.type === 'anchor' ? anchorRadius : controlRadius;
          const fill = handle.type === 'anchor' ? HANDLE_FILL_COLOR : 'transparent';

          return (
            <circle
              key={buildHandleKey(handle)}
              cx={cx}
              cy={cy}
              data-testid={`path-handle-${handle.type}-${String(handle.segmentIndex)}`}
              fill={fill}
              r={radius}
              stroke={HANDLE_STROKE_COLOR}
              strokeWidth={handleStrokeWidth}
              style={{ cursor: 'pointer', pointerEvents: 'auto' }}
              onPointerCancel={finishDrag}
              onPointerDown={beginDrag(handle)}
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
