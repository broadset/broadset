import {
  addGroupMember,
  cancelPlacement,
  type ChangeStream,
  createChangeStream,
  createDataStore,
  createEditorStore,
  createTemplateGroup,
  diffDocuments,
  EditorErrorBoundary,
  EditorProvider,
  type EditorStore,
  type ElementUpdate,
  placeElement,
  removeGroupMember,
  removeTemplateGroup,
  renameTemplateGroup,
  runPreflightDiagnostics,
  startClipPathEditing,
  startMotionPathEditing,
  startPlacement,
  updateMemberRole,
} from '@broadset/editor';
import {
  type BooleanOperation,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetProject,
  broadsetProjectSchema,
  createEmptyBroadsetDocument,
  type EasingMode,
  type TemplateGroup,
  type TemplateGroupRole,
  type Timeline,
} from '@broadset/model';
import {
  AboutModal,
  AnimationSidebar,
  CanvasSettingsModal,
  color,
  DEFAULT_ELEMENT_TYPES,
  type DocumentPreset,
  ExportModal,
  font,
  glassPanelStyle,
  LayersSidebar,
  type MediaAsset,
  MediaLibraryModal,
  NewDocumentModal,
  type PreflightIssue,
  PreflightPanel,
  PropertiesSidebar,
  type PropertyValue,
  ShortcutHelpModal,
  sp,
  TemplateBrowserModal,
  type TemplateEntry,
  TemplateGroupPanel,
  TimelineBottomPanel,
  TimelineEditingProvider,
  TimelineEditor,
} from '@broadset/ui';
import { Button, ButtonGroup, Card, CardContent, Chip, Dropdown, Toast, toast, Toolbar, Tooltip } from '@heroui/react';
import {
  Bug,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  FileOutput,
  FilePlus,
  FolderOpen,
  Grid3X3,
  Hash,
  History,
  Image,
  Info,
  Keyboard,
  Layers,
  LayoutTemplate,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
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

import { IconToolButton, RulerStrip, ScreenPreview, ToolbarMenu } from './demo-components';
import {
  type ActiveDialog,
  CONTEXT_MENU_HEIGHT,
  CONTEXT_MENU_WIDTH,
  type ContextMenuState,
  DOCUMENT_STORAGE_KEY,
  FLOATING_OFFSET,
  RULER_SIZE,
  SIDEBAR_EDGE_INSET,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_TOP_OFFSET,
  type SidebarTab,
  TOAST_DISMISS_MS,
  type ToastSeverity,
  ZOOM_STEP,
} from './demo-types';
import {
  clampCanvasZoom,
  clampSidebarWidth,
  downloadJsonFile,
  formatResolutionLabel,
  isEditableTarget,
  loadSavedDocument,
  loadSidebarPreferences,
  toLayerInfo,
  toPanelElement,
} from './demo-utils';
import { COUNTDOWN_PLUGIN, DEMO_DOCUMENT_PRESETS, DEMO_EDITOR_CONFIG } from './demoConfig';
import type { ExportFormat } from './formatBridge';
import { SAMPLE_PROJECT } from './sampleDocument';
import { useLiveData } from './useLiveData';

const ELEMENT_TOOL_TYPES = [
  ...DEFAULT_ELEMENT_TYPES,
  { type: 'countdown', label: 'Countdown', icon: <span aria-hidden="true">⏱</span> },
] as const;

/** Exporters enabled in the demo. */
const ENABLED_EXPORTERS: readonly string[] = [
  'html',
  'svg',
  'pdf',
  'psd',
  'pptx',
  'png',
  'jpeg',
  'svg-embedded',
  'ograf',
  'mp4',
  'webm',
] as const;

/** Sample media assets for the Media Library demo. */
const DEMO_MEDIA_ASSETS: readonly MediaAsset[] = [
  { id: 'placeholder-1', name: 'Placeholder 800×600', url: 'https://placehold.co/800x600', category: 'Backgrounds' },
  {
    id: 'placeholder-2',
    name: 'Placeholder 1920×1080',
    url: 'https://placehold.co/1920x1080',
    category: 'Backgrounds',
  },
  { id: 'placeholder-3', name: 'Logo Placeholder', url: 'https://placehold.co/200x200', category: 'Logos' },
  { id: 'placeholder-4', name: 'Icon Placeholder', url: 'https://placehold.co/100x100', category: 'Icons' },
] as const;

const MEDIA_CATEGORIES: readonly string[] = ['All', 'Backgrounds', 'Logos', 'Icons'] as const;

/** Sample templates for the Template Browser demo. */
const DEMO_TEMPLATES: readonly TemplateEntry[] = [
  {
    id: 'tpl-score',
    name: 'Sports Score',
    thumbnail: 'https://placehold.co/320x180?text=Score',
    category: 'Lower Thirds',
  },
  {
    id: 'tpl-news',
    name: 'News Ticker',
    thumbnail: 'https://placehold.co/320x180?text=News',
    category: 'Lower Thirds',
  },
  {
    id: 'tpl-fullscreen',
    name: 'Full Screen Graphic',
    thumbnail: 'https://placehold.co/320x180?text=Full',
    category: 'Full Screen',
  },
  {
    id: 'tpl-weather',
    name: 'Weather Overlay',
    thumbnail: 'https://placehold.co/320x180?text=Weather',
    category: 'Full Screen',
  },
] as const;

type AlignmentAction = 'bottom' | 'center-x' | 'center-y' | 'left' | 'right' | 'top';

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

function getElementLabel(type: string | null): string {
  if (type === null) {
    return 'Element';
  }

  return ELEMENT_TOOL_TYPES.find((entry) => entry.type === type)?.label ?? type;
}

export function DemoApp(): React.JSX.Element {
  const storeRef = useRef<EditorStore | null>(null);
  const dataStoreRef = useRef<ReturnType<typeof createDataStore> | null>(null);
  const changeStreamRef = useRef<ChangeStream | null>(null);

  if (storeRef.current === null) {
    const store = createEditorStore({ config: DEMO_EDITOR_CONFIG });
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

  if (changeStreamRef.current === null) {
    changeStreamRef.current = createChangeStream();
  }

  const editorStore = storeRef.current;
  const dataStore = dataStoreRef.current;
  const changeStream = changeStreamRef.current;

  useLiveData(dataStore);

  // Subscribe the editor store to the change stream — diff documents and emit changes on each state update
  useEffect(() => {
    let prevDoc = editorStore.getState().document;

    const unsubscribeStore = editorStore.subscribe((state) => {
      const nextDoc = state.document;

      if (nextDoc !== prevDoc) {
        const changes = diffDocuments(prevDoc, nextDoc);

        changeStream.emit(changes);
        prevDoc = nextDoc;
      }
    });

    // Subscribe a console logger to the change stream with a cumulative batch count
    let batchCount = 0;

    const unsubscribeStream = changeStream.subscribe((changes) => {
      batchCount += 1;
      console.info(`Change batch #${String(batchCount)}:`, changes.length, 'changes', changes);
    });

    return () => {
      unsubscribeStore();
      unsubscribeStream();
    };
  }, [editorStore, changeStream]);

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
  const preflightIssues = useMemo<readonly PreflightIssue[]>(() => {
    const diagnostics = runPreflightDiagnostics(currentDocument, {});

    return diagnostics.map((d) => ({
      id: `${d.rule}:${d.elementName}`,
      severity: d.severity,
      message: d.message,
      elementName: d.elementName,
      ruleId: d.rule,
    }));
  }, [currentDocument]);

  const animationConfig = useMemo(() => {
    if (selectedElementId === null) return null;

    const def = currentDocument.animations.find((a) => a.elementId === selectedElementId);

    return def?.config ?? null;
  }, [currentDocument, selectedElementId]);

  const placementLabel = getElementLabel(editorState.pendingPlacementType);
  const clipboardRef = useRef<readonly BroadsetElement[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && document.fullscreenElement !== null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [editingTimeline, setEditingTimeline] = useState<Timeline | null>(null);
  const [editingTimelineSelectedKf, setEditingTimelineSelectedKf] = useState<number | null>(null);
  const [templateGroups, setTemplateGroups] = useState<TemplateGroup[]>(() => {
    const parsed = broadsetProjectSchema.safeParse(SAMPLE_PROJECT);

    return parsed.success ? (parsed.data.templateGroups ?? []) : [];
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarPreferences.isOpen);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(initialSidebarPreferences.tab);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarPreferences.width);
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
    const rulerLength = Math.max(viewportSize.width - RULER_SIZE, 320);

    return Array.from({ length: 10 }, (_, index) => {
      const value = Math.round((currentDocument.canvas.width / 10) * index);

      return {
        label: String(value),
        position: (rulerLength / 10) * index * editorState.canvasSettings.zoom + editorState.canvasSettings.panX,
      };
    }).filter((tick) => tick.position >= -40 && tick.position <= rulerLength + 40);
  }, [
    currentDocument.canvas.width,
    editorState.canvasSettings.panX,
    editorState.canvasSettings.zoom,
    viewportSize.width,
  ]);
  const verticalTicks = useMemo(() => {
    const rulerLength = Math.max(viewportSize.height - RULER_SIZE, 240);

    return Array.from({ length: 8 }, (_, index) => {
      const value = Math.round((currentDocument.canvas.height / 8) * index);

      return {
        label: String(value),
        position: (rulerLength / 8) * index * editorState.canvasSettings.zoom + editorState.canvasSettings.panY,
      };
    }).filter((tick) => tick.position >= -40 && tick.position <= rulerLength + 40);
  }, [
    currentDocument.canvas.height,
    editorState.canvasSettings.panY,
    editorState.canvasSettings.zoom,
    viewportSize.height,
  ]);

  const pushToast = useCallback((severity: ToastSeverity, message: string): void => {
    const options = { timeout: TOAST_DISMISS_MS[severity] };

    if (severity === 'error') {
      toast.danger(message, options);

      return;
    }

    if (severity === 'success') {
      toast.success(message, options);

      return;
    }

    toast.info(message, options);
  }, []);

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
        const { importDocument } = await import('./formatBridge');
        const nextDocument = await importDocument(file);

        editorStore.getState().loadTemplate(nextDocument);
        pushToast('success', 'Import complete.');
      } catch (error: unknown) {
        pushToast('error', `Import failed: ${error instanceof Error ? error.message : String(error)}`);
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

  const handleSaveSnapshot = useCallback((): void => {
    const name = window.prompt('Snapshot name:');

    if (name === null || name.trim() === '') {
      return;
    }

    try {
      editorStore.getState().saveSnapshot(name.trim());
      pushToast('success', `Saved snapshot "${name.trim()}".`);
    } catch (error: unknown) {
      pushToast('error', error instanceof Error ? error.message : 'Could not save snapshot.');
    }
  }, [editorStore, pushToast]);

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string): void => {
      editorStore.getState().restoreSnapshot(snapshotId);
      pushToast('success', 'Restored snapshot.');
    },
    [editorStore, pushToast],
  );

  const handleDeleteSnapshot = useCallback(
    (snapshotId: string): void => {
      editorStore.getState().deleteSnapshot(snapshotId);
      pushToast('success', 'Deleted snapshot.');
    },
    [editorStore, pushToast],
  );

  const handleCreateFromPreset = useCallback(
    (preset: DocumentPreset): void => {
      const doc = createEmptyBroadsetDocument();
      const viewMode = preset.mode === 'broadcast' || preset.mode === 'print' ? preset.mode : 'none';
      const updated: BroadsetDocument = {
        ...doc,
        name: preset.name,
        canvas: { ...doc.canvas, width: preset.width, height: preset.height, unit: preset.unit as 'in' | 'mm' | 'px' },
      };

      editorStore.getState().loadTemplate(updated);
      editorStore.getState().updateCanvasSettings({ viewMode });
      setActiveDialog(null);
      pushToast(
        'success',
        `Created "${preset.name}" (${String(preset.width)}×${String(preset.height)} ${preset.unit}).`,
      );
    },
    [editorStore, pushToast],
  );

  const handleExportFormat = useCallback(
    (exporter: string, _data: Readonly<Record<string, unknown>>): void => {
      if (exporter === 'json') {
        handleSaveAsJson();
        setActiveDialog(null);

        return;
      }

      const doExport = async (): Promise<void> => {
        const bridge = await import('./formatBridge');
        const formats = await bridge.loadFormats();
        const snapshotCanvas = formats.discoverCanvasElement() ?? undefined;

        await bridge.exportDocument(exporter as ExportFormat, {
          document: currentDocument,
          ...(snapshotCanvas !== undefined ? { snapshotCanvas } : {}),
        });
        pushToast('success', `Exported as ${exporter.toUpperCase()}.`);
      };

      void doExport().catch((error: unknown) => {
        pushToast('error', `Export failed: ${error instanceof Error ? error.message : String(error)}`);
      });

      setActiveDialog(null);
    },
    [currentDocument, handleSaveAsJson, pushToast],
  );

  const handleMediaSelect = useCallback(
    (asset: MediaAsset): void => {
      pushToast('success', `Selected media: ${asset.name}`);
      setActiveDialog(null);
    },
    [pushToast],
  );

  const handleTemplateSelect = useCallback(
    (template: TemplateEntry): void => {
      // In a full implementation, this would load the template's BroadsetDocument.
      // For now, create a placeholder document named after the template.
      const doc = createEmptyBroadsetDocument();

      editorStore.getState().loadTemplate({ ...doc, name: template.name });
      setActiveDialog(null);
      pushToast('success', `Loaded template "${template.name}".`);
    },
    [editorStore, pushToast],
  );

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
      toast.clear();
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
      const hitElementId =
        typeof target?.dataset['elementId'] === 'string' && target.dataset['elementId'] !== '' ?
          target.dataset['elementId']
        : null;
      const state = editorStore.getState();
      const contextElementId = hitElementId ?? state.activeElementIds[0] ?? null;

      if (contextElementId !== null) {
        const hasMultipleSelection = state.activeElementIds.length > 1;
        const isElementAlreadySelected = state.activeElementIds.includes(contextElementId);

        // Preserve multi-selection when opening context menu on any already-selected element.
        if (!(hasMultipleSelection && isElementAlreadySelected)) {
          state.selectElement(contextElementId);
        }
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const minX = bounds.left + RULER_SIZE;
      const maxX = bounds.right - CONTEXT_MENU_WIDTH + RULER_SIZE;
      const minY = bounds.top + RULER_SIZE;
      const maxY = bounds.bottom - CONTEXT_MENU_HEIGHT + RULER_SIZE;

      setContextMenu({
        elementId: contextElementId,
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
    (key: string, value: PropertyValue): void => {
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

      if (key === 'name') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          name: String(value),
        });

        return;
      }

      if (key === 'booleanOperation') {
        const validOps = new Set<string>(['union', 'subtract', 'intersect', 'exclude']);
        const stringValue = String(value);

        editorStore.getState().commitElementUpdate(selectedElement.id, {
          booleanOperation:
            stringValue === '' || stringValue === 'none' ? null
            : validOps.has(stringValue) ? (stringValue as BooleanOperation)
            : null,
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

  /* Template group management handlers */
  const projectForTemplateOps = useMemo<BroadsetProject>(
    () => ({
      schemaVersion: 1 as const,
      id: 'demo-project',
      name: 'Demo Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { fonts: [], palette: [], defaultDocumentMode: 'screen' as const },
      assets: [],
      documents: [currentDocument],
      templateGroups: templateGroups,
    }),
    [currentDocument, templateGroups],
  );

  const availableDocuments = useMemo(
    () => [{ id: currentDocument.id, name: currentDocument.name }],
    [currentDocument.id, currentDocument.name],
  );

  const handleCreateGroup = useCallback(
    (name: string) => {
      const groupId = `tg-${crypto.randomUUID().slice(0, 8)}`;
      const firstMember = { documentId: currentDocument.id, role: '16:9' as TemplateGroupRole };
      const updated = createTemplateGroup(projectForTemplateOps, groupId, name, firstMember);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [currentDocument.id, projectForTemplateOps],
  );

  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      const updated = removeTemplateGroup(projectForTemplateOps, groupId);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps],
  );

  const handleRenameGroup = useCallback(
    (groupId: string, newName: string) => {
      const updated = renameTemplateGroup(projectForTemplateOps, groupId, newName);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps],
  );

  const handleAddMember = useCallback(
    (groupId: string, documentId: string, role: TemplateGroupRole) => {
      const updated = addGroupMember(projectForTemplateOps, groupId, { documentId, role });

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps],
  );

  const handleRemoveMember = useCallback(
    (groupId: string, documentId: string) => {
      const updated = removeGroupMember(projectForTemplateOps, groupId, documentId);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps],
  );

  const handleUpdateMemberRole = useCallback(
    (groupId: string, documentId: string, role: TemplateGroupRole, label?: string) => {
      const updated = updateMemberRole(projectForTemplateOps, groupId, documentId, role, label);

      setTemplateGroups(updated.templateGroups ?? []);
    },
    [projectForTemplateOps],
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
        onSelect={(elementId, _mode) => {
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
        elements={selectedElement === null ? [] : [toPanelElement(selectedElement)]}
        onUpdate={handlePropertyUpdate}
      />
    : sidebarTab === 'animation' ?
      <AnimationSidebar
        element={selectedElement === null ? null : toPanelElement(selectedElement)}
        isLocked={selectedElement?.locked ?? false}
        animationsEnabled
        timelines={animationConfig?.timelines.map((t) => ({
          id: t.id,
          name: t.name,
          keyframes: t.keyframes,
        }))}
        stateBindings={animationConfig?.stateTimelineBindings.map((b) => ({
          stateName: b.stateName,
          timelineId: b.timelineId,
        }))}
        modifierBindings={animationConfig?.modifierTimelineBindings.map((b) => ({
          modifierName: b.modifierName,
          inTimelineId: b.inTimelineId,
          ...(b.outTimelineId !== undefined ? { outTimelineId: b.outTimelineId } : {}),
        }))}
        availableStates={['IN', 'OUT', 'LOOP']}
        availableModifiers={['hover', 'focus', 'active']}
        activeState={null}
        activeModifiers={[]}
        onSelectState={() => {
          toast.info('State selection not yet wired.');
        }}
        onToggleModifier={() => {
          toast.info('Modifier toggle not yet wired.');
        }}
        onAddTimeline={() => {
          toast.info('Add timeline not yet wired.');
        }}
        onEditTimeline={(id: string) => {
          const tl = animationConfig?.timelines.find((t) => t.id === id);

          if (tl) {
            setEditingTimeline(tl);
            setEditingTimelineSelectedKf(null);
          }
        }}
        onDeleteTimeline={() => {
          toast.info('Delete timeline not yet wired.');
        }}
        onDuplicateTimeline={() => {
          toast.info('Duplicate timeline not yet wired.');
        }}
        onRenameTimeline={() => {
          toast.info('Rename timeline not yet wired.');
        }}
        onQuickSetup={() => {
          toast.info('Quick setup not yet wired.');
        }}
        onAddStateBinding={() => {
          toast.info('Add state binding not yet wired.');
        }}
        onRemoveStateBinding={() => {
          toast.info('Remove state binding not yet wired.');
        }}
        onAddModifierBinding={() => {
          toast.info('Add modifier binding not yet wired.');
        }}
        onRemoveModifierBinding={() => {
          toast.info('Remove modifier binding not yet wired.');
        }}
      />
    : sidebarTab === 'template-groups' ?
      <TemplateGroupPanel
        groups={templateGroups}
        availableDocuments={availableDocuments}
        onCreateGroup={handleCreateGroup}
        onRemoveGroup={handleRemoveGroup}
        onRenameGroup={handleRenameGroup}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
        onUpdateMemberRole={handleUpdateMemberRole}
      />
    : <div className="p-3" style={glassPanelStyle()}>
        <PreflightPanel issues={preflightIssues} />
      </div>;

  return (
    <EditorProvider components={[{ ...COUNTDOWN_PLUGIN }]} dataStore={dataStore} store={editorStore}>
      <TimelineEditingProvider>
        <main
          className="fixed inset-0 overflow-hidden"
          data-testid="demo-shell"
          style={{ backgroundColor: color('surface'), color: color('foreground') }}
        >
          <input
            ref={fileInputRef}
            accept=".json,.bsp,.psd,.pptx,.svg,application/json,image/vnd.adobe.photoshop,image/svg+xml"
            hidden
            type="file"
            onChange={(event) => {
              void handleImportFileChange(event);
            }}
          />
          {editorState.canvasSettings.showRulers ?
            <>
              <div
                className="absolute left-0 top-0 z-30"
                data-testid="ruler-corner"
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
                data-testid="ruler-horizontal-strip"
                style={{ height: `${String(RULER_SIZE)}px`, left: `${String(RULER_SIZE)}px` }}
              >
                <RulerStrip orientation="horizontal" ticks={horizontalTicks} />
              </div>

              <div
                className="absolute bottom-0 left-0 z-20"
                data-testid="ruler-vertical-strip"
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
                      <ToolbarMenu icon={<FolderOpen size={16} />} label="File">
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
                        <Dropdown.Item
                          key="browse-templates"
                          onAction={() => {
                            setActiveDialog('template-browser');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <LayoutTemplate size={14} />
                            Browse Templates
                          </span>
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="media-library"
                          onAction={() => {
                            setActiveDialog('media-library');
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Image size={14} />
                            Media Library
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
                        <Dropdown.Item key="save-snapshot" onAction={handleSaveSnapshot}>
                          <span className="inline-flex items-center gap-2">
                            <Camera size={14} />
                            Save Snapshot
                            {editorState.snapshots.length > 0 ?
                              <Chip size="sm" variant="soft">
                                {editorState.snapshots.length}
                              </Chip>
                            : null}
                          </span>
                        </Dropdown.Item>
                        {editorState.snapshots.map((snapshot) => (
                          <Dropdown.Item
                            key={`restore-${snapshot.id}`}
                            onAction={() => {
                              handleRestoreSnapshot(snapshot.id);
                            }}
                          >
                            <span className="inline-flex items-center gap-2">
                              <History size={14} />
                              <span className="truncate max-w-48">{snapshot.name}</span>
                              <Tooltip delay={0}>
                                <Tooltip.Trigger>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="ml-auto opacity-50 hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSnapshot(snapshot.id);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.stopPropagation();
                                        handleDeleteSnapshot(snapshot.id);
                                      }
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </span>
                                </Tooltip.Trigger>
                                <Tooltip.Content>Delete snapshot</Tooltip.Content>
                              </Tooltip>
                            </span>
                          </Dropdown.Item>
                        ))}
                        <Dropdown.Item key="debug-snapshot" onAction={handleDebugSnapshotDownload}>
                          <span className="inline-flex items-center gap-2">
                            <Bug size={14} />
                            Debug Snapshot
                          </span>
                        </Dropdown.Item>
                      </ToolbarMenu>

                      <ToolbarMenu icon={<Grid3X3 size={16} />} label="View">
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

                      <ToolbarMenu icon={<Layers size={16} />} label="Scenes">
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

                      <ToolbarMenu icon={<Info size={16} />} label="Help">
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
                        label="Zoom out"
                        onPress={() => {
                          handleZoomStep(-ZOOM_STEP);
                        }}
                      >
                        <Minus size={16} />
                      </IconToolButton>
                      <IconToolButton label="Zoom to fit" onPress={handleZoomToFit}>
                        <Maximize2 size={16} />
                      </IconToolButton>
                      <IconToolButton
                        label="Zoom in"
                        onPress={() => {
                          handleZoomStep(ZOOM_STEP);
                        }}
                      >
                        <Plus size={16} />
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
                            tooltipPlacement="right"
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
                        <Tooltip delay={0}>
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
                          <Tooltip.Content placement="left">Close sidebar</Tooltip.Content>
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
                      tooltipPlacement="left"
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
                      tooltipPlacement="left"
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
                      tooltipPlacement="left"
                      onPress={() => {
                        handleSidebarTabToggle('animation');
                      }}
                    >
                      <Workflow size={16} />
                    </IconToolButton>
                    <IconToolButton
                      label="Pre-flight"
                      isActive={isSidebarOpen && sidebarTab === 'preflight'}
                      tooltipPlacement="left"
                      onPress={() => {
                        handleSidebarTabToggle('preflight');
                      }}
                    >
                      <ShieldCheck size={16} />
                    </IconToolButton>
                    <IconToolButton
                      label="Template Groups"
                      isActive={isSidebarOpen && sidebarTab === 'template-groups'}
                      tooltipPlacement="left"
                      onPress={() => {
                        handleSidebarTabToggle('template-groups');
                      }}
                    >
                      <LayoutTemplate size={16} />
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
                      panX={editorState.canvasSettings.panX}
                      panY={editorState.canvasSettings.panY}
                      selectedElement={selectedElement}
                      zoom={editorState.canvasSettings.zoom}
                      onCanvasClick={handleCanvasClick}
                      onCanvasContextMenu={handleCanvasContextMenu}
                      onElementTransformCommit={handleElementTransformCommit}
                      onElementTransformPreview={handleElementTransformPreview}
                      onViewportChange={handleCanvasViewportChange}
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
                  borderBottomLeftRadius: '1rem',
                  borderBottomRightRadius: 0,
                  borderRight: 'none',
                  borderTopLeftRadius: '1rem',
                  borderTopRightRadius: 0,
                  bottom: `${String(SIDEBAR_EDGE_INSET)}px`,
                  boxShadow: 'var(--overlay-shadow, 0 14px 40px rgba(15, 23, 42, 0.22))',
                  overflow: 'hidden',
                  pointerEvents: isSidebarOpen ? 'auto' : 'none',
                  right: '0px',
                  top: `${String(SIDEBAR_TOP_OFFSET)}px`,
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

                <div className="h-full overflow-auto" style={{ padding: `${sp('sp-02')} ${sp('sp-03')}` }}>
                  {sidebarPanel}
                </div>
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
                              startClipPathEditing(editorStore, contextMenuElement.id);
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
                            key="edit-motion-path"
                            onAction={() => {
                              startMotionPathEditing(editorStore, contextMenuElement.id);
                              setContextMenu(null);
                            }}
                          >
                            Edit motion path
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

              <NewDocumentModal
                isOpen={activeDialog === 'new-document'}
                presets={DEMO_DOCUMENT_PRESETS}
                onCreateDocument={handleCreateFromPreset}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <CanvasSettingsModal
                isOpen={activeDialog === 'settings'}
                documentName={currentDocument.name}
                showRulers={editorState.canvasSettings.showRulers}
                rulerUnit={editorState.canvasSettings.units}
                viewMode={editorState.canvasSettings.viewMode}
                perspective={editorState.canvasSettings.perspective}
                showGrid={editorState.gridSettings.showGrid}
                gridSize={editorState.gridSettings.gridSize}
                snapToGrid={editorState.gridSettings.snapToGrid}
                snapThreshold={editorState.gridSettings.snapThreshold}
                onDocumentNameChange={(name) => {
                  editorStore.getState().loadTemplate({ ...currentDocument, name });
                }}
                onRulerChange={(show) => {
                  editorStore.getState().updateCanvasSettings({ showRulers: show });
                }}
                onRulerUnitChange={(unit) => {
                  editorStore.getState().updateCanvasSettings({ units: unit as 'in' | 'mm' | 'px' });
                }}
                onViewModeChange={(mode) => {
                  editorStore.getState().updateCanvasSettings({ viewMode: mode as 'broadcast' | 'none' | 'print' });
                }}
                onPerspectiveChange={(value) => {
                  editorStore.getState().updateCanvasSettings({ perspective: value });
                }}
                onGridChange={(changes) => {
                  editorStore.getState().updateGridSettings(changes);
                }}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <ExportModal
                isOpen={activeDialog === 'export'}
                enabledExporters={ENABLED_EXPORTERS}
                dynamicData={{}}
                onExport={handleExportFormat}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <ShortcutHelpModal
                isOpen={activeDialog === 'shortcuts'}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <AboutModal
                isOpen={activeDialog === 'about'}
                version="0.1.0"
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <MediaLibraryModal
                isOpen={activeDialog === 'media-library'}
                assets={DEMO_MEDIA_ASSETS}
                categories={MEDIA_CATEGORIES}
                onSelect={handleMediaSelect}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <TemplateBrowserModal
                isOpen={activeDialog === 'template-browser'}
                templates={DEMO_TEMPLATES}
                hasUnsavedChanges={false}
                onSelectTemplate={handleTemplateSelect}
                onClose={() => {
                  setActiveDialog(null);
                }}
              />

              <Toast.Provider className="bottom-7 right-7 z-40" placement="bottom end" />
            </div>
          </EditorErrorBoundary>
        </main>

        <TimelineBottomPanel
          isOpen={editingTimeline !== null}
          onClose={() => {
            setEditingTimeline(null);
            setEditingTimelineSelectedKf(null);
          }}
        >
          {editingTimeline !== null && (
            <TimelineEditor
              timeline={editingTimeline}
              selectedKeyframeIndex={editingTimelineSelectedKf}
              onSelectKeyframe={setEditingTimelineSelectedKf}
              onAddKeyframe={() => {
                toast.info('Add keyframe not yet wired.');
              }}
              onMoveKeyframe={(_index: number, _offsetMs: number) => {
                toast.info('Move keyframe not yet wired.');
              }}
              onChangeEasing={(_index: number, _easing: EasingMode) => {
                toast.info('Change easing not yet wired.');
              }}
              onPlayTimeline={() => {
                toast.info('Play timeline not yet wired.');
              }}
              onStopTimeline={() => {
                toast.info('Stop timeline not yet wired.');
              }}
              onSeekTimeline={(_timeMs: number) => {
                toast.info('Seek timeline not yet wired.');
              }}
              currentTimeMs={0}
              isPlaying={false}
            />
          )}
        </TimelineBottomPanel>
      </TimelineEditingProvider>
    </EditorProvider>
  );
}
