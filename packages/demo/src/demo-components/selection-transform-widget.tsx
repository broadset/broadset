import {
  applyDragTranslation,
  applyResize,
  applyRotation,
  type ElementUpdate,
  type ResizeHandle,
} from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import { buildElementTransform } from '@broadset/renderer';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  MIN_TRANSFORM_SIZE,
  ROTATION_HANDLE_OFFSET,
  TRANSFORM_HANDLE_CURSORS,
  TRANSFORM_HANDLE_SIZE,
  type TransformGesture,
} from '../demo-types';

/**
 * Resize-handle positions inside the widget, expressed in canvas units. The
 * widget itself lives in canvas-unit space (so it tracks the element under
 * any zoom, pan, or 3D transform), but handle chips need a constant on-screen
 * size. We counter-scale by `screenPxPerCanvasUnit = 1 / (zoom * contentScale)`
 * so a 10px handle with a -5px offset on screen resolves to
 * (10 * screenPxPerCanvasUnit) and (-5 * screenPxPerCanvasUnit) in canvas units.
 */
function measureOverlayRatio(overlayRoot: HTMLElement): number {
  const rect = overlayRoot.getBoundingClientRect();
  const logicalWidth = overlayRoot.offsetWidth;

  if (logicalWidth <= 0 || rect.width <= 0) {
    return 1;
  }

  const ratio = rect.width / logicalWidth;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function buildHandlePositions(screenPxPerCanvasUnit: number): Readonly<Record<ResizeHandle, React.CSSProperties>> {
  const halfSize = (TRANSFORM_HANDLE_SIZE * screenPxPerCanvasUnit) / 2;
  const edgeOffset = `${String(-halfSize)}px`;

  return {
    e: { right: edgeOffset, top: '50%', transform: 'translate(50%, -50%)' },
    n: { left: '50%', top: edgeOffset, transform: 'translate(-50%, -50%)' },
    ne: { right: edgeOffset, top: edgeOffset, transform: 'translate(50%, -50%)' },
    nw: { left: edgeOffset, top: edgeOffset, transform: 'translate(-50%, -50%)' },
    s: { bottom: edgeOffset, left: '50%', transform: 'translate(-50%, 50%)' },
    se: { bottom: edgeOffset, right: edgeOffset, transform: 'translate(50%, 50%)' },
    sw: { bottom: edgeOffset, left: edgeOffset, transform: 'translate(-50%, 50%)' },
    w: { left: edgeOffset, top: '50%', transform: 'translate(-50%, -50%)' },
  };
}

/**
 * The selection transform widget renders inside the renderer's overlay layer
 * (sibling of the element layer, inside canvasRoot). Because the overlay
 * shares the same transform chain as elements — translate(panX, panY) from
 * the demo's pan layer, scale(zoom) from the host, placeItems:center and
 * scale(contentScale) from the renderer, perspective from canvasSettings —
 * the widget uses raw canvas coordinates for its layout box and the full
 * element transform string for its CSS transform. No arithmetic duplicates
 * anything done by the renderer, so the widget cannot drift pixel-wise.
 */
export function SelectionTransformWidget({
  element,
  overlayRoot,
  zoom,
  onPreviewUpdate,
  onCommitUpdate,
  onDoubleClick,
}: {
  readonly element: BroadsetElement;
  readonly overlayRoot: HTMLElement;
  readonly zoom: number;
  readonly onPreviewUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onCommitUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onDoubleClick?: (elementId: string) => void;
}): React.ReactPortal {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<TransformGesture | null>(null);
  const gestureScaleRef = useRef(1);
  const [isRotating, setIsRotating] = useState(false);
  // Scale ratio between rendered screen pixels and canvas units, measured
  // directly off the overlay root's client rect. This is authoritative — it
  // reflects the cumulative effect of canvasRoot's scale, hostRef's zoom, and
  // any DPI scaling, without having to agree with separately-computed state.
  // Initialize synchronously on first render (overlayRoot is a prop and
  // already exists in the DOM) so handle sizes render correctly on the very
  // first paint — no stale-scale flash.
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
  }, [overlayRoot, zoom]);

  // Inverse ratio used to keep chrome (handles, rotation arm) a constant size
  // on screen even though the widget lives in canvas-unit space.
  const screenPxPerCanvasUnit = 1 / pointerToCanvas;
  const handleSizePx = TRANSFORM_HANDLE_SIZE * screenPxPerCanvasUnit;
  const rotationOffsetPx = ROTATION_HANDLE_OFFSET * screenPxPerCanvasUnit;
  const handlePositions = buildHandlePositions(screenPxPerCanvasUnit);

  const captureGestureScale = useCallback((): void => {
    const ratio = measureOverlayRatio(overlayRoot);

    gestureScaleRef.current = ratio;
    setPointerToCanvas((previous) => (ratio === previous ? previous : ratio));
  }, [overlayRoot]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      captureGestureScale();
      gestureRef.current = {
        initialPosition: { ...element.position },
        kind: 'drag',
        lastUpdate: null,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [captureGestureScale, element.position],
  );

  const beginResize = useCallback(
    (handle: ResizeHandle) =>
      (event: React.PointerEvent<HTMLDivElement>): void => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        captureGestureScale();
        gestureRef.current = {
          handle,
          initialRect: {
            height: element.height,
            width: element.width,
            x: element.position.x,
            y: element.position.y,
          },
          kind: 'resize',
          lastUpdate: null,
          startX: event.clientX,
          startY: event.clientY,
        };
      },
    [captureGestureScale, element.height, element.position.x, element.position.y, element.width],
  );

  const beginRotation = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return;
      }

      const bounds = widgetRef.current?.getBoundingClientRect();
      const centerX = bounds === undefined ? event.clientX : bounds.left + bounds.width / 2;
      const centerY = bounds === undefined ? event.clientY : bounds.top + bounds.height / 2;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      captureGestureScale();
      setIsRotating(true);
      gestureRef.current = {
        initialRotation: element.rotation,
        kind: 'rotate',
        lastUpdate: null,
        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      };
    },
    [captureGestureScale, element.rotation],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;

      if (gesture === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const activeScale = gestureScaleRef.current;

      if (gesture.kind === 'drag') {
        const update = {
          position: applyDragTranslation(
            gesture.initialPosition,
            { dx: event.clientX - gesture.startX, dy: event.clientY - gesture.startY },
            activeScale,
          ),
        } satisfies ElementUpdate;

        gesture.lastUpdate = update;
        onPreviewUpdate(element.id, update);

        return;
      }

      if (gesture.kind === 'resize') {
        const nextRect = applyResize(
          gesture.initialRect,
          gesture.handle,
          event.clientX - gesture.startX,
          event.clientY - gesture.startY,
          activeScale,
          element.rotation,
          MIN_TRANSFORM_SIZE,
        );
        const update = {
          height: nextRect.height,
          position: { x: nextRect.x, y: nextRect.y },
          width: nextRect.width,
        } satisfies ElementUpdate;

        gesture.lastUpdate = update;
        onPreviewUpdate(element.id, update);

        return;
      }

      const bounds = widgetRef.current?.getBoundingClientRect();
      const centerX = bounds === undefined ? event.clientX : bounds.left + bounds.width / 2;
      const centerY = bounds === undefined ? event.clientY : bounds.top + bounds.height / 2;
      const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
      const update = {
        rotation: applyRotation(gesture.initialRotation, ((currentAngle - gesture.startAngle) * 180) / Math.PI),
      } satisfies ElementUpdate;

      gesture.lastUpdate = update;
      onPreviewUpdate(element.id, update);
    },
    [element.id, element.rotation, onPreviewUpdate],
  );

  const finishGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;

      if (gesture === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setIsRotating(false);
      gestureRef.current = null;

      if (gesture.lastUpdate !== null) {
        onCommitUpdate(element.id, gesture.lastUpdate);
      }
    },
    [element.id, onCommitUpdate],
  );

  const elementTransform = buildElementTransform(element, element.style);

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- transform widget is a canvas overlay; onClick only exists to swallow click propagation so the canvas click handler doesn't fire. Keyboard interaction happens on the parent canvas (role="application").
    <div
      ref={widgetRef}
      data-testid="demo-transform-widget"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.(element.id);
      }}
      onPointerCancel={finishGesture}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      style={{
        height: `${String(Math.max(element.height, 1))}px`,
        left: `${String(element.position.x)}px`,
        pointerEvents: 'auto',
        position: 'absolute',
        top: `${String(element.position.y)}px`,
        transform: elementTransform,
        transformOrigin: 'center center',
        width: `${String(Math.max(element.width, 1))}px`,
      }}
    >
      <div
        data-testid="transform-bounds"
        onPointerDown={beginDrag}
        style={{
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.95)',
          borderRadius: '0.4rem',
          boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.35)',
          cursor: 'move',
          inset: 0,
          position: 'absolute',
        }}
      />
      {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
        <div
          key={handle}
          data-testid={`transform-handle-${handle}`}
          onPointerDown={beginResize(handle)}
          style={{
            ...handlePositions[handle],
            background: '#ffffff',
            border: '1px solid rgba(37, 99, 235, 0.95)',
            borderRadius: '9999px',
            cursor: TRANSFORM_HANDLE_CURSORS[handle],
            height: `${String(handleSizePx)}px`,
            position: 'absolute',
            width: `${String(handleSizePx)}px`,
          }}
        />
      ))}
      <div
        aria-hidden="true"
        style={{
          background: 'rgba(59, 130, 246, 0.8)',
          height: `${String((ROTATION_HANDLE_OFFSET - 6) * screenPxPerCanvasUnit)}px`,
          left: '50%',
          pointerEvents: 'none',
          position: 'absolute',
          top: `${String((-ROTATION_HANDLE_OFFSET + 8) * screenPxPerCanvasUnit)}px`,
          transform: 'translateX(-50%)',
          width: `${String(screenPxPerCanvasUnit)}px`,
        }}
      />
      <div
        data-testid="transform-rotation-handle"
        onPointerDown={beginRotation}
        style={{
          background: 'rgba(37, 99, 235, 0.98)',
          border: '2px solid rgba(255, 255, 255, 0.96)',
          borderRadius: '9999px',
          boxShadow: '0 4px 10px rgba(15, 23, 42, 0.24)',
          cursor: isRotating ? 'grabbing' : 'grab',
          height: `${String((TRANSFORM_HANDLE_SIZE + 2) * screenPxPerCanvasUnit)}px`,
          left: '50%',
          position: 'absolute',
          top: `${String(-rotationOffsetPx)}px`,
          transform: 'translate(-50%, -50%)',
          width: `${String((TRANSFORM_HANDLE_SIZE + 2) * screenPxPerCanvasUnit)}px`,
        }}
      />
    </div>,
    overlayRoot,
  );
}
