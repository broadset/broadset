import type { ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { classifyWheelInput, color } from '@broadset/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ZOOM_STEP } from '../demo-types';
import { clampCanvasZoom } from '../demo-utils';
import { SelectionTransformWidget } from './selection-transform-widget';

const WHEEL_GESTURE_LOCK_MS = 140;

export interface ScreenPreviewProps {
  readonly allElements: readonly BroadsetElement[];
  readonly selectedElement: BroadsetElement | null;
  readonly onElementTransformPreview: (elementId: string, updates: ElementUpdate) => void;
  readonly onElementTransformCommit: (elementId: string, updates: ElementUpdate) => void;
  readonly documentData: BroadsetDocument;
  readonly isPlaying: boolean;
  readonly resetToken: number;
  readonly cursor: 'crosshair' | 'default';
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
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
  onElementTransformPreview,
  onElementTransformCommit,
  documentData,
  isPlaying,
  resetToken,
  cursor,
  panX,
  panY,
  zoom,
  onCanvasClick,
  onCanvasContextMenu,
  onViewportChange,
  onPlaybackControllerChange,
}: ScreenPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panLayerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<ScreenRendererController | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [contentScale, setContentScale] = useState(1);
  const panGestureRef = useRef<{
    readonly originPanX: number;
    readonly originPanY: number;
    readonly startX: number;
    readonly startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const resetTokenMountedRef = useRef(false);
  const wheelGestureRef = useRef<{ readonly expiresAt: number; readonly intent: 'pan' | 'zoom' | null }>({
    expiresAt: 0,
    intent: null,
  });

  // Live viewport mirror. Imperative pan writes update this ahead of the RAF-batched store
  // commit so back-to-back wheel events read the just-applied value, not a stale closure.
  const viewportRef = useRef({ panX, panY, zoom });

  useEffect(() => {
    viewportRef.current = { panX, panY, zoom };
  }, [panX, panY, zoom]);

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

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return undefined;
    }

    const updateContentScale = (): void => {
      const w = container.clientWidth;
      const h = container.clientHeight;

      if (w <= 0 || h <= 0) {
        return;
      }

      const scale = Math.min(w / documentData.canvas.width, h / documentData.canvas.height);

      setContentScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    updateContentScale();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateContentScale);

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [documentData.canvas.width, documentData.canvas.height]);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }

    const rendererController = createScreenRenderer({ host });
    const playbackController = createPlaybackController({ root: host, animations: documentData.animations });

    rendererRef.current = rendererController;
    playbackRef.current = playbackController;
    onPlaybackControllerChange?.(playbackController);

    rendererController.updateDocument(documentData);
    playbackController.attach();
    playbackController.seek(Infinity);

    return () => {
      playbackController.destroy();
      rendererController.destroy();
      playbackRef.current = null;
      rendererRef.current = null;
      onPlaybackControllerChange?.(null);
    };
    // This effect intentionally uses `documentData` only for the initial
    // setup; subsequent updates flow through the dedicated effect below, so
    // re-running this one on every documentData change would tear down and
    // rebuild the playback + renderer controllers needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPlaybackControllerChange]);

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
    [onViewportChange, writePanLayerTransformNow],
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

      const isLegacyWheel = event.deltaMode !== 0;
      const { panX: currentPanX, panY: currentPanY, zoom: currentZoom } = viewportRef.current;

      if (isLegacyWheel && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();

        const nextPanX = currentPanX - event.deltaY;

        writePanLayerTransformNow(nextPanX, currentPanY);
        onViewportChange({ panX: nextPanX, panY: currentPanY });

        return;
      }

      if (isLegacyWheel && event.altKey) {
        event.preventDefault();

        const nextPanY = currentPanY - event.deltaY;

        writePanLayerTransformNow(currentPanX, nextPanY);
        onViewportChange({ panX: currentPanX, panY: nextPanY });

        return;
      }

      const rawIntent = classifyWheelInput({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });

      const now = event.timeStamp;
      const hasActiveWheelLock = wheelGestureRef.current.intent !== null && now <= wheelGestureRef.current.expiresAt;
      const absoluteDeltaX = Math.abs(event.deltaX);
      const absoluteDeltaY = Math.abs(event.deltaY);
      const shouldPreferZoomLock =
        hasActiveWheelLock &&
        wheelGestureRef.current.intent === 'zoom' &&
        rawIntent === 'pan' &&
        absoluteDeltaX <= 1 &&
        absoluteDeltaY >= absoluteDeltaX * 2;
      const intent = shouldPreferZoomLock ? 'zoom' : rawIntent;

      if (intent !== 'none') {
        wheelGestureRef.current = {
          expiresAt: now + WHEEL_GESTURE_LOCK_MS,
          intent,
        };
      }

      if (intent === 'none') {
        return;
      }

      if (intent === 'pan') {
        const nextPanX = currentPanX - event.deltaX;
        const nextPanY = currentPanY - event.deltaY;

        writePanLayerTransformNow(nextPanX, nextPanY);
        onViewportChange({ panX: nextPanX, panY: nextPanY });

        return;
      }

      const nextZoom =
        event.deltaMode === 0 ?
          clampCanvasZoom(currentZoom - event.deltaY * 0.002)
        : clampCanvasZoom(currentZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));

      if (nextZoom === currentZoom) {
        return;
      }

      const container = containerRef.current;
      const bounds =
        container === null ?
          event.target instanceof Element ?
            event.target.getBoundingClientRect()
          : null
        : container.getBoundingClientRect();

      if (bounds === null) {
        return;
      }

      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const worldX = (cursorX - currentPanX) / currentZoom;
      const worldY = (cursorY - currentPanY) / currentZoom;
      const nextPanX = cursorX - worldX * nextZoom;
      const nextPanY = cursorY - worldY * nextZoom;

      writePanLayerTransformNow(nextPanX, nextPanY);
      viewportRef.current = { panX: nextPanX, panY: nextPanY, zoom: nextZoom };
      onViewportChange({
        panX: nextPanX,
        panY: nextPanY,
        zoom: nextZoom,
      });
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
    <div
      ref={containerRef}
      aria-description="Mouse wheel zooms, ctrl or command wheel pans horizontally, Alt pans vertically, and Shift-drag or middle-click pans the view."
      aria-label={`Screen preview for ${documentData.name}`}
      className="h-full w-full overflow-hidden"
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
        {selectedWorldElement === null ? null : (
          <SelectionTransformWidget
            contentScale={contentScale}
            element={selectedWorldElement}
            zoom={zoom}
            onCommitUpdate={handleCommitTransform}
            onPreviewUpdate={handlePreviewTransform}
          />
        )}
      </div>
    </div>
  );
}
