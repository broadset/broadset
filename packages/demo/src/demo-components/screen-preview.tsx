import { type EditorStore, type ElementUpdate, startInlineTextEditing } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { color } from '@broadset/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ZOOM_STEP } from '../demo-types';
import { clampCanvasZoom } from '../demo-utils';
import { ClipPathEditingOverlay } from './clip-path-editing-overlay';
import { GridOverlay } from './grid-overlay';
import { InlineTextOverlay } from './inline-text-overlay';
import { PathEditingOverlay } from './path-editing-overlay';
import { PlacementPreviewOverlay } from './placement-preview-overlay';
import { SafetyBoundariesOverlay } from './safety-boundaries-overlay';
import { SelectionTransformWidget } from './selection-transform-widget';

type ViewportChangeFn = (settings: { readonly panX?: number; readonly panY?: number; readonly zoom?: number }) => void;
type PanWriteFn = (panX: number, panY: number) => void;
type Viewport = { panX: number; panY: number; zoom: number };

/**
 * Once a wheel event with horizontal delta lands on the canvas, subsequent
 * events within this window also pan — trackpad scrolls often include a
 * handful of pure-vertical events (fingers slightly lifting) that would
 * otherwise be misclassified as mouse-wheel zoom.
 */
const TRACKPAD_GESTURE_LOCK_MS = 400;

function resolveWheelBounds(event: WheelEvent, container: HTMLElement | null): DOMRect | null {
  if (container !== null) return container.getBoundingClientRect();
  if (event.target instanceof Element) return event.target.getBoundingClientRect();

  return null;
}

function resolvePreviewCursor(
  isPanning: boolean,
  isSpacePanActive: boolean,
  baseCursor: 'crosshair' | 'default',
): string {
  if (isPanning) return 'grabbing';
  if (isSpacePanActive) return 'grab';

  return baseCursor;
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
  const isSpaceHeldRef = useRef(false);
  const [isSpacePanActive, setIsSpacePanActive] = useState(false);
  // Trackpad gesture lock: when we see a wheel event with any horizontal
  // delta (a very reliable trackpad signal), remember it for a short window so
  // subsequent pure-vertical events in the same stream (e.g. the user lifts
  // one finger) stay on the pan route instead of flipping to zoom.
  const trackpadLockExpiresAtRef = useRef(0);

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

  const tryStartInlineTextEditing = useCallback(
    (elementId: string): boolean => {
      const element = elementsById.get(elementId);

      if (element?.type !== 'text') {
        return false;
      }

      startInlineTextEditing(editorStore, elementId);

      return true;
    },
    [editorStore, elementsById],
  );

  const handlePreviewDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-element-id]') : null;
      const elementId = target?.dataset['elementId'];

      if (typeof elementId !== 'string' || elementId === '') {
        return;
      }

      if (tryStartInlineTextEditing(elementId)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [tryStartInlineTextEditing],
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

      const shouldPan = event.shiftKey || event.button === 1 || isSpaceHeldRef.current;

      if (cursor === 'crosshair' || !shouldPan) {
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

      // Trackpad pinch zoom: browsers synthesize ctrlKey regardless of physical modifier.
      // Always route to zoom-at-cursor.
      if (event.ctrlKey) {
        applyWheelZoom(event, viewportRef.current, containerRef.current, writePanLayerTransformNow, onViewportChange);

        return;
      }

      // Distinguishing mouse-wheel rotation from trackpad scroll is hard because
      // modern Chrome emits fractional, non-120-multiple delta values for both
      // sources (smooth scrolling on the wheel, momentum on the trackpad). The
      // one signal that stays reliable is `deltaX` — trackpad scrolls almost
      // always produce at least one horizontal-delta event per gesture, while
      // mouse wheels don't. A short time-based lock keeps the rest of the
      // trackpad stream (which may well be pure-vertical) on the pan route.
      const hasHorizontalDelta = event.deltaX !== 0;
      const hasTrackpadLock = event.timeStamp < trackpadLockExpiresAtRef.current;

      if (hasHorizontalDelta || hasTrackpadLock) {
        trackpadLockExpiresAtRef.current = event.timeStamp + TRACKPAD_GESTURE_LOCK_MS;

        const { panX: currentPanX, panY: currentPanY } = viewportRef.current;
        const nextPanX = currentPanX - event.deltaX;
        const nextPanY = currentPanY - event.deltaY;

        writePanLayerTransformNow(nextPanX, nextPanY);
        onViewportChange({ panX: nextPanX, panY: nextPanY });

        return;
      }

      // Mouse-wheel rotation: always zoom at the cursor. Stray Ctrl/Alt presses
      // are intentionally not remapped to pan — the canvas spec says the wheel
      // may only zoom, and mouse-wheel press + drag (middle-click) already pans.
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

  // Space-held pan: when space is pressed while the canvas has focus (and the
  // event target is not editable), treat subsequent drags as pan gestures.
  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;

      return (
        target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      );
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || isEditable(event.target)) return;

      if (isSpaceHeldRef.current) {
        event.preventDefault();

        return;
      }

      isSpaceHeldRef.current = true;
      setIsSpacePanActive(true);
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;

      isSpaceHeldRef.current = false;
      setIsSpacePanActive(false);
    };

    const handleBlur = (): void => {
      isSpaceHeldRef.current = false;
      setIsSpacePanActive(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/role-supports-aria-props, jsx-a11y/click-events-have-key-events --
       Canvas preview is a complex pointer-driven editing surface. role="application"
       signals to assistive tech that key/mouse events are handled by this widget;
       canvas-level keyboard shortcuts are wired at the editor store level, not as
       per-element keydown handlers. */
    <div
      ref={containerRef}
      aria-description="Mouse wheel zooms at the cursor; trackpad scroll pans and pinch zooms; Shift-drag, Space-drag, or middle-click pans the view."
      aria-label={`Screen preview for ${documentData.name}`}
      className="h-full w-full overflow-hidden"
      role="application"
      onClick={handlePreviewClick}
      onDoubleClick={handlePreviewDoubleClick}
      onContextMenu={onCanvasContextMenu}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        backgroundColor: color('surface-secondary'),
        cursor: resolvePreviewCursor(isPanning, isSpacePanActive, cursor),
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
      {overlayRoot === null ? null : <SafetyBoundariesOverlay editorStore={editorStore} overlayRoot={overlayRoot} />}
      {selectedWorldElement === null || overlayRoot === null || isTransformWidgetSuppressed ? null : (
        <SelectionTransformWidget
          element={selectedWorldElement}
          overlayRoot={overlayRoot}
          onCommitUpdate={handleCommitTransform}
          onDoubleClick={tryStartInlineTextEditing}
          onPreviewUpdate={handlePreviewTransform}
          zoom={zoom}
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
      {overlayRoot === null ? null : <GridOverlay editorStore={editorStore} overlayRoot={overlayRoot} />}
      {overlayRoot === null ? null : (
        <InlineTextOverlay editorStore={editorStore} overlayRoot={overlayRoot} worldElement={selectedWorldElement} />
      )}
    </div>
  );
}
