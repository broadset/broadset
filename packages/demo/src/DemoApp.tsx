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
import {
  type BroadsetDocument,
  broadsetDocumentSchema,
  type BroadsetElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';
import { createPlaybackController, type PlaybackController } from '@broadset/playback';
import { createScreenRenderer, type ScreenRendererController } from '@broadset/renderer';
import {
  color,
  DEFAULT_ELEMENT_TYPES,
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
import { Button, ButtonGroup, Card, CardContent, Chip, Dropdown, Input, Toolbar, Tooltip } from '@heroui/react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Copy,
  Download,
  FileOutput,
  FilePlus,
  FolderOpen,
  Grid3X3,
  Hash,
  Info,
  Keyboard,
  Layers,
  Magnet,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Scissors,
  Settings,
  ShieldCheck,
  Sliders,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { SAMPLE_DOCUMENT } from './sampleDocument';

const DEMO_DOCUMENT = broadsetDocumentSchema.parse(SAMPLE_DOCUMENT);
const DOCUMENT_STORAGE_KEY = 'broadset:demo-document:v1';
const RULER_SIZE = 20;
const FLOATING_OFFSET = RULER_SIZE + 8;
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

const ELEMENT_TOOL_TYPES = [
  ...DEFAULT_ELEMENT_TYPES,
  { type: 'countdown', label: 'Countdown', icon: <span aria-hidden="true">⏱</span> },
] as const;

type SidebarTab = 'layers' | 'properties' | 'animation' | 'preflight';
type ToastSeverity = keyof typeof TOAST_DISMISS_MS;
type ActiveDialog = 'about' | 'export' | 'new-document' | 'settings' | 'shortcuts' | null;
type AlignmentAction = 'bottom' | 'center-x' | 'center-y' | 'left' | 'right' | 'top';

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

  return ELEMENT_TOOL_TYPES.find((entry) => entry.type === type)?.label ?? type;
}

function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
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

function greatestCommonDivisor(left: number, right: number): number {
  if (right === 0) {
    return left;
  }

  return greatestCommonDivisor(right, left % right);
}

function formatResolutionLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);

  return `${String(width)}×${String(height)} — ${String(width / divisor)}:${String(height / divisor)}`;
}

function hasDocumentsArray(value: unknown): value is { readonly documents: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documents' in value &&
    Array.isArray((value as { readonly documents?: unknown }).documents)
  );
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
      <Dropdown.Trigger aria-label={label} className="button button--sm button--ghost">
        {label}
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu aria-label={`${label} menu`}>{children}</Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function DialogPanel({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
}): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(2, 6, 23, 0.56)' }}
    >
      <Card
        aria-label={title}
        aria-modal="true"
        role="dialog"
        style={{ ...glassPanelStyle(), maxWidth: 'min(520px, calc(100vw - 32px))', width: '100%' }}
        variant="secondary"
      >
        <CardContent className="flex flex-col gap-3 p-4">
          <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02'), justifyContent: 'space-between' }}>
            <h2 style={{ color: color('foreground'), fontSize: font('heading-sm'), fontWeight: 700 }}>{title}</h2>
            <Button aria-label={`Close ${title}`} isIconOnly size="sm" variant="ghost" onPress={onClose}>
              <X size={16} />
            </Button>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

function IconToolButton({
  label,
  children,
  isActive = false,
  isDisabled = false,
  onPress,
  testId,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly isActive?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly onPress: () => void;
  readonly testId?: string | undefined;
}): React.JSX.Element {
  return (
    <Tooltip>
      <Tooltip.Trigger>
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
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
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
      className="h-full w-full overflow-hidden"
      onClick={onCanvasClick}
      onContextMenu={onCanvasContextMenu}
      style={{ backgroundColor: color('surface-secondary'), cursor }}
    >
      <div ref={hostRef} className="h-full w-full overflow-hidden" data-testid="screen-renderer-host" />
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
  const selectedElementId = editorState.activeElementIds[0] ?? null;
  const selectedElement =
    selectedElementId === null ? null : (
      (currentDocument.elements.find((element) => element.id === selectedElementId) ?? null)
    );
  const activePage = currentDocument.pages[editorState.activePageIndex] ?? currentDocument.pages[0];
  const placementLabel = getElementLabel(editorState.pendingPlacementType);
  const clipboardRef = useRef<readonly BroadsetElement[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimeoutIdsRef = useRef<number[]>([]);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
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
  const selectedElements = useMemo(
    () => currentDocument.elements.filter((element) => editorState.activeElementIds.includes(element.id)),
    [currentDocument.elements, editorState.activeElementIds],
  );
  const selectedMovableElements = useMemo(
    () => selectedElements.filter((element) => !element.locked),
    [selectedElements],
  );
  const hasGroupedSelection = selectedElements.some((element) => element.groupId !== null);
  const resolutionLabel = useMemo(
    () => formatResolutionLabel(currentDocument.canvas.width, currentDocument.canvas.height),
    [currentDocument.canvas.height, currentDocument.canvas.width],
  );

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

  const handleOpenImportDialog = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.currentTarget.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        const candidate = hasDocumentsArray(parsed) ? parsed.documents[0] : parsed;
        const nextDocument = broadsetDocumentSchema.parse(candidate);

        editorStore.getState().loadTemplate(nextDocument);
        pushToast('success', `Imported ${file.name}.`);
      } catch {
        pushToast('error', `Could not import ${file.name}.`);
      } finally {
        event.currentTarget.value = '';
      }
    },
    [editorStore, pushToast],
  );

  const handleSaveAsJson = useCallback((): void => {
    try {
      downloadJsonFile(
        `${currentDocument.name.replace(/\s+/g, '-').toLowerCase() || 'broadset-document'}.json`,
        currentDocument,
      );
      pushToast('success', 'Downloaded the current document as JSON.');
    } catch {
      pushToast('error', 'Could not export the document JSON.');
    }
  }, [currentDocument, pushToast]);

  const handleDebugSnapshotDownload = useCallback((): void => {
    try {
      downloadJsonFile('broadset-debug-snapshot.json', editorStore.getState());
      pushToast('success', 'Downloaded a debug snapshot.');
    } catch {
      pushToast('error', 'Could not download a debug snapshot.');
    }
  }, [editorStore, pushToast]);

  const handleCreateNewDocument = useCallback(
    (mode: 'empty' | 'sample'): void => {
      const nextDocument =
        mode === 'empty' ? createEmptyBroadsetDocument() : (
          broadsetDocumentSchema.parse(JSON.parse(JSON.stringify(DEMO_DOCUMENT)))
        );

      editorStore.getState().loadTemplate(nextDocument);
      setActiveDialog(null);
      pushToast('success', mode === 'empty' ? 'Started a new blank document.' : 'Loaded the sample document.');
    },
    [editorStore, pushToast],
  );

  const handleZoomToFit = useCallback((): void => {
    const availableWidth = viewportSize.width - (isSidebarOpen ? sidebarWidth : 0) - 160;
    const availableHeight = viewportSize.height - 160;
    const fitZoom = Math.max(
      0.25,
      Math.min(
        2,
        Math.min(availableWidth / currentDocument.canvas.width, availableHeight / currentDocument.canvas.height),
      ),
    );

    editorStore.getState().updateCanvasSettings({ panX: 0, panY: 0, zoom: fitZoom });
  }, [
    currentDocument.canvas.height,
    currentDocument.canvas.width,
    editorStore,
    isSidebarOpen,
    sidebarWidth,
    viewportSize.height,
    viewportSize.width,
  ]);

  const handleResetZoom = useCallback((): void => {
    editorStore.getState().updateCanvasSettings({ panX: 0, panY: 0, zoom: 1 });
  }, [editorStore]);

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
          <input
            ref={fileInputRef}
            accept=".json,application/json"
            hidden
            type="file"
            onChange={(event) => {
              void handleImportFileChange(event);
            }}
          />
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
                  paddingRight: sp('sp-04'),
                }}
              >
                <div
                  className="pointer-events-none absolute z-30"
                  data-testid="demo-main-toolbar"
                  style={{
                    left: `${String(FLOATING_OFFSET)}px`,
                    maxWidth: `calc(100% - ${String(FLOATING_OFFSET * 2)}px)`,
                    top: `${String(FLOATING_OFFSET)}px`,
                  }}
                >
                  <Toolbar
                    aria-label="Main editor toolbar"
                    className="pointer-events-auto"
                    isAttached
                    style={{
                      ...glassPanelStyle(),
                      alignItems: 'center',
                      borderRadius: '0.75rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: sp('sp-02'),
                      minHeight: '28px',
                      padding: sp('sp-01'),
                    }}
                  >
                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: sp('sp-01'),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <ToolbarMenu label="File">
                        <Dropdown.Item
                          key="new-document"
                          onAction={() => {
                            setActiveDialog('new-document');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <FilePlus size={14} />
                            New Document
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item key="open-demo" onAction={handleOpenImportDialog}>
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
                        <Dropdown.Item key="save-json" onAction={handleSaveAsJson}>
                          <span className="inline-flex items-center gap-2">
                            <Download size={14} />
                            Save as JSON
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item key="import-demo" onAction={handleOpenImportDialog}>
                          <span className="inline-flex items-center gap-2">
                            <Upload size={14} />
                            Import
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="export-demo"
                          onAction={() => {
                            setActiveDialog('export');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <FileOutput size={14} />
                            Export
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="document-settings"
                          onAction={() => {
                            setActiveDialog('settings');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Settings size={14} />
                            Document Settings
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item key="debug-snapshot" onAction={handleDebugSnapshotDownload}>
                          <span className="inline-flex items-center gap-2">
                            <Bug size={14} />
                            Debug Snapshot
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
                            <span>Show rulers</span>
                            {editorState.canvasSettings.showRulers ?
                              <CheckCircle2 size={14} />
                            : null}
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="toggle-grid"
                          onAction={() => {
                            editorStore.getState().updateGridSettings({ showGrid: !editorState.gridSettings.showGrid });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Grid3X3 size={14} />
                            <span>Show grid</span>
                            {editorState.gridSettings.showGrid ?
                              <CheckCircle2 size={14} />
                            : null}
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="snap-to-grid"
                          onAction={() => {
                            editorStore
                              .getState()
                              .updateGridSettings({ snapToGrid: !editorState.gridSettings.snapToGrid });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Magnet size={14} />
                            <span>Snap to Grid</span>
                            {editorState.gridSettings.snapToGrid ?
                              <CheckCircle2 size={14} />
                            : null}
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="unit-px"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ units: 'px' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.units === 'px' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            Units: px
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="unit-mm"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ units: 'mm' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.units === 'mm' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            Units: mm
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="unit-in"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ units: 'in' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.units === 'in' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            Units: in
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="view-mode-none"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ viewMode: 'none' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.viewMode === 'none' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            View Mode: None
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="view-mode-broadcast"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ viewMode: 'broadcast' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.viewMode === 'broadcast' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            View Mode: Broadcast
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="view-mode-print"
                          onAction={() => {
                            editorStore.getState().updateCanvasSettings({ viewMode: 'print' });
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {editorState.canvasSettings.viewMode === 'print' ?
                              <CheckCircle2 size={14} />
                            : <span aria-hidden="true">•</span>}
                            View Mode: Print
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="grid-size"
                          onAction={() => {
                            setActiveDialog('settings');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Hash size={14} />
                            Grid Size
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="snap-threshold"
                          onAction={() => {
                            setActiveDialog('settings');
                          }}
                        >
                          Snap Threshold
                        </Dropdown.Item>
                        <Dropdown.Item key="zoom-to-fit" onAction={handleZoomToFit}>
                          <span className="inline-flex items-center gap-2">
                            <Maximize2 size={14} />
                            Zoom to Fit
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item key="reset-zoom" onAction={handleResetZoom}>
                          <span className="inline-flex items-center gap-2">
                            <RotateCcw size={14} />
                            Reset Zoom
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
                            setActiveDialog('shortcuts');
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
                            setActiveDialog('about');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Info size={14} />
                            About
                          </span>
                        </Dropdown.Item>
                      </ToolbarMenu>
                    </div>

                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: sp('sp-01'),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <IconToolButton
                        label="Undo"
                        isDisabled={temporalState.pastStates.length === 0}
                        onPress={() => {
                          editorStore.getState().undo();
                        }}
                      >
                        <RotateCcw size={16} />
                      </IconToolButton>
                      <IconToolButton
                        label="Redo"
                        isDisabled={temporalState.futureStates.length === 0}
                        onPress={() => {
                          editorStore.getState().redo();
                        }}
                      >
                        <RotateCcw size={16} style={{ transform: 'scaleX(-1)' }} />
                      </IconToolButton>
                      <IconToolButton
                        label={isPlaying ? 'Pause playback' : 'Play playback'}
                        testId="demo-playback-toggle"
                        onPress={handleTogglePlayback}
                      >
                        {isPlaying ?
                          <Pause size={16} />
                        : <Play size={16} />}
                      </IconToolButton>
                      <IconToolButton label="Reset playback" testId="demo-playback-reset" onPress={handleResetPlayback}>
                        <RotateCcw size={16} />
                      </IconToolButton>
                    </div>

                    {selectedElements.length >= 2 ?
                      <div style={{ alignItems: 'center', display: 'flex', gap: sp('sp-02'), whiteSpace: 'nowrap' }}>
                        <ButtonGroup size="sm" variant="ghost">
                          <IconToolButton
                            label="Align left"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('left');
                            }}
                          >
                            <span aria-hidden="true">⇤</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Align center"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('center-x');
                            }}
                          >
                            <span aria-hidden="true">↔</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Align right"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('right');
                            }}
                          >
                            <span aria-hidden="true">⇥</span>
                          </IconToolButton>
                        </ButtonGroup>
                        <ButtonGroup size="sm" variant="ghost">
                          <IconToolButton
                            label="Align top"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('top');
                            }}
                          >
                            <span aria-hidden="true">⇡</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Align middle"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('center-y');
                            }}
                          >
                            <span aria-hidden="true">↕</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Align bottom"
                            isDisabled={selectedMovableElements.length < 2}
                            onPress={() => {
                              handleAlignSelection('bottom');
                            }}
                          >
                            <span aria-hidden="true">⇣</span>
                          </IconToolButton>
                        </ButtonGroup>
                        <ButtonGroup size="sm" variant="ghost">
                          <IconToolButton
                            label="Distribute horizontal"
                            isDisabled={selectedMovableElements.length < 3}
                            onPress={() => {
                              handleDistributeSelection('horizontal');
                            }}
                          >
                            <span aria-hidden="true">⇹</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Distribute vertical"
                            isDisabled={selectedMovableElements.length < 3}
                            onPress={() => {
                              handleDistributeSelection('vertical');
                            }}
                          >
                            <span aria-hidden="true">⇵</span>
                          </IconToolButton>
                        </ButtonGroup>
                        <ButtonGroup size="sm" variant="ghost">
                          <IconToolButton
                            label="Group selection"
                            onPress={() => {
                              editorStore.getState().groupElements();
                            }}
                          >
                            <span aria-hidden="true">⊡</span>
                          </IconToolButton>
                          <IconToolButton
                            label="Ungroup selection"
                            isDisabled={!hasGroupedSelection}
                            onPress={() => {
                              editorStore.getState().ungroupElements();
                            }}
                          >
                            <span aria-hidden="true">⊟</span>
                          </IconToolButton>
                        </ButtonGroup>
                      </div>
                    : null}

                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: sp('sp-01'),
                        maxWidth: '240px',
                        minWidth: '0',
                        overflow: 'hidden',
                        paddingInline: sp('sp-01'),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          color: color('foreground'),
                          fontSize: font('label'),
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {currentDocument.name}
                      </span>
                      <span aria-hidden="true" style={{ color: color('muted') }}>
                        •
                      </span>
                      <span
                        style={{
                          color: color('muted'),
                          fontSize: font('label'),
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {resolutionLabel}
                      </span>
                    </div>

                    <div
                      style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: sp('sp-01'),
                        paddingLeft: sp('sp-01'),
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <IconToolButton
                        label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                        onPress={() => {
                          void handleToggleFullscreen();
                        }}
                      >
                        {isFullscreen ?
                          <Minimize2 size={16} />
                        : <Maximize2 size={16} />}
                      </IconToolButton>
                      <span
                        aria-label="Zoom level"
                        style={{
                          color: color('muted'),
                          fontSize: font('label'),
                          minWidth: '3rem',
                          textAlign: 'right',
                        }}
                      >
                        {Math.round(editorState.canvasSettings.zoom * 100)}%
                      </span>
                    </div>
                  </Toolbar>

                  <div
                    className="pointer-events-none"
                    style={{ display: 'flex', gap: sp('sp-03'), marginTop: sp('sp-03') }}
                  >
                    <div className="pointer-events-auto" data-testid="demo-element-library">
                      <Toolbar
                        aria-label="Element toolbar"
                        isAttached
                        orientation="vertical"
                        style={{
                          ...glassPanelStyle(),
                          borderRadius: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: sp('sp-01'),
                          padding: sp('sp-01'),
                        }}
                      >
                        {ELEMENT_TOOL_TYPES.map((elementType) => (
                          <IconToolButton
                            key={elementType.type}
                            label={elementType.label}
                            isActive={editorState.pendingPlacementType === elementType.type}
                            onPress={() => {
                              handleElementSelect(elementType.type);
                            }}
                          >
                            {elementType.icon ?? <Plus size={16} />}
                          </IconToolButton>
                        ))}
                      </Toolbar>
                    </div>

                    <div
                      className="pointer-events-auto"
                      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), minWidth: '0' }}
                    >
                      <div data-testid="placement-mode-banner" hidden={editorState.pendingPlacementType === null}>
                        <Card style={glassPanelStyle()} variant="secondary">
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

                      <div data-testid="demo-scene-sorter" style={{ maxWidth: '360px' }}>
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
                  </div>
                </div>

                <div
                  className="pointer-events-none absolute z-30"
                  style={{ right: `${String(FLOATING_OFFSET)}px`, top: `${String(FLOATING_OFFSET)}px` }}
                >
                  <Toolbar
                    aria-label="Sidebar toolbar"
                    className="pointer-events-auto"
                    isAttached
                    style={{
                      ...glassPanelStyle(),
                      alignItems: 'center',
                      borderRadius: '0.75rem',
                      display: 'flex',
                      gap: sp('sp-01'),
                      padding: sp('sp-01'),
                    }}
                  >
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

                    <IconToolButton
                      label="Layers"
                      isActive={isSidebarOpen && sidebarTab === 'layers'}
                      onPress={() => {
                        handleSidebarTabToggle('layers');
                      }}
                    >
                      <Layers size={16} />
                    </IconToolButton>
                    <IconToolButton
                      label="Properties"
                      isActive={isSidebarOpen && sidebarTab === 'properties'}
                      isDisabled={selectedElement === null}
                      onPress={() => {
                        handleSidebarTabToggle('properties');
                      }}
                    >
                      <Sliders size={16} />
                    </IconToolButton>
                    <IconToolButton
                      label="Animation"
                      isActive={isSidebarOpen && sidebarTab === 'animation'}
                      isDisabled={selectedElement === null}
                      onPress={() => {
                        handleSidebarTabToggle('animation');
                      }}
                    >
                      <Workflow size={16} />
                    </IconToolButton>
                    <IconToolButton
                      label="Pre-flight"
                      isActive={isSidebarOpen && sidebarTab === 'preflight'}
                      onPress={() => {
                        handleSidebarTabToggle('preflight');
                      }}
                    >
                      <ShieldCheck size={16} />
                    </IconToolButton>
                  </Toolbar>
                </div>

                <div className="h-full w-full overflow-hidden">
                  <div
                    className="h-full w-full overflow-hidden"
                    data-testid="demo-canvas-workarea"
                    style={{
                      backgroundColor: color('surface-secondary'),
                      border: `1px solid ${color('border')}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    <ScreenPreview
                      cursor={editorState.pendingPlacementType === null ? 'default' : 'crosshair'}
                      documentData={currentDocument}
                      isPlaying={isPlaying}
                      onCanvasClick={handleCanvasClick}
                      onCanvasContextMenu={handleCanvasContextMenu}
                      resetToken={resetToken}
                    />
                  </div>
                </div>
              </section>

              <aside
                className="absolute z-30"
                data-testid="demo-properties-sidebar"
                style={{
                  backgroundColor: color('surface'),
                  border: `1px solid ${color('border')}`,
                  borderRadius: '1rem',
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

              {activeDialog === 'new-document' ?
                <DialogPanel
                  title="New Document"
                  onClose={() => {
                    setActiveDialog(null);
                  }}
                >
                  <p style={{ color: color('muted'), fontSize: font('body-compact') }}>
                    Start from a clean canvas or reload the sample broadcast layout.
                  </p>
                  <div style={{ display: 'flex', gap: sp('sp-02'), justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setActiveDialog(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        handleCreateNewDocument('sample');
                      }}
                    >
                      Load Sample
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => {
                        handleCreateNewDocument('empty');
                      }}
                    >
                      Blank Document
                    </Button>
                  </div>
                </DialogPanel>
              : null}

              {activeDialog === 'settings' ?
                <DialogPanel
                  title="Document Settings"
                  onClose={() => {
                    setActiveDialog(null);
                  }}
                >
                  <Input
                    aria-label="Document name"
                    value={currentDocument.name}
                    onChange={(event) => {
                      editorStore.getState().loadTemplate({ ...currentDocument, name: event.currentTarget.value });
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
                    <span style={{ color: color('muted'), fontSize: font('label') }}>Units</span>
                    <div style={{ display: 'flex', gap: sp('sp-02') }}>
                      {(['px', 'mm', 'in'] as const).map((unit) => (
                        <Button
                          key={unit}
                          size="sm"
                          variant={editorState.canvasSettings.units === unit ? 'primary' : 'ghost'}
                          onPress={() => {
                            editorStore.getState().updateCanvasSettings({ units: unit });
                          }}
                        >
                          {unit}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
                    <span style={{ color: color('muted'), fontSize: font('label') }}>View mode</span>
                    <div style={{ display: 'flex', gap: sp('sp-02') }}>
                      {(['none', 'broadcast', 'print'] as const).map((mode) => (
                        <Button
                          key={mode}
                          size="sm"
                          variant={editorState.canvasSettings.viewMode === mode ? 'primary' : 'ghost'}
                          onPress={() => {
                            editorStore.getState().updateCanvasSettings({ viewMode: mode });
                          }}
                        >
                          {mode}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: sp('sp-02'), justifyContent: 'space-between' }}>
                    <Button
                      size="sm"
                      variant={editorState.canvasSettings.showRulers ? 'primary' : 'ghost'}
                      onPress={() => {
                        editorStore
                          .getState()
                          .updateCanvasSettings({ showRulers: !editorState.canvasSettings.showRulers });
                      }}
                    >
                      {editorState.canvasSettings.showRulers ? 'Hide rulers' : 'Show rulers'}
                    </Button>
                    <Button
                      size="sm"
                      variant={editorState.gridSettings.showGrid ? 'primary' : 'ghost'}
                      onPress={() => {
                        editorStore.getState().updateGridSettings({ showGrid: !editorState.gridSettings.showGrid });
                      }}
                    >
                      {editorState.gridSettings.showGrid ? 'Hide grid' : 'Show grid'}
                    </Button>
                  </div>
                  <div style={{ display: 'flex', gap: sp('sp-02'), justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setActiveDialog(null);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </DialogPanel>
              : null}

              {activeDialog === 'export' ?
                <DialogPanel
                  title="Export"
                  onClose={() => {
                    setActiveDialog(null);
                  }}
                >
                  <p style={{ color: color('muted'), fontSize: font('body-compact') }}>
                    Export the current Phase 4 demo document as JSON for inspection or reuse.
                  </p>
                  <div style={{ display: 'flex', gap: sp('sp-02'), justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setActiveDialog(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => {
                        handleSaveAsJson();
                        setActiveDialog(null);
                      }}
                    >
                      Download JSON
                    </Button>
                  </div>
                </DialogPanel>
              : null}

              {activeDialog === 'shortcuts' ?
                <DialogPanel
                  title="Keyboard Shortcuts"
                  onClose={() => {
                    setActiveDialog(null);
                  }}
                >
                  <ul
                    style={{
                      color: color('foreground'),
                      display: 'grid',
                      gap: sp('sp-02'),
                      fontSize: font('body-compact'),
                    }}
                  >
                    <li>⌘/Ctrl + S — Save</li>
                    <li>⌘/Ctrl + Z — Undo</li>
                    <li>⌘/Ctrl + Shift + Z — Redo</li>
                    <li>Delete / Backspace — Remove selection</li>
                    <li>Escape — Exit placement mode</li>
                  </ul>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setActiveDialog(null);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </DialogPanel>
              : null}

              {activeDialog === 'about' ?
                <DialogPanel
                  title="About Broadset Demo"
                  onClose={() => {
                    setActiveDialog(null);
                  }}
                >
                  <p style={{ color: color('foreground'), fontSize: font('body-compact') }}>
                    Broadset Phase 4 showcases the editor shell with floating toolbars, ruler-guided canvas work, a
                    resizable sidebar, and live preview controls.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        setActiveDialog(null);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                </DialogPanel>
              : null}

              <div className="pointer-events-none absolute bottom-7 right-7 z-40 flex flex-col gap-2">
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
