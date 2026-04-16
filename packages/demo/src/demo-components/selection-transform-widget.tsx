import {
  applyDragTranslation,
  applyResize,
  applyRotation,
  type ElementUpdate,
  type ResizeHandle,
} from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import { useCallback, useRef, useState } from 'react';

import {
  MIN_TRANSFORM_SIZE,
  ROTATION_HANDLE_OFFSET,
  TRANSFORM_HANDLE_CURSORS,
  TRANSFORM_HANDLE_POSITIONS,
  TRANSFORM_HANDLE_SIZE,
  type TransformGesture,
} from '../demo-types';

export function SelectionTransformWidget({
  contentScale,
  element,
  zoom,
  onPreviewUpdate,
  onCommitUpdate,
}: {
  readonly contentScale: number;
  readonly element: BroadsetElement;
  readonly zoom: number;
  readonly onPreviewUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onCommitUpdate: (elementId: string, updates: ElementUpdate) => void;
}): React.JSX.Element {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<TransformGesture | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const effectiveZoom = zoom * contentScale;

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        initialPosition: { ...element.position },
        kind: 'drag',
        lastUpdate: null,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [element.position],
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
    [element.height, element.position.x, element.position.y, element.width],
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
      setIsRotating(true);
      gestureRef.current = {
        initialRotation: element.rotation,
        kind: 'rotate',
        lastUpdate: null,
        startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      };
    },
    [element.height, element.position.x, element.position.y, element.rotation, element.width, effectiveZoom],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;

      if (gesture === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (gesture.kind === 'drag') {
        const update = {
          position: applyDragTranslation(
            gesture.initialPosition,
            { dx: event.clientX - gesture.startX, dy: event.clientY - gesture.startY },
            effectiveZoom,
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
          effectiveZoom,
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
    [element.height, element.id, element.position, element.rotation, element.width, onPreviewUpdate, effectiveZoom],
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

  return (
    <div
      ref={widgetRef}
      data-testid="demo-transform-widget"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerCancel={finishGesture}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      style={{
        height: `${String(Math.max(element.height * effectiveZoom, 1))}px`,
        left: `${String(element.position.x * effectiveZoom)}px`,
        pointerEvents: 'auto',
        position: 'absolute',
        top: `${String(element.position.y * effectiveZoom)}px`,
        transform: `rotate(${String(element.rotation)}deg)`,
        transformOrigin: 'center center',
        width: `${String(Math.max(element.width * effectiveZoom, 1))}px`,
        zIndex: 2,
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
            ...TRANSFORM_HANDLE_POSITIONS[handle],
            background: '#ffffff',
            border: '1px solid rgba(37, 99, 235, 0.95)',
            borderRadius: '9999px',
            cursor: TRANSFORM_HANDLE_CURSORS[handle],
            height: `${String(TRANSFORM_HANDLE_SIZE)}px`,
            position: 'absolute',
            width: `${String(TRANSFORM_HANDLE_SIZE)}px`,
          }}
        />
      ))}
      <div
        aria-hidden="true"
        style={{
          background: 'rgba(59, 130, 246, 0.8)',
          height: `${String(ROTATION_HANDLE_OFFSET - 6)}px`,
          left: '50%',
          pointerEvents: 'none',
          position: 'absolute',
          top: `${String(-ROTATION_HANDLE_OFFSET + 8)}px`,
          transform: 'translateX(-50%)',
          width: '1px',
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
          height: `${String(TRANSFORM_HANDLE_SIZE + 2)}px`,
          left: '50%',
          position: 'absolute',
          top: `${String(-ROTATION_HANDLE_OFFSET)}px`,
          transform: 'translate(-50%, -50%)',
          width: `${String(TRANSFORM_HANDLE_SIZE + 2)}px`,
        }}
      />
    </div>
  );
}
