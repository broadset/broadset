import type { ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { classifyWheelInput, color } from '@broadset/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ZOOM_STEP } from '../demo-types';
import { clampCanvasZoom } from '../demo-utils';
import { SelectionTransformWidget } from './selection-transform-widget';

export interface ScreenPreviewProps {
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
    playbackController.seek(0);

    return () => {
      playbackController.destroy();
      rendererController.destroy();
      playbackRef.current = null;
      rendererRef.current = null;
      onPlaybackControllerChange?.(null);
    };
  }, [onPlaybackControllerChange]);

  useEffect(() => {
    rendererRef.current?.updateDocument(documentData);
    playbackRef.current?.setAnimations(documentData.animations);
    playbackRef.current?.pause();
    playbackRef.current?.seek(0);
  }, [documentData]);

  useEffect(() => {
    if (resetToken >= 0) {
      playbackRef.current?.pause();
      playbackRef.current?.seek(0);
    }
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
        originPanX: panX,
        originPanY: panY,
        startX: event.clientX,
        startY: event.clientY,
      };
      setIsPanning(true);
    },
    [cursor, panX, panY],
  );

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

      onViewportChange({
        panX: gesture.originPanX + deltaX,
        panY: gesture.originPanY + deltaY,
      });
    },
    [onViewportChange],
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
    (event: React.WheelEvent<HTMLDivElement>): void => {
      const isLegacyWheel = event.deltaMode !== 0;

      if (isLegacyWheel && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onViewportChange({
          panX: panX - event.deltaY,
          panY,
        });

        return;
      }

      if (isLegacyWheel && event.altKey) {
        event.preventDefault();
        onViewportChange({
          panX,
          panY: panY - event.deltaY,
        });

        return;
      }

      const intent = classifyWheelInput({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });

      if (intent === 'none') {
        return;
      }

      event.preventDefault();

      if (intent === 'pan') {
        onViewportChange({
          panX: panX - event.deltaX,
          panY: panY - event.deltaY,
        });

        return;
      }

      const nextZoom =
        event.deltaMode === 0 ?
          clampCanvasZoom(zoom - event.deltaY * 0.002)
        : clampCanvasZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));

      if (nextZoom === zoom) {
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const worldX = (cursorX - panX) / zoom;
      const worldY = (cursorY - panY) / zoom;

      onViewportChange({
        panX: cursorX - worldX * nextZoom,
        panY: cursorY - worldY * nextZoom,
        zoom: nextZoom,
      });
    },
    [onViewportChange, panX, panY, zoom],
  );

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
      onWheel={handleWheel}
      style={{
        backgroundColor: color('surface-secondary'),
        cursor: isPanning ? 'grabbing' : cursor,
        position: 'relative',
        touchAction: 'none',
      }}
    >
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden"
        data-testid="screen-renderer-host"
        style={{
          transform: `translate(${String(panX)}px, ${String(panY)}px) scale(${String(zoom)})`,
          transformOrigin: 'top left',
          transition: isPanning ? 'none' : 'transform 120ms ease',
          willChange: 'transform',
        }}
      />
      {selectedElement === null ? null : (
        <SelectionTransformWidget
          contentScale={contentScale}
          element={selectedElement}
          panX={panX}
          panY={panY}
          zoom={zoom}
          onCommitUpdate={onElementTransformCommit}
          onPreviewUpdate={onElementTransformPreview}
        />
      )}
    </div>
  );
}
