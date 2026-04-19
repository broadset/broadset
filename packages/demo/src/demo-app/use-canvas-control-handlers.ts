import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { clampCanvasZoom } from '../demo-utils';

type AlignmentAction = 'bottom' | 'center-x' | 'center-y' | 'left' | 'right' | 'top';

type CanvasViewportSettings = {
  readonly panX?: number;
  readonly panY?: number;
  readonly zoom?: number;
};

interface UseCanvasControlHandlersOptions {
  readonly editorStore: EditorStore;
  readonly selectedMovableElements: readonly BroadsetElement[];
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly setIsPlaying: Dispatch<SetStateAction<boolean>>;
  readonly setResetToken: Dispatch<SetStateAction<number>>;
}

interface CanvasControlHandlers {
  readonly handleAlignSelection: (action: AlignmentAction) => void;
  readonly handleCanvasViewportChange: (settings: CanvasViewportSettings) => void;
  readonly handleDistributeSelection: (axis: 'horizontal' | 'vertical') => void;
  readonly handleElementTransformCommit: (elementId: string, updates: ElementUpdate) => void;
  readonly handleElementTransformPreview: (elementId: string, updates: ElementUpdate) => void;
  readonly handleResetPlayback: () => void;
  readonly handleResetZoom: () => void;
  readonly handleToggleFullscreen: () => Promise<void>;
  readonly handleTogglePlayback: () => void;
  readonly handleZoomStep: (delta: number) => void;
  readonly handleZoomToFit: () => void;
}

export function useCanvasControlHandlers({
  editorStore,
  selectedMovableElements,
  pushToast,
  setIsPlaying,
  setResetToken,
}: UseCanvasControlHandlersOptions): CanvasControlHandlers {
  const pendingViewportRef = useRef<CanvasViewportSettings | null>(null);
  // 0 means no RAF is scheduled; RAF IDs are always positive integers
  const viewportRafIdRef = useRef(0);

  const flushPendingViewport = useCallback((): void => {
    viewportRafIdRef.current = 0;

    const pendingSettings = pendingViewportRef.current;

    if (pendingSettings === null) {
      return;
    }

    pendingViewportRef.current = null;
    editorStore.getState().updateCanvasSettings(pendingSettings);
  }, [editorStore]);

  const handleZoomStep = useCallback(
    (delta: number): void => {
      const currentZoom = editorStore.getState().canvasSettings.zoom;

      editorStore.getState().updateCanvasSettings({ zoom: clampCanvasZoom(currentZoom + delta) });
    },
    [editorStore],
  );

  const handleZoomToFit = useCallback((): void => {
    editorStore.getState().updateCanvasSettings({ panX: 0, panY: 0, zoom: 1 });
  }, [editorStore]);

  const handleResetZoom = useCallback((): void => {
    editorStore.getState().updateCanvasSettings({ panX: 0, panY: 0, zoom: 1 });
  }, [editorStore]);

  const handleCanvasViewportChange = useCallback(
    (settings: CanvasViewportSettings): void => {
      pendingViewportRef.current = {
        ...(pendingViewportRef.current ?? {}),
        ...settings,
      };

      if (viewportRafIdRef.current === 0) {
        viewportRafIdRef.current = requestAnimationFrame(flushPendingViewport);
      }
    },
    [flushPendingViewport],
  );

  const pendingPreviewRef = useRef<{ elementId: string; updates: ElementUpdate } | null>(null);
  // 0 means no RAF is scheduled; RAF IDs are always positive integers
  const rafIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== 0) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      if (viewportRafIdRef.current !== 0) {
        cancelAnimationFrame(viewportRafIdRef.current);
        viewportRafIdRef.current = 0;
      }
    };
  }, []);

  const handleElementTransformPreview = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      pendingPreviewRef.current = { elementId, updates };

      if (rafIdRef.current === 0) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;

          const pending = pendingPreviewRef.current;

          if (pending !== null) {
            editorStore.getState().updateElementEphemeral(pending.elementId, pending.updates);
            pendingPreviewRef.current = null;
          }
        });
      }
    },
    [editorStore],
  );

  const handleElementTransformCommit = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      editorStore.getState().commitElementUpdate(elementId, updates);
    },
    [editorStore],
  );

  const handleAlignSelection = useCallback(
    (action: AlignmentAction): void => {
      if (selectedMovableElements.length < 2) {
        return;
      }

      const left = Math.min(...selectedMovableElements.map((element) => element.position.x));
      const right = Math.max(...selectedMovableElements.map((element) => element.position.x + element.width));
      const top = Math.min(...selectedMovableElements.map((element) => element.position.y));
      const bottom = Math.max(...selectedMovableElements.map((element) => element.position.y + element.height));
      const centerX = left + (right - left) / 2;
      const centerY = top + (bottom - top) / 2;

      const xFor = (element: { readonly width: number; readonly position: { readonly x: number } }): number => {
        if (action === 'left') return left;
        if (action === 'center-x') return centerX - element.width / 2;
        if (action === 'right') return right - element.width;

        return element.position.x;
      };
      const yFor = (element: { readonly height: number; readonly position: { readonly y: number } }): number => {
        if (action === 'top') return top;
        if (action === 'center-y') return centerY - element.height / 2;
        if (action === 'bottom') return bottom - element.height;

        return element.position.y;
      };

      editorStore.getState().commitGroupMove(
        selectedMovableElements.map((element) => ({
          elementId: element.id,
          position: { x: xFor(element), y: yFor(element) },
        })),
      );
      pushToast('success', 'Aligned the selected elements.');
    },
    [editorStore, pushToast, selectedMovableElements],
  );

  const handleDistributeSelection = useCallback(
    (axis: 'horizontal' | 'vertical'): void => {
      if (selectedMovableElements.length < 3) {
        return;
      }

      const sortedElements = [...selectedMovableElements].sort((leftElement, rightElement) =>
        axis === 'horizontal' ?
          leftElement.position.x - rightElement.position.x
        : leftElement.position.y - rightElement.position.y,
      );
      const firstElement = sortedElements[0];
      const lastElement = sortedElements[sortedElements.length - 1];

      if (firstElement === undefined || lastElement === undefined) {
        return;
      }

      const totalSize = sortedElements.reduce(
        (sum, element) => sum + (axis === 'horizontal' ? element.width : element.height),
        0,
      );
      const span =
        axis === 'horizontal' ?
          lastElement.position.x + lastElement.width - firstElement.position.x
        : lastElement.position.y + lastElement.height - firstElement.position.y;
      const gap = (span - totalSize) / Math.max(sortedElements.length - 1, 1);
      let cursor = axis === 'horizontal' ? firstElement.position.x : firstElement.position.y;

      editorStore.getState().commitGroupMove(
        sortedElements.map((element) => {
          const nextPosition =
            axis === 'horizontal' ? { x: cursor, y: element.position.y } : { x: element.position.x, y: cursor };

          cursor += (axis === 'horizontal' ? element.width : element.height) + gap;

          return { elementId: element.id, position: nextPosition };
        }),
      );
      pushToast('success', `Distributed the selection ${axis}.`);
    },
    [editorStore, pushToast, selectedMovableElements],
  );

  const handleTogglePlayback = useCallback((): void => {
    setIsPlaying((currentValue) => !currentValue);
  }, [setIsPlaying]);

  const handleResetPlayback = useCallback((): void => {
    setIsPlaying(false);
    setResetToken((currentValue) => currentValue + 1);
  }, [setIsPlaying, setResetToken]);

  const handleToggleFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
        pushToast('info', 'Entered fullscreen mode.');

        return;
      }

      await document.exitFullscreen();
      pushToast('info', 'Exited fullscreen mode.');
    } catch {
      pushToast('error', 'Could not toggle fullscreen mode.');
    }
  }, [pushToast]);

  return {
    handleAlignSelection,
    handleCanvasViewportChange,
    handleDistributeSelection,
    handleElementTransformCommit,
    handleElementTransformPreview,
    handleResetPlayback,
    handleResetZoom,
    handleToggleFullscreen,
    handleTogglePlayback,
    handleZoomStep,
    handleZoomToFit,
  };
}
