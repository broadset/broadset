import {
  type EditorElementRectV1,
  getEditorElementRectV1,
  type ProjectEditorStore,
  resizeElementRectV1,
  type ResizeHandle,
  selectActiveDocumentV1,
  selectElementByIdV1,
  updateElementRectV1,
} from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import { geometryToBoxStyle } from '@broadset/renderer';
import { useRef, useState } from 'react';

import { useEditorSelector } from '../demo-app/helpers';
import {
  createV1GesturePlaneProjection,
  projectV1GestureDelta,
  projectV1GesturePoint,
  type V1GesturePlaneProjection,
} from './v1-gesture-projection';
import { V1MultiSelectionTransformWidget } from './v1-multi-selection-transform-widget';

interface V1SelectionTransformWidgetProps {
  readonly editorStore: ProjectEditorStore;
  readonly zoom: number;
}

interface DragGesture {
  readonly kind: 'drag';
  readonly elementId: projectFormatV1.Id;
  readonly initialPosition: { readonly x: number; readonly y: number };
  readonly latestPosition: { readonly x: number; readonly y: number };
  readonly pointerId: number;
  readonly startPointer: { readonly x: number; readonly y: number };
}

interface ResizeGesture {
  readonly kind: 'resize';
  readonly elementId: projectFormatV1.Id;
  readonly handle: ResizeHandle;
  readonly initialRect: EditorElementRectV1;
  readonly latestRect: EditorElementRectV1;
  readonly pointerId: number;
  readonly startPointer: { readonly x: number; readonly y: number };
}

interface RotateGesture {
  readonly kind: 'rotate';
  readonly elementId: projectFormatV1.Id;
  readonly initialRect: EditorElementRectV1;
  readonly latestRotation: number;
  readonly pointerId: number;
  readonly rotationCenter: { readonly x: number; readonly y: number };
  readonly startAngle: number;
}

type TransformGestureV1 = DragGesture | ResizeGesture | RotateGesture;

interface TransformPreviewV1 {
  readonly elementId: projectFormatV1.Id;
  readonly rect: EditorElementRectV1;
}

const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function resizeHandleStyle(handle: ResizeHandle, zoom: number): React.CSSProperties {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const radius = 5 / scale;
  const base: React.CSSProperties = {
    background: '#ffffff',
    border: `${String(1 / scale)}px solid rgba(37, 99, 235, 0.95)`,
    borderRadius: '9999px',
    height: 10 / scale,
    padding: 0,
    pointerEvents: 'auto',
    position: 'absolute',
    width: 10 / scale,
  };

  switch (handle) {
    case 'n':
      return { ...base, cursor: 'ns-resize', left: '50%', top: -radius, transform: 'translateX(-50%)' };
    case 'ne':
      return { ...base, cursor: 'nesw-resize', right: -radius, top: -radius };
    case 'e':
      return { ...base, cursor: 'ew-resize', right: -radius, top: '50%', transform: 'translateY(-50%)' };
    case 'se':
      return { ...base, bottom: -radius, cursor: 'nwse-resize', right: -radius };
    case 's':
      return { ...base, bottom: -radius, cursor: 'ns-resize', left: '50%', transform: 'translateX(-50%)' };
    case 'sw':
      return { ...base, bottom: -radius, cursor: 'nesw-resize', left: -radius };
    case 'w':
      return { ...base, cursor: 'ew-resize', left: -radius, top: '50%', transform: 'translateY(-50%)' };
    case 'nw':
      return { ...base, cursor: 'nwse-resize', left: -radius, top: -radius };
  }
}

export function V1SelectionTransformWidget({
  editorStore,
  zoom,
}: V1SelectionTransformWidgetProps): React.JSX.Element | null {
  const state = useEditorSelector(editorStore, (current) => current);
  const elementId = state.activeElementIds.length === 1 ? state.activeElementIds[0] : undefined;
  const element = elementId === undefined ? undefined : selectElementByIdV1(state, elementId);
  const gestureRef = useRef<TransformGestureV1 | null>(null);
  const projectionRef = useRef<V1GesturePlaneProjection | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<TransformPreviewV1 | null>(null);

  if (state.activeElementIds.length > 1) {
    return <V1MultiSelectionTransformWidget editorStore={editorStore} zoom={zoom} />;
  }

  if (element === undefined) return null;

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;

    const rect = getEditorElementRectV1(element);

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setPreview(null);
    projectionRef.current =
      widgetRef.current === null ?
        null
      : createV1GesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
    gestureRef.current = {
      kind: 'drag',
      elementId: element.id,
      initialPosition: { x: rect.x, y: rect.y },
      latestPosition: { x: rect.x, y: rect.y },
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
    };
  };
  const beginResize = (handle: ResizeHandle): ((event: React.PointerEvent<HTMLButtonElement>) => void) => {
    return (event): void => {
      if (event.button !== 0) return;

      const rect = getEditorElementRectV1(element);

      event.preventDefault();
      event.stopPropagation();

      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      setPreview(null);
      projectionRef.current =
        widgetRef.current === null ?
          null
        : createV1GesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
      gestureRef.current = {
        kind: 'resize',
        elementId: element.id,
        handle,
        initialRect: rect,
        latestRect: rect,
        pointerId: event.pointerId,
        startPointer: { x: event.clientX, y: event.clientY },
      };
    };
  };
  const beginRotate = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;

    const rect = getEditorElementRectV1(element);
    const widgetBounds = event.currentTarget.parentElement?.getBoundingClientRect();
    const hasMeasuredBounds = widgetBounds !== undefined && widgetBounds.width > 0 && widgetBounds.height > 0;
    const projection =
      widgetRef.current === null ?
        null
      : createV1GesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
    const projectedPoint = projectV1GesturePoint(projection, { x: event.clientX, y: event.clientY });
    const rotationCenter =
      hasMeasuredBounds ?
        { x: widgetBounds.left + widgetBounds.width / 2, y: widgetBounds.top + widgetBounds.height / 2 }
      : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const localCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setPreview(null);
    projectionRef.current = projection;
    gestureRef.current = {
      kind: 'rotate',
      elementId: element.id,
      initialRect: rect,
      latestRotation: rect.rotation,
      pointerId: event.pointerId,
      rotationCenter,
      startAngle:
        projectedPoint === null ?
          Math.atan2(event.clientY - rotationCenter.y, event.clientX - rotationCenter.x)
        : Math.atan2(projectedPoint.y - localCenter.y, projectedPoint.x - localCenter.x),
    };
  };
  const moveGesture = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const gesture = gestureRef.current;

    if (gesture?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const projectedPoint = projectV1GesturePoint(projectionRef.current, { x: event.clientX, y: event.clientY });
    const projectedDelta = projectV1GestureDelta(projectionRef.current, { x: event.clientX, y: event.clientY });

    if (gesture.kind === 'rotate') {
      const localCenter = {
        x: gesture.initialRect.x + gesture.initialRect.width / 2,
        y: gesture.initialRect.y + gesture.initialRect.height / 2,
      };
      const currentAngle =
        projectedPoint === null ?
          Math.atan2(event.clientY - gesture.rotationCenter.y, event.clientX - gesture.rotationCenter.x)
        : Math.atan2(projectedPoint.y - localCenter.y, projectedPoint.x - localCenter.x);
      const latestRotation = gesture.initialRect.rotation + ((currentAngle - gesture.startAngle) * 180) / Math.PI;
      const rect = { ...gesture.initialRect, rotation: latestRotation };

      gestureRef.current = { ...gesture, latestRotation };
      setPreview({ elementId: gesture.elementId, rect });

      return;
    }

    if (gesture.kind === 'resize') {
      const latestRect: EditorElementRectV1 = resizeElementRectV1({
        rect: gesture.initialRect,
        handle: gesture.handle,
        dx: projectedDelta?.x ?? event.clientX - gesture.startPointer.x,
        dy: projectedDelta?.y ?? event.clientY - gesture.startPointer.y,
        zoom: projectedDelta === null ? scale : 1,
        minSize: 1,
      });

      gestureRef.current = { ...gesture, latestRect };
      setPreview({ elementId: gesture.elementId, rect: latestRect });

      return;
    }

    const latestPosition = {
      x: gesture.initialPosition.x + (projectedDelta?.x ?? (event.clientX - gesture.startPointer.x) / scale),
      y: gesture.initialPosition.y + (projectedDelta?.y ?? (event.clientY - gesture.startPointer.y) / scale),
    };

    gestureRef.current = { ...gesture, latestPosition };
    setPreview({
      elementId: gesture.elementId,
      rect: { ...getEditorElementRectV1(element), ...latestPosition },
    });
  };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const gesture = gestureRef.current;

    if (gesture?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    projectionRef.current = null;
    setPreview(null);

    if (gesture.kind === 'rotate') {
      editorStore.getState().commitElementUpdate(gesture.elementId, { rotation: gesture.latestRotation });

      return;
    }

    if (gesture.kind === 'resize') {
      editorStore.getState().commitElementUpdate(gesture.elementId, {
        position: { x: gesture.latestRect.x, y: gesture.latestRect.y },
        width: gesture.latestRect.width,
        height: gesture.latestRect.height,
      });

      return;
    }

    editorStore.getState().commitElementUpdate(gesture.elementId, { position: gesture.latestPosition });
  };
  const cancelGesture = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    projectionRef.current = null;
    setPreview(null);
  };

  const displayedElement = preview?.elementId === element.id ? updateElementRectV1(element, preview.rect) : element;
  let widget: React.JSX.Element = (
    <div
      ref={widgetRef}
      data-broadset-transform-overlay="true"
      data-testid="demo-transform-widget"
      style={{
        ...geometryToBoxStyle(displayedElement.geometry),
        border: '1px solid rgba(59, 130, 246, 0.95)',
        boxSizing: 'border-box',
        left: 0,
        pointerEvents: 'auto',
        position: 'absolute',
        top: 0,
        zIndex: 1,
      }}
    >
      <button
        data-testid="transform-bounds"
        type="button"
        onPointerCancel={cancelGesture}
        onPointerDown={beginDrag}
        onPointerMove={moveGesture}
        onPointerUp={finishDrag}
        style={{
          background: 'rgba(59, 130, 246, 0.06)',
          border: 0,
          cursor: 'move',
          inset: 0,
          padding: 0,
          pointerEvents: 'auto',
          position: 'absolute',
        }}
      />
      {RESIZE_HANDLES.map((handle) => (
        <button
          key={handle}
          aria-label={`Resize ${handle}`}
          data-testid={`transform-handle-${handle}`}
          type="button"
          onPointerCancel={cancelGesture}
          onPointerDown={beginResize(handle)}
          onPointerMove={moveGesture}
          onPointerUp={finishDrag}
          style={resizeHandleStyle(handle, zoom)}
        />
      ))}
      <button
        aria-label="Rotate"
        data-testid="transform-rotation-handle"
        type="button"
        onPointerCancel={cancelGesture}
        onPointerDown={beginRotate}
        onPointerMove={moveGesture}
        onPointerUp={finishDrag}
        style={{
          background: '#ffffff',
          border: `${String(1 / zoom)}px solid rgba(37, 99, 235, 0.95)`,
          borderRadius: '9999px',
          cursor: 'grab',
          height: 10 / zoom,
          left: '50%',
          padding: 0,
          pointerEvents: 'auto',
          position: 'absolute',
          top: -30 / zoom,
          transform: 'translateX(-50%)',
          width: 10 / zoom,
        }}
      />
    </div>
  );

  const document = selectActiveDocumentV1(state);
  const ancestors: projectFormatV1.Element[] = [];
  let parentId = element.parentId;

  while (parentId !== null && ancestors.length < (document?.elements.length ?? 0)) {
    const parent = document?.elements.find((candidate) => candidate.id === parentId);

    if (parent === undefined) break;

    ancestors.push(parent);
    parentId = parent.parentId;
  }

  for (const ancestor of ancestors) {
    widget = (
      <div
        key={ancestor.id}
        data-testid={`v1-transform-ancestor-${ancestor.id}`}
        style={{
          ...geometryToBoxStyle(ancestor.geometry),
          left: 0,
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          transformStyle: 'preserve-3d',
          zIndex: 1,
        }}
      >
        {widget}
      </div>
    );
  }

  return widget;
}
