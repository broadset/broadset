import { type EditorStore, type ElementUpdate, startInlineTextEditing } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement, ElementAnimationConfig } from '@broadset/model';
import {
  type AnimationTargetsResolver,
  applyTimelineFrameToDom,
  createPlaybackController,
  escapeCssIdentifier,
  type PlaybackController,
  resolveAnimationTargets,
  syncStateClasses,
} from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import { color } from '@broadset/ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ZOOM_STEP } from '../demo-types';
import { clampCanvasZoom } from '../demo-utils';
import {
  composePreviewDocumentWithRuntimeOverlay,
  isPreviewDocumentRuntimeProperty,
  type RuntimeTimelineOverlay,
} from '../preview-runtime-overlay';
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
  readonly runtimeOverlay: RuntimeTimelineOverlay | null;
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

function collectDomRuntimeStyles(
  runtimeOverlay: RuntimeTimelineOverlay | null,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  if (runtimeOverlay === null) {
    return new Map();
  }

  const stylesByElementId = new Map<string, Record<string, unknown>>();

  const collect = (elementId: string, properties: Readonly<Record<string, unknown>>): void => {
    const styles = Object.entries(properties).reduce<Record<string, unknown>>((entries, [propertyName, value]) => {
      if (value !== undefined && !isPreviewDocumentRuntimeProperty(propertyName)) {
        entries[propertyName] = value;
      }

      return entries;
    }, {});

    if (Object.keys(styles).length > 0) {
      stylesByElementId.set(elementId, styles);
    }
  };

  collect(runtimeOverlay.elementId, runtimeOverlay.frame.properties);

  for (const [elementId, properties] of Object.entries(runtimeOverlay.frame.targetProperties)) {
    collect(elementId, properties);
  }

  return stylesByElementId;
}

function getAnimationConfigForElement(
  documentData: BroadsetDocument,
  elementId: string,
): ElementAnimationConfig | null {
  return documentData.animations.find((entry) => entry.elementId === elementId)?.config ?? null;
}

function queryElementHost(host: HTMLElement, elementId: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-element-id="${escapeCssIdentifier(elementId)}"]`);
}

function clearRuntimeStateClasses(host: HTMLElement, activeConfigs: ReadonlyMap<string, ElementAnimationConfig>): void {
  for (const [elementId, config] of activeConfigs) {
    const elementHost = queryElementHost(host, elementId);

    if (elementHost !== null) {
      syncStateClasses(elementHost, config, null, new Set());
    }
  }
}

function clearRuntimeInlineStyles(
  host: HTMLElement,
  resolver: AnimationTargetsResolver,
  activeStyles: ReadonlyMap<string, readonly string[]>,
): void {
  for (const [elementId, propertyNames] of activeStyles) {
    const elementHost = queryElementHost(host, elementId);

    if (elementHost !== null) {
      resolver.clearStyles(elementHost, propertyNames);
    }
  }
}

function clearRuntimeElementStyles(
  resolver: AnimationTargetsResolver,
  activeStyles: ReadonlyMap<HTMLElement, readonly string[]>,
): void {
  for (const [element, propertyNames] of activeStyles) {
    resolver.clearStyles(element, propertyNames);
  }
}

function applyRuntimeInlineStyles(
  host: HTMLElement,
  resolver: AnimationTargetsResolver,
  domRuntimeStyles: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): ReadonlyMap<string, readonly string[]> {
  const nextAppliedStyles = new Map<string, readonly string[]>();

  for (const [elementId, styles] of domRuntimeStyles) {
    const elementHost = queryElementHost(host, elementId);

    if (elementHost !== null) {
      resolver.applyStyles(elementHost, styles);
      nextAppliedStyles.set(elementId, Object.keys(styles));
    }
  }

  return nextAppliedStyles;
}

function addRuntimeStateClassConfig(
  documentData: BroadsetDocument,
  configs: Map<string, ElementAnimationConfig>,
  elementId: string,
  fallbackConfig: ElementAnimationConfig,
): void {
  configs.set(elementId, getAnimationConfigForElement(documentData, elementId) ?? fallbackConfig);
}

function collectRuntimeStateClassConfigs(
  documentData: BroadsetDocument,
  configs: Map<string, ElementAnimationConfig>,
  elementId: string,
  frame: RuntimeTimelineOverlay['frame'],
  fallbackConfig: ElementAnimationConfig,
): void {
  addRuntimeStateClassConfig(documentData, configs, elementId, fallbackConfig);

  for (const targetId of Object.keys(frame.targetStates ?? {})) {
    addRuntimeStateClassConfig(documentData, configs, targetId, fallbackConfig);
  }

  for (const [childElementId, childFrame] of Object.entries(frame.childFrames)) {
    collectRuntimeStateClassConfigs(documentData, configs, childElementId, childFrame, fallbackConfig);
  }
}

function applyRuntimeTimelineFrame(options: {
  readonly documentData: BroadsetDocument;
  readonly host: HTMLElement;
  readonly onApplyStyles?: ((element: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
  readonly resolver: AnimationTargetsResolver;
  readonly runtimeOverlay: RuntimeTimelineOverlay | null;
}): ReadonlyMap<string, ElementAnimationConfig> {
  const nextStateClassConfigs = new Map<string, ElementAnimationConfig>();

  if (options.runtimeOverlay === null) {
    return nextStateClassConfigs;
  }

  const config = getAnimationConfigForElement(options.documentData, options.runtimeOverlay.elementId);
  const elementHost = queryElementHost(options.host, options.runtimeOverlay.elementId);

  if (config === null || elementHost === null) {
    return nextStateClassConfigs;
  }

  applyTimelineFrameToDom({
    root: options.host,
    targetsResolver: options.resolver,
    container: elementHost,
    config,
    frame: options.runtimeOverlay.frame,
    onApplyStyles: options.onApplyStyles,
    resolveElementConfig: (elementId) => getAnimationConfigForElement(options.documentData, elementId),
    shouldApplyProperty: (propertyName) => !isPreviewDocumentRuntimeProperty(propertyName),
  });
  collectRuntimeStateClassConfigs(
    options.documentData,
    nextStateClassConfigs,
    options.runtimeOverlay.elementId,
    options.runtimeOverlay.frame,
    config,
  );

  return nextStateClassConfigs;
}

function mergePropertyNames(current: readonly string[] | undefined, next: readonly string[]): readonly string[] {
  return [...new Set([...(current ?? []), ...next])];
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
  runtimeOverlay,
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
  const documentDataMountedRef = useRef(false);
  const isSpaceHeldRef = useRef(false);
  const runtimeStyleResolverRef = useRef<AnimationTargetsResolver | null>(null);
  const runtimeDomStylesRef = useRef<ReadonlyMap<string, readonly string[]>>(new Map());
  const runtimeDomElementStylesRef = useRef<ReadonlyMap<HTMLElement, readonly string[]>>(new Map());
  const runtimeStateClassConfigsRef = useRef<ReadonlyMap<string, ElementAnimationConfig>>(new Map());
  const runtimeOverlayRef = useRef(runtimeOverlay);
  const isPlayingRef = useRef(isPlaying);
  const hasGlobalPlaybackStylesRef = useRef(false);
  const clearDomRuntimeStylesRef = useRef<(() => void) | null>(null);
  const applyDomRuntimeStylesRef = useRef<(() => void) | null>(null);
  const [isSpacePanActive, setIsSpacePanActive] = useState(false);
  // Trackpad gesture lock: when we see a wheel event with any horizontal
  // delta (a very reliable trackpad signal), remember it for a short window so
  // subsequent pure-vertical events in the same stream (e.g. the user lifts
  // one finger) stay on the pan route instead of flipping to zoom.
  const trackpadLockExpiresAtRef = useRef(0);

  // Live viewport mirror. Imperative pan writes update this ahead of the RAF-batched store
  // commit so back-to-back wheel events read the just-applied value, not a stale closure.
  const viewportRef = useRef({ panX, panY, zoom });
  const previewDocument = useMemo(
    () => composePreviewDocumentWithRuntimeOverlay(documentData, runtimeOverlay),
    [documentData, runtimeOverlay],
  );
  const domRuntimeStyles = useMemo(() => collectDomRuntimeStyles(runtimeOverlay), [runtimeOverlay]);

  const getRuntimeStyleResolver = useCallback((): AnimationTargetsResolver => {
    runtimeStyleResolverRef.current ??= resolveAnimationTargets();

    return runtimeStyleResolverRef.current;
  }, []);

  const clearDomRuntimeStyles = useCallback((): void => {
    if (
      runtimeDomStylesRef.current.size === 0 &&
      runtimeDomElementStylesRef.current.size === 0 &&
      runtimeStateClassConfigsRef.current.size === 0
    ) {
      return;
    }

    const host = hostRef.current;

    if (host === null) {
      return;
    }

    const resolver = getRuntimeStyleResolver();

    clearRuntimeStateClasses(host, runtimeStateClassConfigsRef.current);
    clearRuntimeInlineStyles(host, resolver, runtimeDomStylesRef.current);
    clearRuntimeElementStyles(resolver, runtimeDomElementStylesRef.current);

    runtimeDomStylesRef.current = new Map();
    runtimeDomElementStylesRef.current = new Map();
    runtimeStateClassConfigsRef.current = new Map();
  }, [getRuntimeStyleResolver]);

  const applyDomRuntimeStyles = useCallback((): void => {
    if (domRuntimeStyles.size === 0 && runtimeOverlay === null) {
      return;
    }

    const host = hostRef.current;

    if (host === null) {
      return;
    }

    const resolver = getRuntimeStyleResolver();

    runtimeDomStylesRef.current = applyRuntimeInlineStyles(host, resolver, domRuntimeStyles);

    const nextDomElementStyles = new Map<HTMLElement, readonly string[]>();

    runtimeStateClassConfigsRef.current = applyRuntimeTimelineFrame({
      documentData,
      host,
      resolver,
      runtimeOverlay,
      onApplyStyles: (element, propertyNames) => {
        nextDomElementStyles.set(element, mergePropertyNames(nextDomElementStyles.get(element), propertyNames));
      },
    });
    runtimeDomElementStylesRef.current = nextDomElementStyles;
  }, [documentData, domRuntimeStyles, getRuntimeStyleResolver, runtimeOverlay]);

  useLayoutEffect(() => {
    clearDomRuntimeStylesRef.current = clearDomRuntimeStyles;
    applyDomRuntimeStylesRef.current = applyDomRuntimeStyles;
  }, [applyDomRuntimeStyles, clearDomRuntimeStyles]);

  useEffect(() => {
    viewportRef.current = { panX, panY, zoom };
  }, [panX, panY, zoom]);

  useLayoutEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
  const previewElementsById = useMemo(
    () => new Map(previewDocument.elements.map((entry) => [entry.id, entry])),
    [previewDocument.elements],
  );
  const selectedPreviewElement =
    selectedElement === null ? null : (previewElementsById.get(selectedElement.id) ?? selectedElement);
  const pathEditingPreviewElement =
    pathEditingElement === null ? null : (previewElementsById.get(pathEditingElement.id) ?? pathEditingElement);
  const clipPathEditingPreviewElement =
    clipPathEditingElement === null ? null : (
      (previewElementsById.get(clipPathEditingElement.id) ?? clipPathEditingElement)
    );

  const getElementAncestorChain = useCallback(
    (element: BroadsetElement): readonly BroadsetElement[] => {
      let parentId = element.parentId;
      let ancestors: readonly BroadsetElement[] = [];
      let visitedParentIds = new Set<string>();

      while (parentId !== null && !visitedParentIds.has(parentId)) {
        visitedParentIds = new Set([...visitedParentIds, parentId]);

        const parentElement = previewElementsById.get(parentId);

        if (parentElement === undefined) {
          break;
        }

        ancestors = [parentElement, ...ancestors];
        parentId = parentElement.parentId;
      }

      return ancestors;
    },
    [previewElementsById],
  );

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

        currentElement = previewElementsById.get(currentElement.parentId);
      }

      return { x, y };
    },
    [previewElementsById],
  );

  const selectedAncestorElements =
    selectedPreviewElement === null ? [] : getElementAncestorChain(selectedPreviewElement);

  const selectedWorldElement =
    selectedPreviewElement === null ? null : (
      {
        ...selectedPreviewElement,
        position: getElementWorldOffset(selectedPreviewElement),
      }
    );

  const pathEditingWorldElement =
    pathEditingPreviewElement === null ? null : (
      {
        ...pathEditingPreviewElement,
        position: getElementWorldOffset(pathEditingPreviewElement),
      }
    );

  const clipPathEditingWorldElement =
    clipPathEditingPreviewElement === null ? null : (
      {
        ...clipPathEditingPreviewElement,
        position: getElementWorldOffset(clipPathEditingPreviewElement),
      }
    );

  const handlePreviewTransform = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      const element = elementsById.get(elementId);

      if (element === undefined) {
        return;
      }

      onElementTransformPreview(elementId, updates);
    },
    [elementsById, onElementTransformPreview],
  );

  const handleCommitTransform = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      const element = elementsById.get(elementId);

      if (element === undefined) {
        return;
      }

      onElementTransformCommit(elementId, updates);
    },
    [elementsById, onElementTransformCommit],
  );

  const previewDocumentRef = useRef(previewDocument);
  const perspectiveRef = useRef(perspective);

  useEffect(() => {
    previewDocumentRef.current = previewDocument;
  }, [previewDocument]);

  useEffect(() => {
    runtimeOverlayRef.current = runtimeOverlay;
  }, [runtimeOverlay]);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return undefined;
    }

    const initialDocument = previewDocumentRef.current;
    const rendererController = createScreenRenderer({ host, settings: { perspective: perspectiveRef.current } });
    const playbackController = createPlaybackController({ root: host, animations: initialDocument.animations });

    rendererRef.current = rendererController;
    playbackRef.current = playbackController;
    onPlaybackControllerChange?.(playbackController);

    rendererController.updateDocument(initialDocument);
    setOverlayRoot(rendererController.getOverlayRoot());
    playbackController.attach();

    if (runtimeOverlayRef.current !== null) {
      applyDomRuntimeStylesRef.current?.();
    }

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

  useLayoutEffect(() => {
    if (!documentDataMountedRef.current) {
      documentDataMountedRef.current = true;

      return;
    }

    if (runtimeOverlay !== null) {
      playbackRef.current?.pause();
    }

    if (runtimeOverlay !== null || hasGlobalPlaybackStylesRef.current) {
      playbackRef.current?.clearStyles();
      hasGlobalPlaybackStylesRef.current = false;
    }

    clearDomRuntimeStyles();
    rendererRef.current?.updateDocument(previewDocument);
    applyDomRuntimeStyles();
  }, [applyDomRuntimeStyles, clearDomRuntimeStyles, previewDocument, runtimeOverlay]);

  useEffect(() => {
    playbackRef.current?.setAnimations(documentData.animations);
  }, [documentData.animations]);

  useEffect(() => {
    if (!resetTokenMountedRef.current) {
      resetTokenMountedRef.current = true;

      return;
    }

    playbackRef.current?.pause();
    playbackRef.current?.seek(0);
  }, [resetToken]);

  useEffect(() => {
    if (isPlaying && runtimeOverlay === null) {
      hasGlobalPlaybackStylesRef.current = true;
      playbackRef.current?.play();

      return;
    }

    playbackRef.current?.pause();
  }, [isPlaying, runtimeOverlay]);

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
      {selectedPreviewElement === null || overlayRoot === null || isTransformWidgetSuppressed ? null : (
        <SelectionTransformWidget
          ancestorElements={selectedAncestorElements}
          element={selectedPreviewElement}
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
