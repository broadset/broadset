import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { type PointerEvent as ReactPointerEvent, useRef, type WheelEvent as ReactWheelEvent } from 'react';

import { V1PagePreview } from '../demo-components/v1-page-preview';
import { V1SelectionTransformWidget } from '../demo-components/v1-selection-transform-widget';
import { useCanvasViewport, useEditorSelector } from './helpers';
import { V1Rulers } from './v1-rulers';

const EMPTY_BLOBS: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map();

interface V1DemoCanvasSurfaceProps {
  readonly editorStore: ProjectEditorStore;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}

interface CanvasPanGestureV1 {
  readonly origin: { readonly x: number; readonly y: number };
  readonly pointerId: number;
  readonly startPointer: { readonly x: number; readonly y: number };
}

function readElementId(target: EventTarget | null): projectFormatV1.Id | undefined {
  if (!(target instanceof Element)) return undefined;

  const value = target.closest<HTMLElement>('[data-element-id]')?.dataset['elementId'];

  if (value === undefined) return undefined;

  const result = projectFormatV1.idSchema.safeParse(value);

  return result.success ? result.data : undefined;
}

export function V1DemoCanvasSurface({
  editorStore,
  project,
  blobs = EMPTY_BLOBS,
  documentId,
  pageId,
}: V1DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);
  const placementActive = useEditorSelector(editorStore, (state) => state.placement !== null);
  const document = project.documents.find((candidate) => candidate.id === documentId);
  const panGestureRef = useRef<CanvasPanGestureV1 | null>(null);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button === 1) {
      const current = editorStore.getState().canvasSettings;

      event.preventDefault();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional in embedded DOM hosts; surface-local panning still works.
      }

      panGestureRef.current = {
        origin: { x: current.panX, y: current.panY },
        pointerId: event.pointerId,
        startPointer: { x: event.clientX, y: event.clientY },
      };

      return;
    }

    const elementId = readElementId(event.target);

    const state = editorStore.getState();

    if (elementId === undefined) {
      state.selectElement(null);

      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) state.toggleSelectElement(elementId);
    else state.selectElement(elementId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = panGestureRef.current;

    if (gesture?.pointerId !== event.pointerId) return;

    event.preventDefault();
    editorStore.getState().updateCanvasSettings({
      panX: gesture.origin.x + event.clientX - gesture.startPointer.x,
      panY: gesture.origin.y + event.clientY - gesture.startPointer.y,
    });
  };
  const finishPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (panGestureRef.current?.pointerId !== event.pointerId) return;

    event.preventDefault();
    panGestureRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The host may have released capture already or may not implement it.
    }
  };
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    const state = editorStore.getState();
    const current = state.canvasSettings;
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    const candidate = event.deltaMode === 0 ? current.zoom - event.deltaY * 0.002 : current.zoom + step;
    const zoom = Math.max(0.1, Math.min(4, Math.round(candidate * 100) / 100));

    if (zoom === current.zoom) return;

    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const worldX = (pointerX - current.panX) / current.zoom;
    const worldY = (pointerY - current.panY) / current.zoom;

    state.updateCanvasSettings({
      panX: pointerX - worldX * zoom,
      panY: pointerY - worldY * zoom,
      zoom,
    });
  };

  return (
    <div
      aria-label="Screen preview for active page"
      data-testid="v1-canvas-surface"
      onPointerCancel={finishPan}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPan}
      onWheel={handleWheel}
      style={{
        inset: 0,
        cursor: placementActive ? 'crosshair' : 'default',
        overflow: 'hidden',
        perspective: viewport.perspective,
        position: 'absolute',
        touchAction: 'none',
      }}
    >
      <div
        data-testid="v1-canvas-viewport"
        style={{
          transform: `translate(${String(viewport.panX)}px, ${String(viewport.panY)}px) scale(${String(viewport.zoom)})`,
          transformOrigin: '0 0',
        }}
      >
        <V1PagePreview blobs={blobs} documentId={documentId} pageId={pageId} project={project} />
        <V1SelectionTransformWidget editorStore={editorStore} zoom={viewport.zoom} />
      </div>
      {document === undefined ? null : <V1Rulers editorStore={editorStore} surfaceSize={document.surface.size} />}
    </div>
  );
}
