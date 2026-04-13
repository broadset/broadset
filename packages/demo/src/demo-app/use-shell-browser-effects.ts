import { cancelPlacement, type EditorStore } from '@broadset/editor';
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

    const handleGlobalKeydown = (event: KeyboardEvent): void => {
      const normalizedKey = event.key.toLowerCase();
      const usesModifier = event.ctrlKey || event.metaKey;

      if (
        usesModifier &&
        (normalizedKey === '+' || normalizedKey === '-' || normalizedKey === '=' || normalizedKey === '0')
      ) {
        event.preventDefault();

        return;
      }

      if (event.key === 'Escape') {
        setContextMenu(null);

        if (editorStore.getState().pendingPlacementType !== null) {
          event.preventDefault();
          cancelPlacement(editorStore);
        }

        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && editorStore.getState().activeElementIds.length > 0) {
        event.preventDefault();

        for (const elementId of editorStore.getState().activeElementIds) {
          editorStore.getState().removeElement(elementId);
        }

        return;
      }

      if (usesModifier && normalizedKey === 's') {
        event.preventDefault();
        handleSaveDocument();

        return;
      }

      if (usesModifier && normalizedKey === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          editorStore.getState().redo();
        } else {
          editorStore.getState().undo();
        }
      }
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
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('touchmove', preventMultiTouchZoom);
      window.removeEventListener('gesturestart', preventSafariGesture);
      window.removeEventListener('gesturechange', preventSafariGesture);
      window.removeEventListener('gestureend', preventSafariGesture);
    };
  }, [editorStore, handleSaveDocument, setContextMenu, setViewportSize]);
}
