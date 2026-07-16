import { getEditorElementRectV1, type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import { useRef, useState } from 'react';

import { useEditorSelector } from '../demo-app/helpers';
import {
  cssPixelsToDocumentValueV1,
  documentValueToCssPixelsV1,
  surfaceUnitContextV1,
} from '../demo-app/v1-canvas-units';

interface V1MultiSelectionTransformWidgetProps {
  readonly editorStore: ProjectEditorStore;
  readonly zoom: number;
}

interface SelectionBoundsV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface MultiSelectionDragGestureV1 {
  readonly initialPositions: readonly {
    readonly elementId: projectFormatV1.Id;
    readonly position: { readonly x: number; readonly y: number };
  }[];
  readonly latestDelta: { readonly x: number; readonly y: number };
  readonly pointerId: number;
  readonly startPointer: { readonly x: number; readonly y: number };
}

function getSelectionBounds(elements: readonly projectFormatV1.Element[]): SelectionBoundsV1 | null {
  const first = elements[0];

  if (first === undefined) return null;

  const firstRect = getEditorElementRectV1(first);
  let minX = firstRect.x;
  let minY = firstRect.y;
  let maxX = firstRect.x + firstRect.width;
  let maxY = firstRect.y + firstRect.height;

  for (const element of elements.slice(1)) {
    const rect = getEditorElementRectV1(element);

    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function V1MultiSelectionTransformWidget({
  editorStore,
  zoom,
}: V1MultiSelectionTransformWidgetProps): React.JSX.Element | null {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const units = surfaceUnitContextV1(document);
  const selectedIds = new Set(state.activeInstanceAddresses.map(({ elementId }) => elementId));
  const elements = document?.elements.filter((element) => selectedIds.has(element.id)) ?? [];
  const bounds = getSelectionBounds(elements);
  const gestureRef = useRef<MultiSelectionDragGestureV1 | null>(null);
  const [previewDelta, setPreviewDelta] = useState({ x: 0, y: 0 });

  if (bounds === null || elements.length < 2) return null;

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setPreviewDelta({ x: 0, y: 0 });
    gestureRef.current = {
      initialPositions: elements.map((element) => {
        const rect = getEditorElementRectV1(element);

        return { elementId: element.id, position: { x: rect.x, y: rect.y } };
      }),
      latestDelta: { x: 0, y: 0 },
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
    };
  };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const gesture = gestureRef.current;

    if (gesture?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const latestDelta = {
      x: cssPixelsToDocumentValueV1((event.clientX - gesture.startPointer.x) / scale, units),
      y: cssPixelsToDocumentValueV1((event.clientY - gesture.startPointer.y) / scale, units),
    };

    gestureRef.current = { ...gesture, latestDelta };
    setPreviewDelta(latestDelta);
  };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const gesture = gestureRef.current;

    if (gesture?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    setPreviewDelta({ x: 0, y: 0 });
    editorStore.getState().commitGroupMove(
      gesture.initialPositions.map((entry) => ({
        elementId: entry.elementId,
        position: {
          x: entry.position.x + gesture.latestDelta.x,
          y: entry.position.y + gesture.latestDelta.y,
        },
      })),
    );
  };
  const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    setPreviewDelta({ x: 0, y: 0 });
  };

  return (
    <div
      data-testid="demo-transform-widget"
      style={{
        border: '1px solid rgba(59, 130, 246, 0.95)',
        boxSizing: 'border-box',
        height: documentValueToCssPixelsV1(bounds.height, units),
        left: 0,
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        transform: `matrix(1, 0, 0, 1, ${String(documentValueToCssPixelsV1(bounds.x + previewDelta.x, units))}, ${String(documentValueToCssPixelsV1(bounds.y + previewDelta.y, units))})`,
        transformOrigin: '0 0 0',
        width: documentValueToCssPixelsV1(bounds.width, units),
        zIndex: 1,
      }}
    >
      <button
        data-testid="transform-bounds"
        type="button"
        onPointerCancel={cancelDrag}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
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
    </div>
  );
}
