import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { classifyWheelDevice, color, type WheelDevice } from '@broadset/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ZOOM_STEP } from '../demo-types';
import { clampCanvasZoom } from '../demo-utils';
import { ClipPathEditingOverlay } from './clip-path-editing-overlay';
import { PathEditingOverlay } from './path-editing-overlay';
import { PlacementPreviewOverlay } from './placement-preview-overlay';
import { SelectionTransformWidget } from './selection-transform-widget';

const WHEEL_GESTURE_LOCK_MS = 140;

type ViewportChangeFn = (settings: { readonly panX?: number; readonly panY?: number; readonly zoom?: number }) => void;
type PanWriteFn = (panX: number, panY: number) => void;
type WheelDeviceGesture = { readonly device: WheelDevice | null; readonly expiresAt: number };
type Viewport = { panX: number; panY: number; zoom: number };

/**
 * Resolve the wheel device for the current event, honoring a short gesture lock so that
 * macOS Chrome kinetic-scroll tail events — whose accelerated deltaY can shrink below the
 * pixel-fallback threshold — don't flip a mouse-wheel zoom into a trackpad pan mid-scroll.
 *
 * The lock only overrides when the raw classification would downgrade to `trackpad` AND
 * there is no lateral delta. A `deltaX !== 0` signal is strong evidence of a real trackpad
 * gesture, so we drop the lock and trust the raw classification in that case.
 */
function resolveWheelDevice(event: WheelEvent, gesture: WheelDeviceGesture): WheelDevice {
  const rawDevice = classifyWheelDevice({
    altKey: event.altKey,
    ctrlKey: event.ctrlKey || event.metaKey,
    deltaMode: event.deltaMode,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    wheelDeltaY: event.wheelDeltaY,
  });
  const hasActiveLock = gesture.device !== null && event.timeStamp <= gesture.expiresAt;

  if (hasActiveLock && gesture.device === 'mouse-wheel' && rawDevice === 'trackpad' && event.deltaX === 0) {
    return 'mouse-wheel';
  }

  return rawDevice;
}

function resolveWheelBounds(event: WheelEvent, container: HTMLElement | null): DOMRect | null {
  if (container !== null) return container.getBoundingClientRect();
  if (event.target instanceof Element) return event.target.getBoundingClientRect();

  return null;
}

function applyWheelZoom(
  event: WheelEvent,
  viewport: Viewport,
  container: HTMLElement | null,
  writePan: PanWriteFn,
  onViewportChange: ViewportChangeFn,
): void {
  const { panX: currentPanX, panY: currentPanY, zoom: currentZoom } = viewport;
  const zoomStep = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  const nextZoom =
    event.deltaMode === 0 ?
      clampCanvasZoom(currentZoom - event.deltaY * 0.002)
    : clampCanvasZoom(currentZoom + zoomStep);

  if (nextZoom === currentZoom) return;

  const bounds = resolveWheelBounds(event, container);

  if (bounds === null) return;

  const cursorX = event.clientX - bounds.left;
  const cursorY = event.clientY - bounds.top;
  const worldX = (cursorX - currentPanX) / currentZoom;
  const worldY = (cursorY - currentPanY) / currentZoom;
  const nextPanX = cursorX - worldX * nextZoom;
  const nextPanY = cursorY - worldY * nextZoom;

  writePan(nextPanX, nextPanY);
  viewport.panX = nextPanX;
  viewport.panY = nextPanY;
  viewport.zoom = nextZoom;
  onViewportChange({ panX: nextPanX, panY: nextPanY, zoom: nextZoom });
}

interface ScreenPreviewProps {
  readonly allElements: readonly BroadsetElement[];
  readonly selectedElement: BroadsetElement | null;
  readonly pathEditingElement: BroadsetElement | null;
  readonly clipPathEditingElement: BroadsetElement | null;
  readonly isTransformWidgetSuppressed: boolean;
  readonly editorStore: EditorStore;
  readonly onElementTransformPreview: (elementId: string, updates: ElementUpdate) => void;
  readonly onElementTransformCommit: (elementId: string, updates: ElementUpdate) => void;
  readonly documentData: BroadsetDocument;
  readonly isPlaying: boolean;
  readonly resetToken: number;
  readonly cursor: 'crosshair' | 'default';
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly perspective: number;
  readonly onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasPointerMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onViewportChange: (settings: {
    readonly panX?: number;
    readonly panY?: number;
    readonly zoom?: number;
  }) => void;
  readonly onPlaybackControllerChange?: ((controller: PlaybackController | null) => void) | undefined;
}

export function ScreenPreview({
  allElements,
  selectedElement,
  pathEditingElement,
  clipPathEditingElement,
  isTransformWidgetSuppressed,
  editorStore,
  onElementTransformPreview,
  onElementTransformCommit,
  documentData,
  isPlaying,
  resetToken,
  cursor,
  panX,
  panY,
  zoom,
  perspective,
  onCanvasClick,
  onCanvasContextMenu,
  onCanvasPointerMove,
  onViewportChange,
  onPlaybackControllerChange,
}: ScreenPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panLayerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<ScreenRendererController | null>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panGestureRef = useRef<{
    readonly originPanX: number;
    readonly originPanY: number;
    readonly startX: number;
    readonly startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const resetTokenMountedRef = useRef(false);
  const wheelGestureRef = useRef<WheelDeviceGesture>({
    device: null,
    expiresAt: 0,
  });

  // Live viewport mirror. Imperative pan writes update this ahead of the RAF-batched store
  // commit so back-to-back wheel events read the just-applied value, not a stale closure.
  const viewportRef = useRef({ panX, panY, zoom });

  useEffect(() => {
    viewportRef.current = { panX, panY, zoom };
  }, [panX, panY, zoom]);

  // When the cursor becomes 'crosshair' (placement or drawing mode activates),
  // clear any stale click-suppression flag left over from a prior gesture. A
  // Shift-drag pan that ends without firing a synthetic click leaves
  // suppressClickRef true; without this reset the very first click of the new
  // placement/drawing session gets swallowed and the user's point is lost.
  useEffect(() => {
    if (cursor === 'crosshair') {
      suppressClickRef.current = false;
    }
  }, [cursor]);

  const elementsById = useMemo(() => new Map(allElements.map((entry) => [entry.id, entry])), [allElements]);

  const getElementWorldOffset = useCallback(
    (element: BroadsetElement): { readonly x: number; readonly y: number } => {
      let currentElement: BroadsetElement | undefined = element;
      let x = 0;
      let y = 0;

      while (currentElement !== undefined) {
        x += currentElement.position.x;
        y += currentElement.position.y;

        if (currentElement.parentId === null) {
          break;
        }

        currentElement = elementsById.get(currentElement.parentId);
      }

      return { x, y };
    },
    [elementsById],
  );

  const selectedWorldElement =
    selectedElement === null ? null : (
      {
        ...selectedElement,
        position: getElementWorldOffset(selectedElement),
      }
    );

  const pathEditingWorldElement =
    pathEditingElement === null ? null : (
      {
        ...pathEditingElement,
        position: getElementWorldOffset(pathEditingElement),
      }
    );

  const clipPathEditingWorldElement =
    clipPathEditingElement === null ? null : (
      {
        ...clipPathEditingElement,
        position: getElementWorldOffset(clipPathEditingElement),
      }
    );

  const localizePositionUpdate = useCallback(
    (element: BroadsetElement, updates: ElementUpdate): ElementUpdate => {
      if (updates.position === undefined || element.parentId === null) {
        return updates;
      }

      let parentElement = elementsById.get(element.parentId);
      let parentWorldX = 0;
      let parentWorldY = 0;

      while (parentElement !== undefined) {
        parentWorldX += parentElement.position.x;
        parentWorldY += parentElement.position.y;

        if (parentElement.parentId === null) {
          break;
        }

        parentElement = elementsById.get(parentElement.parentId);
      }

      return {
        ...updates,
        position: {
          x: updates.position.x - parentWorldX,
          y: updates.position.y - parentWorldY,
        },
      };
    },
    [elementsById],
  );

  const handlePreviewTransform = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      const element = elementsById.get(elementId);

      if (element === undefined) {
        return;
      }

      onElementTransformPreview(elementId, localizePositionUpdate(element, updates));
    },
    [elementsById, localizePositionUpdate, onElementTransformPreview],
  );

  const handleCommitTransform = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      const element = elementsById.get(elementId);

      if (element === undefined) {
        return;
      }

      onElementTransformCommit(elementId, localizePositionUpdate(element, updates));
    },
    [elementsById, localizePositionUpdate, onElementTransformCommit],
  );

  const documentDataRef = useRef(documentData);
  const perspectiveRef = useRef(perspective);

  useEffect(() => {
    documentDataRef.current = documentData;
  }, [documentData]);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }

    const initialDocument = documentDataRef.current;
    const rendererController = createScreenRenderer({ host, settings: { perspective: perspectiveRef.current } });
    const playbackController = createPlaybackController({ root: host, animations: initialDocument.animations });

    rendererRef.current = rendererController;
    playbackRef.current = playbackController;
    onPlaybackControllerChange?.(playbackController);

    rendererController.updateDocument(initialDocument);
    setOverlayRoot(rendererController.getOverlayRoot());
    playbackController.attach();
    playbackController.seek(Infinity);

    return () => {
      playbackController.destroy();
      rendererController.destroy();
      setOverlayRoot(null);
      playbackRef.current = null;
      rendererRef.current = null;
      onPlaybackControllerChange?.(null);
    };
  }, [onPlaybackControllerChange]);

  useEffect(() => {
    perspectiveRef.current = perspective;
    rendererRef.current?.updateSettings({ perspective });
  }, [perspective]);

  useEffect(() => {
    rendererRef.current?.updateDocument(documentData);
    playbackRef.current?.setAnimations(documentData.animations);
    playbackRef.current?.pause();
    playbackRef.current?.seek(Infinity);
  }, [documentData]);

  useEffect(() => {
    if (!resetTokenMountedRef.current) {
      resetTokenMountedRef.current = true;

      return;
    }

    playbackRef.current?.pause();
    playbackRef.current?.seek(0);
  }, [resetToken]);

  useEffect(() => {
    if (isPlaying) {
      playbackRef.current?.play();

      return;
    }

    playbackRef.current?.pause();
  }, [isPlaying]);

  const handlePreviewClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();

        return;
      }

      onCanvasClick(event);
    },
    [onCanvasClick],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      // Any new pointer-down starts a fresh interaction — any stale "suppress
      // the synthetic click that follows a drag" flag from a PREVIOUS gesture
      // must be cleared so it can't swallow the click this interaction fires.
      // If this new interaction turns out to be a drag with movement, the
      // pointer-move handler will re-set the flag below before the trailing
      // click arrives, and handlePreviewClick will consume it then.
      suppressClickRef.current = false;

      if (cursor === 'crosshair' || (!event.shiftKey && event.button !== 1)) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panGestureRef.current = {
        originPanX: viewportRef.current.panX,
        originPanY: viewportRef.current.panY,
        startX: event.clientX,
        startY: event.clientY,
      };
      setIsPanning(true);
    },
    [cursor],
  );

  const writePanLayerTransformNow = useCallback((nextPanX: number, nextPanY: number): void => {
    viewportRef.current = { ...viewportRef.current, panX: nextPanX, panY: nextPanY };

    const layer = panLayerRef.current;

    if (layer === null) {
      return;
    }

    layer.style.transform = `translate(${String(nextPanX)}px, ${String(nextPanY)}px)`;
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = panGestureRef.current;

      if (gesture === null) {
        onCanvasPointerMove(event);

        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;

      if (deltaX !== 0 || deltaY !== 0) {
        suppressClickRef.current = true;
      }

      const nextPanX = gesture.originPanX + deltaX;
      const nextPanY = gesture.originPanY + deltaY;

      // Paint pan immediately by mutating the pan-layer transform, then commit to the
      // store (RAF-batched) so rulers and other subscribers catch up on the next frame.
      writePanLayerTransformNow(nextPanX, nextPanY);
      onViewportChange({ panX: nextPanX, panY: nextPanY });
    },
    [onCanvasPointerMove, onViewportChange, writePanLayerTransformNow],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (panGestureRef.current === null) {
      return;
    }

    panGestureRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent): void => {
      // Keep wheel behavior owned by the canvas so zoom gestures never leak into native scrolling.
      // Must be attached as a non-passive native listener so preventDefault actually suppresses scroll.
      event.preventDefault();

      const device = resolveWheelDevice(event, wheelGestureRef.current);

      wheelGestureRef.current = { device, expiresAt: event.timeStamp + WHEEL_GESTURE_LOCK_MS };

      const { panX: currentPanX, panY: currentPanY } = viewportRef.current;
      const hasHorizontalPanModifier = event.ctrlKey || event.metaKey;

      if (device === 'mouse-wheel' && hasHorizontalPanModifier) {
        const nextPanX = currentPanX - event.deltaY;

        writePanLayerTransformNow(nextPanX, currentPanY);
        onViewportChange({ panX: nextPanX, panY: currentPanY });

        return;
      }

      if (device === 'mouse-wheel' && event.altKey) {
        const nextPanY = currentPanY - event.deltaY;

        writePanLayerTransformNow(currentPanX, nextPanY);
        onViewportChange({ panX: currentPanX, panY: nextPanY });

        return;
      }

      if (device === 'trackpad' && !hasHorizontalPanModifier && !event.altKey) {
        const nextPanX = currentPanX - event.deltaX;
        const nextPanY = currentPanY - event.deltaY;

        writePanLayerTransformNow(nextPanX, nextPanY);
        onViewportChange({ panX: nextPanX, panY: nextPanY });

        return;
      }

      // Remaining cases zoom at cursor: mouse-wheel without modifier, trackpad pinch
      // (synthesized ctrlKey on macOS), and trackpad Alt+scroll zoom alternate.
      applyWheelZoom(event, viewportRef.current, containerRef.current, writePanLayerTransformNow, onViewportChange);
    },
    [onViewportChange, writePanLayerTransformNow],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return undefined;
    }

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/role-supports-aria-props, jsx-a11y/click-events-have-key-events --
       Canvas preview is a complex pointer-driven editing surface. role="application"
       signals to assistive tech that key/mouse events are handled by this widget;
       canvas-level keyboard shortcuts are wired at the editor store level, not as
       per-element keydown handlers. */
    <div
      ref={containerRef}
      aria-description="Mouse wheel zooms, ctrl or command wheel pans horizontally, Alt pans vertically, and Shift-drag or middle-click pans the view."
      aria-label={`Screen preview for ${documentData.name}`}
      className="h-full w-full overflow-hidden"
      role="application"
      onClick={handlePreviewClick}
      onContextMenu={onCanvasContextMenu}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        backgroundColor: color('surface-secondary'),
        cursor: isPanning ? 'grabbing' : cursor,
        position: 'relative',
        touchAction: 'none',
      }}
    >
      <div
        ref={panLayerRef}
        data-testid="screen-pan-layer"
        style={{
          height: '100%',
          left: 0,
          position: 'absolute',
          top: 0,
          transform: `translate(${String(panX)}px, ${String(panY)}px)`,
          transformOrigin: 'top left',
          width: '100%',
          willChange: 'transform',
        }}
      >
        <div
          ref={hostRef}
          className="h-full w-full overflow-hidden"
          data-testid="screen-renderer-host"
          style={{
            transform: `scale(${String(zoom)})`,
            transformOrigin: 'top left',
            willChange: 'transform',
          }}
        />
      </div>
      {selectedWorldElement === null || overlayRoot === null || isTransformWidgetSuppressed ? null : (
        <SelectionTransformWidget
          element={selectedWorldElement}
          overlayRoot={overlayRoot}
          onCommitUpdate={handleCommitTransform}
          onPreviewUpdate={handlePreviewTransform}
        />
      )}
      {pathEditingWorldElement === null || overlayRoot === null ? null : (
        <PathEditingOverlay editorStore={editorStore} element={pathEditingWorldElement} overlayRoot={overlayRoot} />
      )}
      {clipPathEditingWorldElement === null || overlayRoot === null ? null : (
        <ClipPathEditingOverlay
          editorStore={editorStore}
          element={clipPathEditingWorldElement}
          overlayRoot={overlayRoot}
        />
      )}
      {overlayRoot === null ? null : <PlacementPreviewOverlay editorStore={editorStore} overlayRoot={overlayRoot} />}
    </div>
  );
}
