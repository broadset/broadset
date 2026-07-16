import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import { V1ClipPathEditingOverlay } from '../demo-components/v1-clip-path-editing-overlay';
import { V1PagePreview } from '../demo-components/v1-page-preview';
import { V1PathEditingOverlay } from '../demo-components/v1-path-editing-overlay';
import { V1SelectionTransformWidget } from '../demo-components/v1-selection-transform-widget';
import { useCanvasViewport, useEditorSelector } from './helpers';
import { V1CanvasContextMenu } from './v1-canvas-context-menu';
import {
  handlePathDrawingPoint,
  handlePlacementPoint,
  lastPathPoint,
  type PlacementAnchorV1,
} from './v1-placement-authoring';
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

interface CanvasContextMenuV1 {
  readonly elementId: projectFormatV1.Id | null;
  readonly x: number;
  readonly y: number;
}

function readElementId(target: EventTarget | null): projectFormatV1.Id | undefined {
  if (!(target instanceof Element)) return undefined;

  const value = target.closest<HTMLElement>('[data-element-id]')?.dataset['elementId'];

  if (value === undefined) return undefined;

  const result = projectFormatV1.idSchema.safeParse(value);

  return result.success ? result.data : undefined;
}

function isTransformOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-broadset-transform-overlay="true"]') !== null;
}

function redispatchRetargetedOverlayPointer(event: ReactPointerEvent<HTMLDivElement>): boolean {
  if (isTransformOverlayTarget(event.target)) return false;

  const ownerDocument = event.currentTarget.ownerDocument;
  const elementsFromPoint: unknown = Reflect.get(ownerDocument, 'elementsFromPoint');

  if (typeof elementsFromPoint !== 'function') return false;

  const hitStack: unknown = Reflect.apply(elementsFromPoint, ownerDocument, [event.clientX, event.clientY]);

  if (!Array.isArray(hitStack)) return false;

  const overlayTarget: unknown = hitStack.find(
    (candidate: unknown) => candidate instanceof Element && isTransformOverlayTarget(candidate),
  );

  if (!(overlayTarget instanceof Element)) return false;

  // Chromium can retarget preserve-3d pointer hits to the flat canvas plane even when the overlay is visually first.
  overlayTarget.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      button: event.button,
      buttons: event.buttons,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      composed: true,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      shiftKey: event.shiftKey,
    }),
  );

  return true;
}

function V1SafetyBoundaries({
  document,
  viewMode,
}: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly viewMode: 'broadcast' | 'none' | 'print';
}): React.JSX.Element | null {
  if (viewMode === 'none') return null;

  const [width, height] = document.surface.size;
  const padding = document.surface.padding;
  const fill = viewMode === 'broadcast' ? 'rgba(220, 38, 38, 0.2)' : 'rgba(37, 99, 235, 0.2)';

  return (
    <svg
      aria-hidden="true"
      data-testid="safety-boundaries-overlay"
      height={height}
      width={width}
      style={{ inset: 0, pointerEvents: 'none', position: 'absolute', zIndex: 2 }}
    >
      <rect data-testid="safety-boundary-top" fill={fill} height={padding.top} width={width} x={0} y={0} />
      <rect
        data-testid="safety-boundary-right"
        fill={fill}
        height={height}
        width={padding.right}
        x={width - padding.right}
        y={0}
      />
      <rect
        data-testid="safety-boundary-bottom"
        fill={fill}
        height={padding.bottom}
        width={width}
        x={0}
        y={height - padding.bottom}
      />
      <rect data-testid="safety-boundary-left" fill={fill} height={height} width={padding.left} x={0} y={0} />
    </svg>
  );
}

function canvasPointFromEvent(
  event: ReactPointerEvent<HTMLDivElement>,
  viewport: { readonly panX: number; readonly panY: number; readonly zoom: number },
): PlacementAnchorV1 {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: (event.clientX - bounds.left - viewport.panX) / viewport.zoom,
    y: (event.clientY - bounds.top - viewport.panY) / viewport.zoom,
  };
}

export function V1DemoCanvasSurface({
  editorStore,
  project,
  blobs = EMPTY_BLOBS,
  documentId,
  pageId,
}: V1DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);
  const placement = useEditorSelector(editorStore, (state) => state.placement);
  const placementPreview = useEditorSelector(editorStore, (state) => state.placementPreview);
  const pathDrawingElementId = useEditorSelector(editorStore, (state) => state.pathDrawingElementId);
  const pathEditingElementId = useEditorSelector(editorStore, (state) => state.pathEditingElementId);
  const clipPathEditingElementId = useEditorSelector(editorStore, (state) => state.clipPathEditingElementId);
  const viewMode = useEditorSelector(editorStore, (state) => state.canvasSettings.viewMode);
  const placementActive = placement !== null;
  const document = project.documents.find((candidate) => candidate.id === documentId);
  const panGestureRef = useRef<CanvasPanGestureV1 | null>(null);
  const clipboardRef = useRef<readonly projectFormatV1.Element[]>([]);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuV1 | null>(null);
  const [hasClipboardContents, setHasClipboardContents] = useState(false);
  const [pathPreview, setPathPreview] = useState<PlacementAnchorV1 | null>(null);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
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

    if (event.button === 2) return;

    const placement = editorStore.getState().placement;

    if (placement !== null) {
      handlePlacementPoint({
        editorStore,
        placement,
        point: canvasPointFromEvent(event, viewport),
        setPathPreview,
      });

      event.preventDefault();

      return;
    }

    const drawingElementId = editorStore.getState().pathDrawingElementId;

    if (drawingElementId !== null) {
      handlePathDrawingPoint({
        editorStore,
        elementId: drawingElementId,
        point: canvasPointFromEvent(event, viewport),
        setPathPreview,
        zoom: viewport.zoom,
      });

      event.preventDefault();

      return;
    }

    if (redispatchRetargetedOverlayPointer(event)) {
      event.preventDefault();

      return;
    }

    if (isTransformOverlayTarget(event.target)) return;

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
    const currentPlacement = editorStore.getState().placement;

    if (gesture === null && currentPlacement !== null) {
      const bounds = event.currentTarget.getBoundingClientRect();

      editorStore.getState().updatePlacement(currentPlacement, {
        x: (event.clientX - bounds.left - viewport.panX) / viewport.zoom,
        y: (event.clientY - bounds.top - viewport.panY) / viewport.zoom,
      });

      return;
    }

    if (gesture === null && editorStore.getState().pathDrawingElementId !== null) {
      const bounds = event.currentTarget.getBoundingClientRect();

      setPathPreview({
        x: (event.clientX - bounds.left - viewport.panX) / viewport.zoom,
        y: (event.clientY - bounds.top - viewport.panY) / viewport.zoom,
      });

      return;
    }

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
  const closeContextMenu = (): void => {
    setContextMenu(null);
  };
  const copySelection = (): void => {
    const state = editorStore.getState();
    const activeDocument = state.project.documents.find((candidate) => candidate.id === state.activeDocumentId);
    const selectedIds = new Set(state.activeElementIds);

    clipboardRef.current = activeDocument?.elements.filter((element) => selectedIds.has(element.id)) ?? [];
    setHasClipboardContents(clipboardRef.current.length > 0);
    closeContextMenu();
  };
  const cutSelection = (): void => {
    const selectedIds = [...editorStore.getState().activeElementIds];

    copySelection();
    editorStore.getState().removeElements(selectedIds);
  };
  const pasteSelection = (): void => {
    const nextIds: projectFormatV1.Id[] = [];

    clipboardRef.current.forEach((element) => {
      const clone: projectFormatV1.Element = {
        ...element,
        id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
        name: `${element.name} copy`,
        parentId: null,
      };
      const nextId = editorStore.getState().addElement(clone);

      if (nextId !== null) nextIds.push(nextId);
    });
    editorStore.getState().setActiveElements(nextIds);
    closeContextMenu();
  };
  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();

    const state = editorStore.getState();
    const hitElementId = readElementId(event.target);
    const elementId = hitElementId ?? state.activeElementIds[0] ?? null;

    if (elementId !== null && !(state.activeElementIds.length > 1 && state.activeElementIds.includes(elementId))) {
      state.selectElement(elementId);
    }

    setContextMenu({ elementId, x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    if (contextMenu === null) return undefined;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (pathDrawingElementId === null) setPathPreview(null);
  }, [pathDrawingElementId]);

  const drawingElement = document?.elements.find((candidate) => candidate.id === pathDrawingElementId);
  const drawingLastPoint = lastPathPoint(drawingElement);
  const pathEditingElement = document?.elements.find((candidate) => candidate.id === pathEditingElementId);
  const clipTarget = document?.elements.find((candidate) => candidate.id === clipPathEditingElementId);
  const clipElement =
    clipTarget?.appearance.clip?.kind === 'vector' ?
      document?.elements.find((candidate) => candidate.id === clipTarget.appearance.clip?.vectorElementId)
    : undefined;

  return (
    <div
      aria-label="Screen preview for active page"
      data-testid="v1-canvas-surface"
      onContextMenu={handleContextMenu}
      onPointerCancel={finishPan}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPan}
      onWheel={handleWheel}
      style={{
        inset: 0,
        cursor: placementActive || pathDrawingElementId !== null ? 'crosshair' : 'default',
        overflow: 'hidden',
        position: 'absolute',
        touchAction: 'none',
      }}
    >
      <div
        data-broadset-canvas-transform="true"
        style={{
          inset: 0,
          perspective: viewport.perspective,
          position: 'absolute',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          data-broadset-canvas-root="true"
          data-testid="v1-canvas-viewport"
          style={{
            position: 'relative',
            transform: `translate(${String(viewport.panX)}px, ${String(viewport.panY)}px) scale(${String(viewport.zoom)})`,
            transformOrigin: '0 0',
            transformStyle: 'preserve-3d',
            zIndex: 0,
          }}
        >
          <V1PagePreview blobs={blobs} documentId={documentId} pageId={pageId} project={project} />
          {document === undefined ? null : <V1SafetyBoundaries document={document} viewMode={viewMode} />}
        </div>
        <div
          data-testid="v1-canvas-overlay"
          style={{
            inset: 0,
            pointerEvents: 'none',
            position: 'absolute',
            transformStyle: 'preserve-3d',
            zIndex: 1,
          }}
        >
          <div
            style={{
              pointerEvents: 'none',
              transform: `translate(${String(viewport.panX)}px, ${String(viewport.panY)}px) scale(${String(viewport.zoom)})`,
              transformOrigin: '0 0',
              transformStyle: 'preserve-3d',
            }}
          >
            {placementActive || pathDrawingElementId !== null ? null : (
              <V1SelectionTransformWidget editorStore={editorStore} zoom={viewport.zoom} />
            )}
          </div>
        </div>
      </div>
      {document === undefined ? null : <V1Rulers editorStore={editorStore} surfaceSize={document.surface.size} />}
      {placement === null || placementPreview === null ? null : (
        <div
          data-testid="placement-preview-overlay"
          style={{
            border: '1px dashed rgba(59, 130, 246, 0.9)',
            height: 12,
            left: placementPreview.x * viewport.zoom + viewport.panX - 6,
            pointerEvents: 'none',
            position: 'absolute',
            top: placementPreview.y * viewport.zoom + viewport.panY - 6,
            width: 12,
          }}
        />
      )}
      {pathDrawingElementId === null || drawingLastPoint === undefined || pathPreview === null ? null : (
        <svg aria-hidden="true" style={{ inset: 0, pointerEvents: 'none', position: 'absolute' }}>
          <line
            data-testid="placement-preview-path-line"
            stroke="rgba(59, 130, 246, 0.9)"
            strokeDasharray="4 3"
            x1={drawingLastPoint.x * viewport.zoom + viewport.panX}
            x2={pathPreview.x * viewport.zoom + viewport.panX}
            y1={drawingLastPoint.y * viewport.zoom + viewport.panY}
            y2={pathPreview.y * viewport.zoom + viewport.panY}
          />
        </svg>
      )}
      {pathEditingElement === undefined ? null : (
        <V1PathEditingOverlay
          editorStore={editorStore}
          element={pathEditingElement}
          panX={viewport.panX}
          panY={viewport.panY}
          zoom={viewport.zoom}
        />
      )}
      {clipElement === undefined ? null : (
        <V1ClipPathEditingOverlay
          clipElement={clipElement}
          panX={viewport.panX}
          panY={viewport.panY}
          zoom={viewport.zoom}
        />
      )}
      {contextMenu === null ? null : (
        <V1CanvasContextMenu
          editorStore={editorStore}
          elementId={contextMenu.elementId}
          hasClipboardContents={hasClipboardContents}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onCopy={copySelection}
          onCut={cutSelection}
          onPaste={pasteSelection}
        />
      )}
    </div>
  );
}
