import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';

import { clampCanvasZoom } from '../demo-utils';

export type AlignmentAction = 'bottom' | 'center-x' | 'center-y' | 'left' | 'right' | 'top';

export interface UseCanvasControlHandlersOptions {
  readonly editorStore: EditorStore;
  readonly selectedMovableElements: readonly BroadsetElement[];
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly setIsPlaying: Dispatch<SetStateAction<boolean>>;
  readonly setResetToken: Dispatch<SetStateAction<number>>;
}

export interface CanvasControlHandlers {
  readonly handleAlignSelection: (action: AlignmentAction) => void;
  readonly handleCanvasViewportChange: (settings: {
    readonly panX?: number;
    readonly panY?: number;
    readonly zoom?: number;
  }) => void;
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
    (settings: { readonly panX?: number; readonly panY?: number; readonly zoom?: number }): void => {
      editorStore.getState().updateCanvasSettings(settings);
    },
    [editorStore],
  );

  const handleElementTransformPreview = useCallback(
    (elementId: string, updates: ElementUpdate): void => {
      editorStore.getState().updateElementEphemeral(elementId, updates);
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

      editorStore.getState().commitGroupMove(
        selectedMovableElements.map((element) => ({
          elementId: element.id,
          position: {
            x:
              action === 'left' ? left
              : action === 'center-x' ? centerX - element.width / 2
              : action === 'right' ? right - element.width
              : element.position.x,
            y:
              action === 'top' ? top
              : action === 'center-y' ? centerY - element.height / 2
              : action === 'bottom' ? bottom - element.height
              : element.position.y,
          },
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
