import {
  cancelPlacement,
  createDataStore,
  createEditorStore,
  EditorErrorBoundary,
  EditorProvider,
  type EditorStore,
  placeElement,
  startPlacement,
} from '@broadset/editor';
import { type BroadsetDocument, broadsetDocumentSchema, type BroadsetElement } from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import {
  color,
  DEFAULT_ELEMENT_TYPES,
  EditorToolbar,
  ElementLibrary,
  font,
  glassPanelStyle,
  type LayerInfo,
  LayersSidebar,
  PageSorter,
  type PanelElement,
  PropertiesSidebar,
  sp,
  TimelineEditingProvider,
} from '@broadset/ui';
import { Button, Card, CardContent, Chip, Dropdown, Tooltip } from '@heroui/react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderOpen,
  Grid3X3,
  Info,
  Keyboard,
  Layers3,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { SAMPLE_DOCUMENT, SAMPLE_PROJECT } from './sampleDocument';

const DEMO_DOCUMENT = broadsetDocumentSchema.parse(SAMPLE_DOCUMENT);
const DOCUMENT_STORAGE_KEY = 'broadset:demo-document:v1';
const RULER_SIZE = 20;
const FLOATING_OFFSET = RULER_SIZE + 8;
const ELEMENT_LIBRARY_WIDTH = 220;
const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 280;
const SIDEBAR_EDGE_INSET = 72;
const DEFAULT_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 800;
const MIN_SIDEBAR_WIDTH = 256;
const SIDEBAR_STORAGE_KEY = 'broadset:demo-sidebar-preferences:v1';
const TOAST_DISMISS_MS = {
  error: 5000,
  info: 3000,
  success: 3000,
} as const;

type SidebarTab = 'layers' | 'properties' | 'animation' | 'preflight';
type ToastSeverity = keyof typeof TOAST_DISMISS_MS;

interface SidebarPreferences {
  readonly isOpen: boolean;
  readonly tab: SidebarTab;
  readonly width: number;
}

interface ToastMessage {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly message: string;
}

interface ContextMenuState {
  readonly elementId: string | null;
  readonly x: number;
  readonly y: number;
}

interface ScreenPreviewProps {
  readonly documentData: BroadsetDocument;
  readonly isPlaying: boolean;
  readonly resetToken: number;
  readonly cursor: 'crosshair' | 'default';
  readonly onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function loadSavedDocument(): BroadsetDocument {
  try {
    if (typeof window === 'undefined') {
      return DEMO_DOCUMENT;
    }

    const stored = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);

    if (stored === null) {
      return DEMO_DOCUMENT;
    }

    return broadsetDocumentSchema.parse(JSON.parse(stored));
  } catch {
    return DEMO_DOCUMENT;
  }
}

function loadSidebarPreferences(): SidebarPreferences {
  const defaults: SidebarPreferences = {
    isOpen: true,
    tab: 'properties',
    width: DEFAULT_SIDEBAR_WIDTH,
  };

  try {
    if (typeof window === 'undefined') {
      return defaults;
    }

    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (stored === null) {
      return defaults;
    }

    const parsed = JSON.parse(stored) as Partial<Record<'isOpen' | 'tab' | 'width', unknown>>;
    const storedTab = parsed['tab'];

    return {
      isOpen: typeof parsed['isOpen'] === 'boolean' ? parsed['isOpen'] : defaults.isOpen,
      tab:
        storedTab === 'layers' || storedTab === 'properties' || storedTab === 'animation' || storedTab === 'preflight' ?
          storedTab
        : defaults.tab,
      width: typeof parsed['width'] === 'number' ? clampSidebarWidth(parsed['width']) : defaults.width,
    };
  } catch {
    return defaults;
  }
}

function useEditorSnapshot(store: EditorStore) {
  return useSyncExternalStore(
    (onStoreChange) =>
      store.subscribe(() => {
        onStoreChange();
      }),
    () => store.getState(),
    () => store.getState(),
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  );
}

function getElementLabel(type: string | null): string {
  if (type === null) {
    return 'Element';
  }

  return DEFAULT_ELEMENT_TYPES.find((entry) => entry.type === type)?.label ?? type;
}

function toPanelElement(element: BroadsetElement): PanelElement {
  const borderRadiusValue =
    typeof element.style.borderRadius === 'number' ? element.style.borderRadius
    : Array.isArray(element.style.borderRadius) ? element.style.borderRadius[0]
    : 0;

  return {
    id: element.id,
    type: element.type,
    name: element.name,
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    backgroundColor: element.style.backgroundColor ?? '',
    backgroundGradient:
      typeof element.style.backgroundGradient === 'string' ? element.style.backgroundGradient
      : element.style.backgroundGradient === undefined ? ''
      : JSON.stringify(element.style.backgroundGradient),
    borderWidth: element.style.borderWidth ?? 0,
    borderColor: element.style.borderColor ?? '',
    borderStyle: typeof element.style.borderStyle === 'string' ? element.style.borderStyle : 'solid',
    borderRadius: borderRadiusValue,
    opacity: element.style.opacity,
    blendMode: typeof element.style.mixBlendMode === 'string' ? element.style.mixBlendMode : 'normal',
    boxShadow: element.style.boxShadow ?? '',
    filter: element.style.filter ?? '',
    backdropFilter: element.style.backdropFilter ?? '',
  };
}

function toLayerInfo(element: BroadsetElement, visible: boolean): LayerInfo {
  return {
    id: element.id,
    type: element.type,
    name: element.name,
    locked: element.locked,
    visible,
  };
}

function RulerStrip({
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

function ToastIcon({ severity }: { readonly severity: ToastSeverity }): React.JSX.Element {
  if (severity === 'success') {
    return <CheckCircle2 size={16} />;
  }

  if (severity === 'error') {
    return <AlertTriangle size={16} />;
  }

  return <Info size={16} />;
}

function ToolbarMenu({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Dropdown>
      <Dropdown.Trigger>
        <Button aria-label={label} size="sm" variant="ghost">
          {label}
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={`${label} menu`}>{children}</Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function ScreenPreview({
  documentData,
  isPlaying,
  resetToken,
  cursor,
  onCanvasClick,
  onCanvasContextMenu,
}: ScreenPreviewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<ScreenRendererController | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);

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

  return (
    <div
      aria-label={`Screen preview for ${documentData.name}`}
      className="h-full w-full overflow-hidden rounded-[24px]"
      onClick={onCanvasClick}
      onContextMenu={onCanvasContextMenu}
      style={{ backgroundColor: color('surface-secondary'), cursor }}
    >
      <div ref={hostRef} className="h-full w-full overflow-hidden rounded-[24px]" data-testid="screen-renderer-host" />
    </div>
  );
}

export function DemoApp(): React.JSX.Element {
  const storeRef = useRef<EditorStore | null>(null);
  const dataStoreRef = useRef<ReturnType<typeof createDataStore> | null>(null);

  if (storeRef.current === null) {
    const store = createEditorStore();
    const initialDocument = loadSavedDocument();
    const initialSelectionId = initialDocument.elements.find((element) => !element.locked)?.id ?? null;

    store.getState().loadTemplate(initialDocument);

    if (initialSelectionId !== null) {
      store.getState().selectElement(initialSelectionId);
    }

    storeRef.current = store;
  }

  if (dataStoreRef.current === null) {
    dataStoreRef.current = createDataStore();
  }

  const editorStore = storeRef.current;
  const dataStore = dataStoreRef.current;
  const editorState = useEditorSnapshot(editorStore);
  const temporalState = editorStore.temporal.getState();
  const currentDocument = editorState.document;
  const initialSidebarPreferences = useMemo(() => loadSidebarPreferences(), []);
  const projectDocuments = SAMPLE_PROJECT.documents.length;
  const totalElements = currentDocument.elements.length;
  const selectedElementId = editorState.activeElementIds[0] ?? null;
  const selectedElement =
    selectedElementId === null ? null : (
      (currentDocument.elements.find((element) => element.id === selectedElementId) ?? null)
    );
  const activePage = currentDocument.pages[editorState.activePageIndex] ?? currentDocument.pages[0];
  const placementLabel = getElementLabel(editorState.pendingPlacementType);
  const clipboardRef = useRef<readonly BroadsetElement[]>([]);
  const toastTimeoutIdsRef = useRef<number[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && document.fullscreenElement !== null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarPreferences.isOpen);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(initialSidebarPreferences.tab);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarPreferences.width);
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const [viewportSize, setViewportSize] = useState(() => ({
    height: typeof window === 'undefined' ? currentDocument.canvas.height : window.innerHeight,
    width: typeof window === 'undefined' ? currentDocument.canvas.width : window.innerWidth,
  }));
  const contextMenuElementId = contextMenu?.elementId ?? null;
  const contextMenuElement =
    contextMenuElementId === null ? null : (
      (currentDocument.elements.find((element) => element.id === contextMenuElementId) ?? null)
    );
  const destructiveContextActionDisabled = contextMenuElement === null || contextMenuElement.locked;

  const layers = useMemo(
    () =>
      [...currentDocument.elements].reverse().map((element) => {
        const override = activePage?.overrides.find((entry) => entry.elementId === element.id);

        return toLayerInfo(element, override?.visible !== false);
      }),
    [activePage, currentDocument.elements],
  );
  const horizontalTicks = useMemo(() => {
    const rulerLength = Math.max(viewportSize.width - sidebarWidth - FLOATING_OFFSET * 2, 320);

    return Array.from({ length: 10 }, (_, index) => {
      const value = Math.round((currentDocument.canvas.width / 10) * index);

      return {
        label: String(value),
        position: (rulerLength / 10) * index,
      };
    });
  }, [currentDocument.canvas.width, sidebarWidth, viewportSize.width]);
  const verticalTicks = useMemo(() => {
    const rulerLength = Math.max(viewportSize.height - FLOATING_OFFSET * 2, 240);

    return Array.from({ length: 8 }, (_, index) => {
      const value = Math.round((currentDocument.canvas.height / 8) * index);

      return {
        label: String(value),
        position: (rulerLength / 8) * index,
      };
    });
  }, [currentDocument.canvas.height, viewportSize.height]);

  const dismissToast = useCallback((toastId: string): void => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback(
    (severity: ToastSeverity, message: string): void => {
      const nextToastId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto ?
          crypto.randomUUID()
        : `toast-${Math.random().toString(36).slice(2)}-${String(Date.now())}`;

      setToasts((currentToasts) => [{ id: nextToastId, message, severity }, ...currentToasts]);

      const timeoutId = window.setTimeout(() => {
        dismissToast(nextToastId);
      }, TOAST_DISMISS_MS[severity]);

      toastTimeoutIdsRef.current.push(timeoutId);
    },
    [dismissToast],
  );

  const handleSaveDocument = useCallback((): void => {
    try {
      window.localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(currentDocument));
      pushToast('success', 'Saved the demo document locally.');
    } catch {
      pushToast('error', 'Could not save the demo document.');
    }
  }, [currentDocument, pushToast]);

  const pasteClipboardElements = useCallback((): void => {
    if (clipboardRef.current.length === 0) {
      pushToast('info', 'Nothing to paste yet.');

      return;
    }

    const pasteOffset = Math.min(currentDocument.canvas.width * 0.05, 24);
    const clonedElements = clipboardRef.current.map((element) => ({
      ...element,
      id: crypto.randomUUID(),
      name: `${element.name} Copy`,
      position: {
        x: element.position.x + pasteOffset,
        y: element.position.y + pasteOffset,
      },
    }));

    editorStore.setState((state) => ({
      activeElementIds: clonedElements.map((element) => element.id),
      document: {
        ...state.document,
        elements: [...state.document.elements, ...clonedElements],
      },
      editingMode: { type: 'none' },
      pathDrawingElementId: null,
      pathEditingElementId: null,
      pendingPlacementType: null,
    }));
    setContextMenu(null);
    pushToast('success', `Pasted ${String(clonedElements.length)} element${clonedElements.length === 1 ? '' : 's'}.`);
  }, [clipboardRef, currentDocument.canvas.width, editorStore, pushToast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        JSON.stringify({
          isOpen: isSidebarOpen,
          tab: sidebarTab,
          width: clampSidebarWidth(sidebarWidth),
        }),
      );
    } catch {
      // Ignore persistence failures in restricted environments.
    }
  }, [isSidebarOpen, sidebarTab, sidebarWidth]);

  useEffect(() => {
    if (selectedElement === null && (sidebarTab === 'properties' || sidebarTab === 'animation')) {
      setSidebarTab('layers');
    }
  }, [selectedElement, sidebarTab]);

  useEffect(() => {
    return () => {
      for (const timeoutId of toastTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }

      toastTimeoutIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
  }, [editorStore, handleSaveDocument]);

  const handleTogglePlayback = useCallback((): void => {
    setIsPlaying((currentValue) => !currentValue);
  }, []);

  const handleResetPlayback = useCallback((): void => {
    setIsPlaying(false);
    setResetToken((currentValue) => currentValue + 1);
  }, []);

  const handleToggleFullscreen = useCallback(async (): Promise<void> => {
    try {
      if (document.fullscreenElement === null) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
        pushToast('info', 'Entered fullscreen mode.');

        return;
      }

      await document.exitFullscreen();
      setIsFullscreen(false);
      pushToast('info', 'Exited fullscreen mode.');
    } catch {
      pushToast('error', 'Could not toggle fullscreen mode.');
    }
  }, [pushToast]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const target =
        event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-element-id]') : null;
      const state = editorStore.getState();

      if (state.pendingPlacementType !== null) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const docX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * currentDocument.canvas.width;
        const docY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * currentDocument.canvas.height;

        placeElement(editorStore, docX, docY);

        return;
      }

      if (target !== null) {
        const elementId = target.dataset['elementId'];

        if (typeof elementId === 'string' && elementId !== '') {
          if (event.metaKey || event.ctrlKey || event.shiftKey) {
            state.toggleSelectElement(elementId);
          } else {
            state.selectElement(elementId);
          }
        }

        return;
      }

      state.selectElement(null);
    },
    [currentDocument.canvas.height, currentDocument.canvas.width, editorStore],
  );

  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      const target =
        event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-element-id]') : null;
      const elementId = target?.dataset['elementId'] ?? null;

      if (typeof elementId === 'string' && elementId !== '') {
        editorStore.getState().selectElement(elementId);
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const minX = bounds.left + RULER_SIZE;
      const maxX = bounds.right - CONTEXT_MENU_WIDTH + RULER_SIZE;
      const minY = bounds.top + RULER_SIZE;
      const maxY = bounds.bottom - CONTEXT_MENU_HEIGHT + RULER_SIZE;

      setContextMenu({
        elementId,
        x: Math.max(minX, Math.min(event.clientX, maxX)),
        y: Math.max(minY, Math.min(event.clientY, maxY)),
      });
    },
    [editorStore],
  );

  const handleCopySelection = useCallback((): void => {
    const selectedElements = currentDocument.elements.filter((element) =>
      editorState.activeElementIds.includes(element.id),
    );

    if (selectedElements.length === 0) {
      pushToast('info', 'Select an element before copying.');

      return;
    }

    clipboardRef.current = selectedElements.map((element) => ({
      ...element,
      position: { ...element.position },
      style: { ...element.style },
    }));
    setContextMenu(null);
    pushToast(
      'success',
      `Copied ${String(selectedElements.length)} element${selectedElements.length === 1 ? '' : 's'}.`,
    );
  }, [clipboardRef, currentDocument.elements, editorState.activeElementIds, pushToast]);

  const handleCutSelection = useCallback((): void => {
    handleCopySelection();

    for (const elementId of editorStore.getState().activeElementIds) {
      editorStore.getState().removeElement(elementId);
    }

    pushToast('info', 'Cut the selected element.');
  }, [editorStore, handleCopySelection, pushToast]);

  const handleDuplicateSelection = useCallback((): void => {
    const selectedElements = currentDocument.elements.filter((element) =>
      editorState.activeElementIds.includes(element.id),
    );

    if (selectedElements.length === 0) {
      pushToast('info', 'Select an element before duplicating.');

      return;
    }

    clipboardRef.current = selectedElements;
    pasteClipboardElements();
  }, [clipboardRef, currentDocument.elements, editorState.activeElementIds, pasteClipboardElements, pushToast]);

  const handleElementSelect = useCallback(
    (elementType: string): void => {
      const pendingType = editorStore.getState().pendingPlacementType;

      if (pendingType === elementType) {
        cancelPlacement(editorStore);
        pushToast('info', `${getElementLabel(elementType)} placement cancelled.`);

        return;
      }

      startPlacement(editorStore, elementType);
      setIsSidebarOpen(true);
      pushToast('info', `${getElementLabel(elementType)} placement is ready.`);
    },
    [editorStore, pushToast],
  );

  const handlePropertyUpdate = useCallback(
    (key: string, value: string | number): void => {
      if (selectedElement === null) {
        return;
      }

      if (key === 'x' || key === 'y') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          position: {
            ...selectedElement.position,
            [key]: Number(value),
          },
        });

        return;
      }

      if (key === 'width' || key === 'height' || key === 'rotation') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          [key]: Number(value),
        });

        return;
      }

      const styleKey = key === 'blendMode' ? 'mixBlendMode' : key;

      editorStore.getState().updateElementStyle(selectedElement.id, {
        [styleKey]: value,
      });
    },
    [editorStore, selectedElement],
  );

  const handleSidebarTabToggle = useCallback(
    (nextTab: SidebarTab): void => {
      setIsSidebarOpen((currentValue) => {
        if (currentValue && sidebarTab === nextTab) {
          return false;
        }

        return true;
      });
      setSidebarTab(nextTab);
    },
    [sidebarTab],
  );

  const sidebarPanel =
    sidebarTab === 'layers' ?
      <LayersSidebar
        layers={layers}
        selectedIds={editorState.activeElementIds}
        onDelete={(elementId) => {
          editorStore.getState().removeElement(elementId);
        }}
        onSelect={(elementId) => {
          editorStore.getState().selectElement(elementId);
          setSidebarTab('properties');
          setIsSidebarOpen(true);
        }}
        onToggleLock={(elementId) => {
          editorStore.getState().toggleLock(elementId);
        }}
        onToggleVisibility={(elementId) => {
          editorStore.getState().toggleVisibility(elementId);
        }}
      />
    : sidebarTab === 'properties' ?
      <PropertiesSidebar
        documentMode={currentDocument.documentMode}
        element={selectedElement === null ? null : toPanelElement(selectedElement)}
        onUpdate={handlePropertyUpdate}
      />
    : sidebarTab === 'animation' ?
      <div className="p-3" style={glassPanelStyle()}>
        <p style={{ color: color('muted'), fontSize: font('body-compact'), margin: 0 }}>
          Animations are disabled in this Phase 4 demo shell.
        </p>
      </div>
    : <div className="p-3" style={glassPanelStyle()}>
        <Chip color="success" size="sm" variant="soft">
          No preflight issues detected
        </Chip>
      </div>;

  return (
    <EditorProvider components={[]} dataStore={dataStore} store={editorStore}>
      <TimelineEditingProvider>
        <main
          className="fixed inset-0 overflow-hidden"
          data-testid="demo-shell"
          style={{ backgroundColor: color('surface'), color: color('foreground') }}
        >
          <style>{`@keyframes demo-toast-slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }`}</style>

          {editorState.canvasSettings.showRulers ?
            <>
              <div
                className="absolute left-0 top-0 z-30"
                style={{ height: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    ...glassPanelStyle(),
                    borderRadius: 0,
                    height: '100%',
                    width: '100%',
                  }}
                />
              </div>

              <div
                className="absolute right-0 top-0 z-20"
                style={{ height: `${String(RULER_SIZE)}px`, left: `${String(RULER_SIZE)}px` }}
              >
                <RulerStrip orientation="horizontal" ticks={horizontalTicks} />
              </div>

              <div
                className="absolute bottom-0 left-0 z-20"
                style={{ top: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
              >
                <RulerStrip orientation="vertical" ticks={verticalTicks} />
              </div>
            </>
          : null}

          <EditorErrorBoundary>
            <div
              className="h-full w-full overflow-hidden"
              style={{ paddingLeft: `${String(RULER_SIZE)}px`, paddingTop: `${String(RULER_SIZE)}px` }}
            >
              <section
                className="relative h-full overflow-hidden"
                style={{
                  padding: sp('sp-04'),
                  paddingRight: isSidebarOpen ? `${String(sidebarWidth + FLOATING_OFFSET * 2)}px` : sp('sp-04'),
                }}
              >
                <div
                  className="pointer-events-none absolute z-30"
                  data-testid="demo-main-toolbar"
                  style={{
                    left: `${String(FLOATING_OFFSET)}px`,
                    right: `${String(FLOATING_OFFSET)}px`,
                    top: `${String(FLOATING_OFFSET)}px`,
                  }}
                >
                  <Card className="pointer-events-auto" style={glassPanelStyle()} variant="secondary">
                    <CardContent className="flex flex-col gap-2 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ToolbarMenu label="File">
                            <Dropdown.Item
                              key="open-demo"
                              onAction={() => {
                                pushToast('info', 'Open/import is not wired in this MVP shell yet.');
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <FolderOpen size={14} />
                                Open
                              </span>
                            </Dropdown.Item>
                            <Dropdown.Item key="save-demo" onAction={handleSaveDocument}>
                              <span className="inline-flex items-center gap-2">
                                <Save size={14} />
                                Save
                              </span>
                            </Dropdown.Item>
                          </ToolbarMenu>

                          <ToolbarMenu label="View">
                            <Dropdown.Item
                              key="toggle-rulers"
                              onAction={() => {
                                editorStore
                                  .getState()
                                  .updateCanvasSettings({ showRulers: !editorState.canvasSettings.showRulers });
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Ruler size={14} />
                                {editorState.canvasSettings.showRulers ? 'Hide rulers' : 'Show rulers'}
                              </span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              key="toggle-grid"
                              onAction={() => {
                                editorStore
                                  .getState()
                                  .updateGridSettings({ showGrid: !editorState.gridSettings.showGrid });
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Grid3X3 size={14} />
                                {editorState.gridSettings.showGrid ? 'Hide grid' : 'Show grid'}
                              </span>
                            </Dropdown.Item>
                          </ToolbarMenu>

                          <ToolbarMenu label="Scenes">
                            {currentDocument.pages.map((page, index) => (
                              <Dropdown.Item
                                key={page.id}
                                onAction={() => {
                                  editorStore.getState().switchPage(index);
                                }}
                              >
                                <span className="inline-flex items-center gap-2">
                                  {editorState.activePageIndex === index ?
                                    <CheckCircle2 size={14} />
                                  : <span aria-hidden="true" style={{ display: 'inline-block', width: '14px' }} />}
                                  {page.name}
                                </span>
                              </Dropdown.Item>
                            ))}
                            <Dropdown.Item
                              key="add-scene"
                              onAction={() => {
                                editorStore.getState().addPage();
                                pushToast('success', 'Added a new scene.');
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Plus size={14} />
                                Add scene
                              </span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              key="remove-scene"
                              isDisabled={currentDocument.pages.length <= 1}
                              onAction={() => {
                                editorStore.getState().removePage(editorState.activePageIndex);
                                pushToast('info', 'Removed the current scene.');
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Trash2 size={14} />
                                Remove scene
                              </span>
                            </Dropdown.Item>
                          </ToolbarMenu>

                          <ToolbarMenu label="Help">
                            <Dropdown.Item
                              key="shortcuts-help"
                              onAction={() => {
                                pushToast(
                                  'info',
                                  'Shortcuts: Cmd/Ctrl+S saves, Cmd/Ctrl+Z undoes, Delete removes, Esc exits placement.',
                                );
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Keyboard size={14} />
                                Keyboard shortcuts
                              </span>
                            </Dropdown.Item>
                            <Dropdown.Item
                              key="about-demo"
                              onAction={() => {
                                pushToast(
                                  'info',
                                  'Broadset Phase 4 demo shell — dark editor chrome with live preview and placement mode.',
                                );
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Info size={14} />
                                About
                              </span>
                            </Dropdown.Item>
                          </ToolbarMenu>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Chip color="accent" size="sm" variant="soft">
                            {currentDocument.name}
                          </Chip>
                          <Chip color="default" size="sm" variant="soft">
                            {currentDocument.canvas.width}×{currentDocument.canvas.height}
                          </Chip>
                          <Chip color="success" size="sm" variant="soft">
                            {projectDocuments} docs
                          </Chip>
                          <Chip color="warning" size="sm" variant="soft">
                            {totalElements} elements
                          </Chip>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            aria-label={isPlaying ? 'Pause demo playback' : 'Play demo playback'}
                            data-testid="demo-playback-toggle"
                            onPress={handleTogglePlayback}
                            size="sm"
                            variant="primary"
                          >
                            <span className="inline-flex items-center gap-2">
                              {isPlaying ?
                                <Pause size={16} />
                              : <Play size={16} />}
                              {isPlaying ? 'Pause' : 'Play'}
                            </span>
                          </Button>
                          <Button
                            aria-label="Reset demo playback"
                            data-testid="demo-playback-reset"
                            onPress={handleResetPlayback}
                            size="sm"
                            variant="outline"
                          >
                            <span className="inline-flex items-center gap-2">
                              <RotateCcw size={16} />
                              Reset
                            </span>
                          </Button>
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                onPress={() => {
                                  void handleToggleFullscreen();
                                }}
                              >
                                {isFullscreen ?
                                  <Minimize2 size={16} />
                                : <Maximize2 size={16} />}
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</Tooltip.Content>
                          </Tooltip>
                        </div>
                      </div>

                      <EditorToolbar
                        canRedo={temporalState.futureStates.length > 0}
                        canUndo={temporalState.pastStates.length > 0}
                        onSave={handleSaveDocument}
                        onRedo={() => {
                          editorStore.getState().redo();
                        }}
                        onToggleGrid={() => {
                          editorStore.getState().updateGridSettings({ showGrid: !editorState.gridSettings.showGrid });
                        }}
                        onToggleGuides={() => {
                          const state = editorStore.getState();

                          if (state.canvasSettings.guides.length > 0) {
                            for (const guide of state.canvasSettings.guides) {
                              state.removeGuide(guide.id);
                            }

                            return;
                          }

                          state.addGuide({ locked: false, pos: 120, type: 'h' });
                          state.addGuide({ locked: false, pos: 240, type: 'v' });
                        }}
                        onUndo={() => {
                          editorStore.getState().undo();
                        }}
                        showGrid={editorState.gridSettings.showGrid}
                        showGuides={editorState.canvasSettings.guides.length > 0}
                        zoomPercent={editorState.canvasSettings.zoom * 100}
                      />
                    </CardContent>
                  </Card>

                  <div className="pointer-events-none mt-3 flex items-start gap-4">
                    <div
                      className="pointer-events-auto"
                      data-testid="demo-element-library"
                      style={{ width: `${String(ELEMENT_LIBRARY_WIDTH)}px` }}
                    >
                      <ElementLibrary
                        activeType={editorState.pendingPlacementType}
                        elementTypes={DEFAULT_ELEMENT_TYPES}
                        onSelect={handleElementSelect}
                      />

                      <div className="mt-3" data-testid="demo-scene-sorter">
                        <PageSorter
                          activePageIndex={editorState.activePageIndex}
                          onPageAdd={() => {
                            editorStore.getState().addPage();
                          }}
                          onPageRemove={(index) => {
                            editorStore.getState().removePage(index);
                          }}
                          onPageSelect={(index) => {
                            editorStore.getState().switchPage(index);
                          }}
                          pages={currentDocument.pages}
                        />
                      </div>
                    </div>

                    <div className="flex flex-1 justify-center">
                      <div data-testid="placement-mode-banner" hidden={editorState.pendingPlacementType === null}>
                        <Card className="pointer-events-auto" style={glassPanelStyle()} variant="secondary">
                          <CardContent className="flex items-center gap-3 p-3">
                            <Chip color="warning" size="sm" variant="soft">
                              Placement mode
                            </Chip>
                            <span style={{ color: color('foreground'), fontSize: font('body-compact') }}>
                              {placementLabel} placement is active. Click the canvas to add a new element.
                            </span>
                            <Button
                              aria-label="Cancel placement"
                              size="sm"
                              variant="ghost"
                              onPress={() => {
                                cancelPlacement(editorStore);
                                pushToast('info', `${placementLabel} placement cancelled.`);
                              }}
                            >
                              Cancel placement
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="pointer-events-none absolute z-30"
                  style={{ right: `${String(FLOATING_OFFSET)}px`, top: `${String(FLOATING_OFFSET)}px` }}
                >
                  <Card className="pointer-events-auto" style={glassPanelStyle()} variant="secondary">
                    <CardContent className="flex items-center gap-2 p-2">
                      {isSidebarOpen ?
                        <>
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                aria-label="Close sidebar"
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                onPress={() => {
                                  setIsSidebarOpen(false);
                                }}
                              >
                                <X size={16} />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>Close sidebar</Tooltip.Content>
                          </Tooltip>
                          <span
                            aria-hidden="true"
                            style={{
                              backgroundColor: color('border'),
                              display: 'inline-block',
                              height: '18px',
                              width: '1px',
                            }}
                          />
                        </>
                      : null}

                      <Tooltip>
                        <Tooltip.Trigger>
                          <Button
                            aria-label="Layers"
                            isIconOnly
                            size="sm"
                            variant={isSidebarOpen && sidebarTab === 'layers' ? 'primary' : 'ghost'}
                            onPress={() => {
                              handleSidebarTabToggle('layers');
                            }}
                          >
                            <Layers3 size={16} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Layers</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <Button
                            aria-label="Properties"
                            isDisabled={selectedElement === null}
                            isIconOnly
                            size="sm"
                            variant={isSidebarOpen && sidebarTab === 'properties' ? 'primary' : 'ghost'}
                            onPress={() => {
                              handleSidebarTabToggle('properties');
                            }}
                          >
                            <SlidersHorizontal size={16} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Properties</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <Button
                            aria-label="Animation"
                            isDisabled={selectedElement === null}
                            isIconOnly
                            size="sm"
                            variant={isSidebarOpen && sidebarTab === 'animation' ? 'primary' : 'ghost'}
                            onPress={() => {
                              handleSidebarTabToggle('animation');
                            }}
                          >
                            <Sparkles size={16} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Animation</Tooltip.Content>
                      </Tooltip>
                      <Tooltip>
                        <Tooltip.Trigger>
                          <Button
                            aria-label="Pre-flight"
                            isIconOnly
                            size="sm"
                            variant={isSidebarOpen && sidebarTab === 'preflight' ? 'primary' : 'ghost'}
                            onPress={() => {
                              handleSidebarTabToggle('preflight');
                            }}
                          >
                            <ShieldCheck size={16} />
                          </Button>
                        </Tooltip.Trigger>
                        <Tooltip.Content>Pre-flight</Tooltip.Content>
                      </Tooltip>
                    </CardContent>
                  </Card>
                </div>

                <div className="h-full w-full overflow-hidden" style={{ paddingTop: sp('sp-08') }}>
                  <Card className="h-full w-full" style={glassPanelStyle()} variant="secondary">
                    <CardContent className="h-full p-3" style={{ paddingLeft: sp('sp-08') }}>
                      <ScreenPreview
                        cursor={editorState.pendingPlacementType === null ? 'default' : 'crosshair'}
                        documentData={currentDocument}
                        isPlaying={isPlaying}
                        onCanvasClick={handleCanvasClick}
                        onCanvasContextMenu={handleCanvasContextMenu}
                        resetToken={resetToken}
                      />
                    </CardContent>
                  </Card>
                </div>
              </section>

              <aside
                className="absolute z-30"
                data-testid="demo-properties-sidebar"
                style={{
                  backgroundColor: color('surface'),
                  border: `1px solid ${color('border')}`,
                  borderRadius: '1rem 0 0 1rem',
                  bottom: `${String(SIDEBAR_EDGE_INSET)}px`,
                  boxShadow: 'var(--overlay-shadow, 0 14px 40px rgba(15, 23, 42, 0.28))',
                  overflow: 'hidden',
                  pointerEvents: isSidebarOpen ? 'auto' : 'none',
                  right: `${String(FLOATING_OFFSET)}px`,
                  top: `${String(SIDEBAR_EDGE_INSET)}px`,
                  transform: isSidebarOpen ? 'translateX(0)' : `translateX(calc(100% + ${sp('sp-04')}))`,
                  transition: 'var(--transition-panel, transform 160ms ease)',
                  width: `${String(sidebarWidth)}px`,
                }}
              >
                {isSidebarOpen ?
                  <div
                    aria-hidden="true"
                    onPointerDown={(event) => {
                      event.preventDefault();

                      const startX = event.clientX;
                      const initialWidth = sidebarWidth;
                      const handlePointerMove = (moveEvent: PointerEvent): void => {
                        const delta = startX - moveEvent.clientX;

                        setSidebarWidth(clampSidebarWidth(initialWidth + delta));
                      };
                      const handlePointerUp = (): void => {
                        window.removeEventListener('pointermove', handlePointerMove);
                        window.removeEventListener('pointerup', handlePointerUp);
                      };

                      window.addEventListener('pointermove', handlePointerMove);
                      window.addEventListener('pointerup', handlePointerUp);
                    }}
                    style={{
                      cursor: 'col-resize',
                      display: 'flex',
                      inset: '0 auto 0 -12px',
                      justifyContent: 'center',
                      position: 'absolute',
                      width: '12px',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        alignSelf: 'center',
                        backgroundColor: color('border'),
                        borderRadius: '999px',
                        color: color('muted'),
                        display: 'inline-flex',
                        fontSize: font('label'),
                        padding: '0 2px',
                      }}
                    >
                      ⋮⋮
                    </span>
                  </div>
                : null}

                <div className="h-full overflow-auto pl-2">{sidebarPanel}</div>
              </aside>

              {contextMenu !== null ?
                <Card
                  className="absolute z-40"
                  data-testid="demo-context-menu"
                  role="menu"
                  style={{
                    ...glassPanelStyle(),
                    left: `${String(contextMenu.x - RULER_SIZE)}px`,
                    top: `${String(contextMenu.y - RULER_SIZE)}px`,
                    width: '220px',
                  }}
                  variant="secondary"
                >
                  <CardContent className="p-2">
                    <Dropdown.Menu aria-label="Canvas context menu">
                      {contextMenuElement === null ?
                        <Dropdown.Item
                          key="paste-selection"
                          isDisabled={clipboardRef.current.length === 0}
                          onAction={pasteClipboardElements}
                        >
                          <span className="inline-flex w-full items-center gap-2">
                            <FolderOpen size={14} />
                            <span>Paste</span>
                            <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+V</span>
                          </span>
                        </Dropdown.Item>
                      : <>
                          <Dropdown.Item
                            key="cut-selection"
                            isDisabled={destructiveContextActionDisabled}
                            onAction={handleCutSelection}
                          >
                            <span className="inline-flex w-full items-center gap-2">
                              <Scissors size={14} />
                              <span>Cut</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+X</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item key="copy-selection" onAction={handleCopySelection}>
                            <span className="inline-flex w-full items-center gap-2">
                              <Copy size={14} />
                              <span>Copy</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+C</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="paste-selection"
                            isDisabled={clipboardRef.current.length === 0}
                            onAction={pasteClipboardElements}
                          >
                            <span className="inline-flex w-full items-center gap-2">
                              <FolderOpen size={14} />
                              <span>Paste</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+V</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="duplicate-selection"
                            isDisabled={destructiveContextActionDisabled}
                            onAction={handleDuplicateSelection}
                          >
                            <span className="inline-flex w-full items-center gap-2">
                              <Copy size={14} />
                              <span>Duplicate</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Ctrl+D</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="bring-to-front"
                            onAction={() => {
                              editorStore.getState().reorderElement(contextMenuElement.id, 'front');
                              setContextMenu(null);
                            }}
                          >
                            Bring to front
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="bring-forward"
                            onAction={() => {
                              editorStore.getState().reorderElement(contextMenuElement.id, 'forward');
                              setContextMenu(null);
                            }}
                          >
                            <span className="inline-flex w-full items-center justify-between">
                              <span>Bring forward</span>
                              <span style={{ opacity: 0.72 }}>]</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="send-backward"
                            onAction={() => {
                              editorStore.getState().reorderElement(contextMenuElement.id, 'backward');
                              setContextMenu(null);
                            }}
                          >
                            <span className="inline-flex w-full items-center justify-between">
                              <span>Send backward</span>
                              <span style={{ opacity: 0.72 }}>[</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="send-to-back"
                            onAction={() => {
                              editorStore.getState().reorderElement(contextMenuElement.id, 'back');
                              setContextMenu(null);
                            }}
                          >
                            Send to back
                          </Dropdown.Item>

                          {editorState.activeElementIds.length > 1 ?
                            <>
                              <Dropdown.Item
                                key="group-selection"
                                onAction={() => {
                                  editorStore.getState().groupElements();
                                  setContextMenu(null);
                                }}
                              >
                                <span className="inline-flex w-full items-center justify-between">
                                  <span>Group</span>
                                  <span style={{ opacity: 0.72 }}>Ctrl+G</span>
                                </span>
                              </Dropdown.Item>
                              <Dropdown.Item
                                key="ungroup-selection"
                                onAction={() => {
                                  editorStore.getState().ungroupElements();
                                  setContextMenu(null);
                                }}
                              >
                                <span className="inline-flex w-full items-center justify-between">
                                  <span>Ungroup</span>
                                  <span style={{ opacity: 0.72 }}>Ctrl+Shift+G</span>
                                </span>
                              </Dropdown.Item>
                            </>
                          : null}

                          <Dropdown.Item
                            key="toggle-lock"
                            onAction={() => {
                              editorStore.getState().toggleLock(contextMenuElement.id);
                              setContextMenu(null);
                            }}
                          >
                            <span className="inline-flex w-full items-center justify-between">
                              <span>{contextMenuElement.locked ? 'Unlock' : 'Lock'}</span>
                              <span style={{ opacity: 0.72 }}>Ctrl+L</span>
                            </span>
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="edit-clip-path"
                            onAction={() => {
                              pushToast('info', 'Clip-path editing is not wired in this shell yet.');
                              setContextMenu(null);
                            }}
                          >
                            Edit clip path
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="edit-path-points"
                            isDisabled={contextMenuElement.type !== 'path'}
                            onAction={() => {
                              if (contextMenuElement.type === 'path') {
                                editorStore.getState().enterPathEditing(contextMenuElement.id);
                                pushToast('info', 'Path point editing is now active.');
                              }

                              setContextMenu(null);
                            }}
                          >
                            Edit path points
                          </Dropdown.Item>
                          <Dropdown.Item
                            key="delete-selection"
                            isDisabled={destructiveContextActionDisabled}
                            style={{ color: color('danger') }}
                            onAction={() => {
                              for (const elementId of editorStore.getState().activeElementIds) {
                                editorStore.getState().removeElement(elementId);
                              }

                              setContextMenu(null);
                            }}
                          >
                            <span className="inline-flex w-full items-center gap-2">
                              <Trash2 size={14} />
                              <span>Delete</span>
                              <span style={{ marginLeft: 'auto', opacity: 0.72 }}>Del</span>
                            </span>
                          </Dropdown.Item>
                        </>
                      }
                    </Dropdown.Menu>
                  </CardContent>
                </Card>
              : null}

              <div className="pointer-events-none absolute bottom-[28px] right-[28px] z-40 flex flex-col gap-2">
                {toasts.map((toast) => (
                  <Card
                    key={toast.id}
                    className="pointer-events-auto"
                    style={{
                      ...glassPanelStyle(),
                      animation: 'demo-toast-slide-in 160ms ease',
                      borderLeft: `3px solid ${
                        toast.severity === 'success' ? color('success')
                        : toast.severity === 'error' ? color('danger')
                        : color('accent')
                      }`,
                      minWidth: '260px',
                    }}
                    variant="secondary"
                  >
                    <CardContent className="flex items-center gap-2 p-3">
                      <span
                        style={{
                          color:
                            toast.severity === 'success' ? color('success')
                            : toast.severity === 'error' ? color('danger')
                            : color('accent'),
                        }}
                      >
                        <ToastIcon severity={toast.severity} />
                      </span>
                      <span style={{ color: color('foreground'), fontSize: font('body-compact'), flex: 1 }}>
                        {toast.message}
                      </span>
                      <Button
                        aria-label="Dismiss toast"
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          dismissToast(toast.id);
                        }}
                      >
                        <X size={14} />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </EditorErrorBoundary>
        </main>
      </TimelineEditingProvider>
    </EditorProvider>
  );
}
