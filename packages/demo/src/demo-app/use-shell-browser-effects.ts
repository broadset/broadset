import {
  cancelPlacement,
  closeAndStopPathDrawing,
  commitAndStopPathDrawing,
  createKeyboardHandler,
  type EditorStore,
  stopClipPathEditing,
  stopInlineTextEditing,
  stopPathEditing,
} from '@broadset/editor';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';

import type { ContextMenuState } from '../demo-types';
import { isEditableTarget } from '../demo-utils';

interface UseShellBrowserEffectsOptions {
  readonly editorStore: EditorStore;
  readonly handleSaveDocument: () => void;
  readonly setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  readonly setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  readonly setViewportSize: Dispatch<SetStateAction<{ height: number; width: number }>>;
}

export function useShellBrowserEffects({
  editorStore,
  handleSaveDocument,
  setContextMenu,
  setIsFullscreen,
  setViewportSize,
}: UseShellBrowserEffectsOptions): void {
  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [setIsFullscreen]);

  useEffect(() => {
    const rootElement = document.getElementById('root');
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlHeight = html.style.height;
    const previousHtmlColorScheme = html.style.colorScheme;
    const previousDataTheme = html.getAttribute('data-theme');
    const hadDarkClass = html.classList.contains('dark');
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyHeight = document.body.style.height;
    const previousBodyMargin = document.body.style.margin;
    const previousRootOverflow = rootElement?.style.overflow ?? '';
    const previousRootHeight = rootElement?.style.height ?? '';

    const preventZoomOnWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };
    /**
     * Browser zoom shortcuts (Ctrl/Cmd + + / - / 0) conflict with the
     * editor's own zoom step bindings — let those keydowns through and
     * the browser scales the whole UI rather than the canvas. Pre-empt
     * the default before the browser applies the zoom.
     */
    const ZOOM_KEYS: ReadonlySet<string> = new Set(['+', '=', '-', '_', '0']);
    const preventZoomOnKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (!ZOOM_KEYS.has(event.key)) return;

      event.preventDefault();
    };
    const preventMultiTouchZoom: EventListener = (event): void => {
      if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent && event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const preventSafariGesture: EventListener = (event): void => {
      event.preventDefault();
    };
    const handleWindowResize = (): void => {
      setViewportSize({ height: window.innerHeight, width: window.innerWidth });
    };

    const handleWindowPointerDown = (): void => {
      setContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent): void => {
      setContextMenu(null);

      const state = editorStore.getState();

      if (state.inlineTextEditingElementId !== null) {
        event.preventDefault();
        stopInlineTextEditing(editorStore);

        return;
      }

      if (state.pathDrawingElementId !== null) {
        event.preventDefault();
        commitAndStopPathDrawing(editorStore);

        return;
      }

      if (state.pathEditingElementId !== null) {
        event.preventDefault();
        stopPathEditing(editorStore);

        return;
      }

      if (state.clipPathEditingElementId !== null) {
        event.preventDefault();
        stopClipPathEditing(editorStore);

        return;
      }

      if (state.placement !== null) {
        event.preventDefault();
        cancelPlacement(editorStore);
      }
    };

    const handlePathDrawingEnter = (event: KeyboardEvent): boolean => {
      if (editorStore.getState().pathDrawingElementId === null) return false;

      event.preventDefault();
      closeAndStopPathDrawing(editorStore);

      return true;
    };

    const keyboardHandler = createKeyboardHandler(editorStore, {
      onSave: () => {
        handleSaveDocument();
      },
    });

    const handleGlobalKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleEscape(event);

        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === 'Enter') {
        if (handlePathDrawingEnter(event)) return;
      }

      keyboardHandler(event);
    };

    html.classList.add('dark');
    html.setAttribute('data-theme', 'dark');
    html.style.colorScheme = 'dark';
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100%';
    document.body.style.margin = '0';

    if (rootElement !== null) {
      rootElement.style.overflow = 'hidden';
      rootElement.style.height = '100%';
    }

    window.addEventListener('wheel', preventZoomOnWheel, { passive: false });
    window.addEventListener('keydown', preventZoomOnKey);
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });
    window.addEventListener('gesturestart', preventSafariGesture);
    window.addEventListener('gesturechange', preventSafariGesture);
    window.addEventListener('gestureend', preventSafariGesture);

    return () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.height = previousHtmlHeight;
      html.style.colorScheme = previousHtmlColorScheme;

      if (previousDataTheme === null) {
        html.removeAttribute('data-theme');
      } else {
        html.setAttribute('data-theme', previousDataTheme);
      }

      if (!hadDarkClass) {
        html.classList.remove('dark');
      }

      document.body.style.overflow = previousBodyOverflow;
      document.body.style.height = previousBodyHeight;
      document.body.style.margin = previousBodyMargin;

      if (rootElement !== null) {
        rootElement.style.overflow = previousRootOverflow;
        rootElement.style.height = previousRootHeight;
      }

      window.removeEventListener('wheel', preventZoomOnWheel);
      window.removeEventListener('keydown', preventZoomOnKey);
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('touchmove', preventMultiTouchZoom);
      window.removeEventListener('gesturestart', preventSafariGesture);
      window.removeEventListener('gesturechange', preventSafariGesture);
      window.removeEventListener('gestureend', preventSafariGesture);
      keyboardHandler.destroy();
    };
  }, [editorStore, handleSaveDocument, setContextMenu, setViewportSize]);
}
