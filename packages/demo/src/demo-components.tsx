import {
  applyDragTranslation,
  applyResize,
  applyRotation,
  type ElementUpdate,
  type ResizeHandle,
} from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { classifyWheelInput, color } from '@broadset/ui';
import { Button, Dropdown, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MIN_TRANSFORM_SIZE,
  ROTATION_HANDLE_OFFSET,
  RULER_SIZE,
  TRANSFORM_HANDLE_CURSORS,
  TRANSFORM_HANDLE_POSITIONS,
  TRANSFORM_HANDLE_SIZE,
  type TransformGesture,
  ZOOM_STEP,
} from './demo-types';
import { clampCanvasZoom } from './demo-utils';

export function RulerStrip({
  ticks,
  orientation,
}: {
  readonly ticks: readonly { readonly position: number; readonly label: string }[];
  readonly orientation: 'horizontal' | 'vertical';
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        background: 'rgba(20, 20, 20, 0.72)',
        backdropFilter: 'blur(6px)',
        height: orientation === 'horizontal' ? `${String(RULER_SIZE)}px` : '100%',
        position: 'relative',
        width: orientation === 'vertical' ? `${String(RULER_SIZE)}px` : '100%',
      }}
    >
      {ticks.map((tick) => (
        <div
          key={`${orientation}-${tick.label}-${String(Math.round(tick.position))}`}
          style={
            orientation === 'horizontal' ?
              {
                left: `${String(tick.position)}px`,
                position: 'absolute',
                top: 0,
              }
            : {
                position: 'absolute',
                right: 0,
                top: `${String(tick.position)}px`,
              }
          }
        >
          <div
            style={
              orientation === 'horizontal' ?
                {
                  background: 'rgba(255,255,255,0.45)',
                  height: '8px',
                  width: '1px',
                }
              : {
                  background: 'rgba(255,255,255,0.45)',
                  height: '1px',
                  width: '8px',
                }
            }
          />
          <span
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
              fontSize: '9px',
              left: orientation === 'horizontal' ? '-2px' : undefined,
              position: 'absolute',
              top: orientation === 'horizontal' ? '8px' : '-4px',
              transform: orientation === 'vertical' ? 'translate(-18px, -4px)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ToolbarMenu({
  label,
  icon,
  children,
}: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Dropdown>
      <Button aria-label={label} isIconOnly size="sm" variant="ghost">
        {icon}
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={`${label} menu`}>{children}</Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function IconToolButton({
  label,
  children,
  isActive = false,
  isDisabled = false,
  onPress,
  testId,
  tooltipPlacement = 'bottom',
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly isActive?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly onPress: () => void;
  readonly testId?: string | undefined;
  readonly tooltipPlacement?: 'bottom' | 'left' | 'right' | 'top' | undefined;
}): React.JSX.Element {
  return (
    <Tooltip delay={0}>
      <Button
        aria-label={label}
        data-testid={testId}
        isDisabled={isDisabled}
        isIconOnly
        size="sm"
        variant={isActive ? 'primary' : 'ghost'}
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content placement={tooltipPlacement}>{label}</Tooltip.Content>
    </Tooltip>
  );
}

export function SelectionTransformWidget({
  contentScale,
  element,
  panX,
  panY,
  zoom,
  onPreviewUpdate,
  onCommitUpdate,
}: {
  readonly contentScale: number;
  readonly element: BroadsetElement;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly onPreviewUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onCommitUpdate: (elementId: string, updates: ElementUpdate) => void;
}): React.JSX.Element {
  const gestureRef = useRef<TransformGesture | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  // The effective visual scale combines the editor zoom with the renderer's
  // internal content-fit scale so that widget position + gesture math match
  // what the user sees on screen.
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

      const centerX = panX + (element.position.x + element.width / 2) * effectiveZoom;
      const centerY = panY + (element.position.y + element.height / 2) * effectiveZoom;

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
    [
      element.height,
      element.position.x,
      element.position.y,
      element.rotation,
      element.width,
      panX,
      panY,
      effectiveZoom,
    ],
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

      const centerX = panX + (element.position.x + element.width / 2) * effectiveZoom;
      const centerY = panY + (element.position.y + element.height / 2) * effectiveZoom;
      const currentAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
      const update = {
        rotation: applyRotation(gesture.initialRotation, ((currentAngle - gesture.startAngle) * 180) / Math.PI),
      } satisfies ElementUpdate;

      gesture.lastUpdate = update;
      onPreviewUpdate(element.id, update);
    },
    [
      element.height,
      element.id,
      element.position,
      element.rotation,
      element.width,
      onPreviewUpdate,
      panX,
      panY,
      effectiveZoom,
    ],
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
      data-testid="demo-transform-widget"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerCancel={finishGesture}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      style={{
        height: `${String(Math.max(element.height * effectiveZoom, 1))}px`,
        left: `${String(panX + element.position.x * effectiveZoom)}px`,
        pointerEvents: 'auto',
        position: 'absolute',
        top: `${String(panY + element.position.y * effectiveZoom)}px`,
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

  // Track the renderer's internal auto-scale so the transform widget can
  // position itself to match the visually rendered element positions.
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
    const playbackController = createPlaybackController({ root: host, registry: documentData.animations });

    rendererRef.current = rendererController;
    playbackRef.current = playbackController;

    rendererController.updateDocument(documentData);
    playbackController.attach();
    playbackController.seek(0);

    return () => {
      playbackController.destroy();
      rendererController.destroy();
      playbackRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.updateDocument(documentData);
    playbackRef.current?.setRegistry(documentData.animations);
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
