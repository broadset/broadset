import type { EditingMode, EditorStore } from '@broadset/editor';
import {
  appendPathPoint,
  BroadsetDataStoreProvider,
  cancelPlacement,
  createEditorStore,
  EditorErrorBoundary,
  handleShortcutAction,
  matchShortcut,
  resolveShortcuts,
  startPathDrawing,
  startPathEditing,
  stopPathDrawing,
  stopPathEditing,
  upsertTimeline,
} from '@broadset/editor';
import type { BroadsetElement, BroadsetElementStyle, ElementAnimationConfig, Guide, Keyframe } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { DocumentRenderer } from '@broadset/renderer';
import {
  AboutModal,
  AnimationSidebar,
  CanvasSettingsModal,
  ExportModal,
  LayersSidebar,
  MediaLibraryModal,
  NewDocumentModal,
  PageSorter,
  PropertiesSidebar,
  ShortcutHelpModal,
  TimelineBottomPanel,
} from '@broadset/ui';
import { Button, Tabs, Tooltip } from '@heroui/react';
import {
  Bug,
  Download,
  FilePlus,
  Grid3x3,
  Image,
  Info,
  Keyboard,
  Maximize,
  Minimize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Scan,
  Settings,
  Timer,
  Undo2,
  Upload,
} from 'lucide-react';
import type { JSX, MouseEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createDemoController } from './animationSetup';
import { CanvasOverlays } from './CanvasOverlays';
import { elementsToLayers, elementToPanelElement, sampleToEditorDocument, toRendererDoc } from './converters';
import { createDemoConfig, DEMO_MEDIA_SOURCE, loadSavedDocument } from './demoConfig';
import type { Toast } from './demoState';
import {
  createToastController,
  lockViewportOverflow,
  preventBrowserZoom,
  readSidebarPreferences,
  saveSidebarPreferences,
} from './demoState';
import { PathToolsPanel } from './PathToolsPanel';
import { Rulers } from './Rulers';
import {
  ELEMENT_FALLBACK_ICON,
  ELEMENT_ICON_MAP,
  ELEMENT_TYPES,
  SIDEBAR_ICON_MAP,
  ToolbarButton,
} from './toolbar-helpers';
import { TransformWidget } from './TransformWidget';
import { useMockLiveData } from './useMockLiveData';

// ---------------------------------------------------------------------------
// Modal name type
// ---------------------------------------------------------------------------

type ModalName = 'about' | 'canvasSettings' | 'export' | 'mediaLibrary' | 'newDocument' | 'shortcutHelp';

// ---------------------------------------------------------------------------
// Absolute position helper
// ---------------------------------------------------------------------------

/** Walk the parentId chain to compute canvas-space absolute position. */
function computeAbsolutePosition(
  element: BroadsetElement,
  allElements: readonly BroadsetElement[],
): { readonly x: number; readonly y: number } {
  let x = element.position.x;
  let y = element.position.y;
  let current = element;

  while (current.parentId !== null) {
    const parent = allElements.find((el) => el.id === current.parentId);

    if (parent === undefined) break;

    x += parent.position.x;
    y += parent.position.y;
    current = parent;
  }

  return { x, y };
}

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App(): JSX.Element {
  // --- Editor store (created once, with full demo config) ---
  const storeRef = useRef<EditorStore | null>(null);
  const configRef = useRef<ReturnType<typeof createDemoConfig> | null>(null);

  if (storeRef.current === null) {
    const config = createDemoConfig();

    configRef.current = config;
    storeRef.current = createEditorStore({ config });

    // Load saved document from localStorage, or fall back to sample
    const saved = loadSavedDocument();

    if (saved !== null) {
      try {
        storeRef.current.getState().loadTemplate(saved as ReturnType<typeof sampleToEditorDocument>);
      } catch {
        storeRef.current.getState().loadTemplate(sampleToEditorDocument());
      }
    } else {
      storeRef.current.getState().loadTemplate(sampleToEditorDocument());
    }
  }

  const store = storeRef.current;

  // --- Live data store (scores, clock, ticker) ---
  const dataStore = useMockLiveData();

  // --- Subscribe to store state ---
  const editorDoc = useSyncExternalStore(store.subscribe, () => store.getState().document);

  const activePageIndex = useSyncExternalStore(store.subscribe, () => store.getState().activePageIndex);

  const activeElementIds = useSyncExternalStore(store.subscribe, () => store.getState().activeElementIds);

  const documentMode = useSyncExternalStore(store.subscribe, () => store.getState().documentMode);

  const canvasSettings = useSyncExternalStore(store.subscribe, () => store.getState().canvasSettings);

  const gridSettings = useSyncExternalStore(store.subscribe, () => store.getState().gridSettings);

  const featureConfig = useSyncExternalStore(store.subscribe, () => store.getState().featureConfig);

  const animationRegistry = useSyncExternalStore(store.subscribe, () => store.getState().document.animationRegistry);

  const editingMode: EditingMode = useSyncExternalStore(store.subscribe, () => store.getState().editingMode);

  // --- Refs ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DocumentRenderer | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalName | null>(null);
  const [documentName, setDocumentName] = useState('Untitled Document');
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(null);

  // --- Sidebar drawer state (restored from localStorage) ---

  type SidebarTab = 'layers' | 'properties' | 'animation' | 'preflight';

  const initialPrefs = useRef(readSidebarPreferences());
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(
    initialPrefs.current.open ? (initialPrefs.current.tab as SidebarTab) : null,
  );
  const [sidebarWidth, setSidebarWidth] = useState(initialPrefs.current.width);
  const sidebarResizing = useRef(false);
  const SIDEBAR_MIN = 256;
  const SIDEBAR_MAX = 800;
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Toast controller (created once) ---
  const toastRef = useRef(createToastController());
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  useEffect(() => {
    const tc = toastRef.current;

    return tc.subscribe((t) => {
      setToasts(t);
    });
  }, []);

  // --- Lock viewport overflow (runs once) ---
  useEffect(() => lockViewportOverflow(), []);

  // --- Prevent browser zoom gestures ---
  useEffect(() => preventBrowserZoom(), []);

  // --- Fullscreen change listener ---
  useEffect(() => {
    const handler = (): void => {
      setIsFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handler);

    return (): void => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, []);

  // --- Mount renderer and playback (re-runs on document/page change) ---
  useEffect(() => {
    const host = canvasRef.current;

    if (host === null) {
      return;
    }

    const rendererDoc = toRendererDoc(editorDoc);
    const renderer = new DocumentRenderer();

    renderer.mount(rendererDoc, host);

    if (activePageIndex > 0) {
      renderer.setPage(activePageIndex);
    }

    rendererRef.current = renderer;

    const controller = createDemoController(rendererDoc, host);

    controllerRef.current = controller;
    setIsPlaying(false);

    return (): void => {
      controller.destroy();
      controllerRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [editorDoc, activePageIndex]);

  // --- Push data store values into rendered DOM elements ---
  useEffect(() => {
    const host = canvasRef.current;

    if (host === null) return;

    const unsubscribe = dataStore.subscribe((state) => {
      for (const [elementId, data] of Object.entries(state.elements)) {
        const textValue = data['text'];

        if (typeof textValue !== 'string') continue;

        const contentNode = host.querySelector(`[data-element-id="${CSS.escape(elementId)}"] [data-element-content]`);

        if (contentNode !== null) {
          contentNode.textContent = textValue;
        }
      }
    });

    return unsubscribe;
  }, [dataStore]);

  // --- Keyboard shortcut handler ---
  useEffect(() => {
    const shortcuts = resolveShortcuts({});

    const handler = (e: KeyboardEvent): void => {
      const mode = store.getState().editingMode;

      // Escape: cancel placement mode, commit and exit path editing/drawing
      if (e.key === 'Escape') {
        if (mode.type === 'placement') {
          cancelPlacement(store);

          return;
        }

        if (mode.type === 'path-drawing') {
          stopPathDrawing(store);

          return;
        }

        if (mode.type === 'path-editing') {
          stopPathEditing(store);

          return;
        }
      }

      // Enter: close path and exit drawing
      if (e.key === 'Enter' && mode.type === 'path-drawing') {
        stopPathDrawing(store);

        return;
      }

      // Match and dispatch all other shortcuts
      const action = matchShortcut(shortcuts, e.key, {
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      });

      if (action) {
        e.preventDefault();
        handleShortcutAction(store, action);
      }
    };

    window.addEventListener('keydown', handler);

    return (): void => {
      window.removeEventListener('keydown', handler);
    };
  }, [store]);

  // --- Sidebar resize via drag ---
  const handleSidebarResizeStart = useCallback(
    (e: MouseEvent): void => {
      e.preventDefault();
      sidebarResizing.current = true;

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMove = (ev: globalThis.MouseEvent): void => {
        const delta = startX - ev.clientX;
        const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startWidth + delta));

        setSidebarWidth(next);
      };

      const onUp = (): void => {
        sidebarResizing.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [sidebarWidth],
  );

  // Persist sidebar preferences on change
  useEffect(() => {
    saveSidebarPreferences({
      open: sidebarTab !== null,
      tab: sidebarTab ?? 'layers',
      width: sidebarWidth,
    });
  }, [sidebarWidth, sidebarTab]);

  // Auto-switch sidebar: if Properties or Animation tab active but nothing selected, switch to Layers
  useEffect(() => {
    if (activeElementIds.length === 0 && (sidebarTab === 'properties' || sidebarTab === 'animation')) {
      setSidebarTab('layers');
    }
  }, [activeElementIds, sidebarTab]);

  const handleSidebarTabChange = useCallback(
    (key: string | number): void => {
      const tab = key as SidebarTab;

      if (tab === sidebarTab) {
        // Clicking active tab closes sidebar
        setSidebarTab(null);
      } else {
        setSidebarTab(tab);
      }
    },
    [sidebarTab],
  );

  const handlePlayPause = useCallback((): void => {
    if (isPlaying) {
      controllerRef.current?.pause();
      setIsPlaying(false);
    } else {
      controllerRef.current?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleReset = useCallback((): void => {
    controllerRef.current?.pause();
    controllerRef.current?.seek(0);
    setIsPlaying(false);
  }, []);

  const handleElementTypeSelect = useCallback(
    (type: string): void => {
      store.getState().addElement(type);
    },
    [store],
  );

  const handleCanvasClick = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      // In path drawing mode, clicks append points instead of selecting elements
      if (editingMode.type === 'path-drawing') {
        const canvasEl = canvasRef.current;

        if (canvasEl !== null) {
          const rect = canvasEl.getBoundingClientRect();

          appendPathPoint(
            store,
            (e.clientX - rect.left) / canvasSettings.zoom,
            (e.clientY - rect.top) / canvasSettings.zoom,
          );
        }

        return;
      }

      if (!(e.target instanceof Element)) {
        return;
      }

      const container = e.target.closest('[data-element-id]');
      const elementId = container?.getAttribute('data-element-id') ?? null;

      store.getState().selectElement(elementId);
    },
    [store, editingMode.type, canvasSettings.zoom],
  );

  const handlePageSelect = useCallback(
    (index: number): void => {
      store.getState().switchPage(index);
    },
    [store],
  );

  const handlePageAdd = useCallback((): void => {
    store.getState().addPage();
  }, [store]);

  const handlePageRemove = useCallback(
    (index: number): void => {
      store.getState().removePage(index);
    },
    [store],
  );

  // --- Properties sidebar handlers ---

  const handlePropertyUpdate = useCallback(
    (key: string, value: string | number): void => {
      const state = store.getState();
      const elementId = state.activeElementIds[0];

      if (elementId === undefined) return;

      // Geometry fields route through commitElementUpdate
      const geometryKeys = ['x', 'y', 'width', 'height', 'rotation'];

      if (geometryKeys.includes(key)) {
        const numValue = typeof value === 'number' ? value : parseFloat(value);

        if (key === 'x' || key === 'y') {
          const currentEl = state.document.pages[state.activePageIndex]?.elements.find((el) => el.id === elementId);

          if (currentEl === undefined) return;

          state.commitElementUpdate(elementId, {
            position: {
              ...currentEl.position,
              [key]: numValue,
            },
          });
        } else {
          state.commitElementUpdate(elementId, { [key]: numValue });
        }
      } else {
        // Style fields
        const styleKey = key === 'blendMode' ? 'mixBlendMode' : key;

        state.updateElementStyle(elementId, { [styleKey]: value } as Partial<BroadsetElementStyle>);
      }
    },
    [store],
  );

  const handleLayerSelect = useCallback(
    (id: string): void => {
      store.getState().selectElement(id);
    },
    [store],
  );

  const handleLayerToggleLock = useCallback(
    (id: string): void => {
      store.getState().toggleLock(id);
    },
    [store],
  );

  const handleLayerToggleVisibility = useCallback(
    (id: string): void => {
      store.getState().toggleVisibility(id);
    },
    [store],
  );

  const handleLayerDelete = useCallback(
    (id: string): void => {
      store.getState().removeElement(id);
    },
    [store],
  );

  const handleUndo = useCallback((): void => {
    store.getState().undo();
  }, [store]);

  const handleRedo = useCallback((): void => {
    store.getState().redo();
  }, [store]);

  // --- Pan state ---
  const panRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Track space key for space-drag panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat) {
        setSpaceHeld(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return (): void => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>): void => {
      e.preventDefault();

      const state = store.getState();
      const oldZoom = state.canvasSettings.zoom;
      const step = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.1, Math.min(4.0, oldZoom + step));
      const roundedZoom = Math.round(newZoom * 100) / 100;

      if (roundedZoom === oldZoom) return;

      // Pointer-centric zoom: keep the point under the cursor stationary
      const canvasArea = e.currentTarget;
      const rect = canvasArea.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Pointer position relative to center of canvas area
      const pointerX = e.clientX - rect.left - centerX;
      const pointerY = e.clientY - rect.top - centerY;

      // Adjust pan so the world point under the pointer stays stationary
      const cs = state.canvasSettings;
      const scale = roundedZoom / oldZoom;
      const newPanX = pointerX - scale * (pointerX - cs.panX);
      const newPanY = pointerY - scale * (pointerY - cs.panY);

      state.updateCanvasSettings({
        zoom: roundedZoom,
        panX: Math.round(newPanX),
        panY: Math.round(newPanY),
      });
    },
    [store],
  );

  const handleCanvasAreaMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      // Middle-mouse button or space+left-click starts panning
      const isPanGesture = e.button === 1 || (e.button === 0 && spaceHeld);

      if (!isPanGesture) return;

      e.preventDefault();
      e.stopPropagation();

      const cs = store.getState().canvasSettings;

      panRef.current = { startX: e.clientX, startY: e.clientY, origPanX: cs.panX, origPanY: cs.panY };

      const onMove = (ev: globalThis.MouseEvent): void => {
        const pan = panRef.current;

        if (pan === null) return;

        const dx = ev.clientX - pan.startX;
        const dy = ev.clientY - pan.startY;

        store.getState().updateCanvasSettings({
          panX: pan.origPanX + dx,
          panY: pan.origPanY + dy,
        });
      };

      const onUp = (): void => {
        panRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [store, spaceHeld],
  );

  // --- Context menu handler ---
  const handleContextMenu = useCallback((e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    // Context menu actions will be wired in later phases
  }, []);

  const handleToggleGrid = useCallback((): void => {
    const gs = store.getState().gridSettings;

    store.getState().updateGridSettings({ showGrid: !gs.showGrid });
  }, [store]);

  const handleZoomToFit = useCallback((): void => {
    const canvasArea = document.querySelector('[data-canvas-area]');

    if (canvasArea === null) return;

    const areaRect = canvasArea.getBoundingClientRect();
    const margin = 60; // px padding around the fitted doc
    const doc = store.getState().document;
    const availW = areaRect.width - margin * 2;
    const availH = areaRect.height - margin * 2;

    if (availW <= 0 || availH <= 0) return;

    const fitZoom = Math.min(availW / doc.canvas.width, availH / doc.canvas.height, 4.0);
    const clampedZoom = Math.max(0.1, Math.round(fitZoom * 100) / 100);

    store.getState().updateCanvasSettings({ zoom: clampedZoom, panX: 0, panY: 0 });
  }, [store]);

  const handleAddGuide = useCallback(
    (guide: Omit<Guide, 'id'>): void => {
      store.getState().addGuide(guide);
    },
    [store],
  );

  // --- Derived data ---

  const activePage = editorDoc.pages[activePageIndex];
  const activeElements = activePage?.elements ?? [];
  const firstActiveId = activeElementIds[0];

  // --- Path editing/drawing handlers ---

  const handleEnterPathEditing = useCallback((): void => {
    if (firstActiveId !== undefined) {
      startPathEditing(store, firstActiveId);
    }
  }, [store, firstActiveId]);

  const handleExitPathEditing = useCallback((): void => {
    stopPathEditing(store);
  }, [store]);

  const handleEnterPathDrawing = useCallback((): void => {
    if (firstActiveId !== undefined) {
      startPathDrawing(store, firstActiveId);
    }
  }, [store, firstActiveId]);

  const handleExitPathDrawing = useCallback((): void => {
    stopPathDrawing(store);
  }, [store]);
  const selectedElement =
    firstActiveId !== undefined ? activeElements.find((el) => el.id === firstActiveId) : undefined;
  const panelElement = selectedElement !== undefined ? elementToPanelElement(selectedElement) : undefined;
  const layers = elementsToLayers(activeElements);
  const pages = editorDoc.pages.map((p) => ({ id: p.id }));

  // Animation config for the selected element
  const selectedAnimConfig =
    firstActiveId !== undefined ?
      animationRegistry.find((entry) => entry.elementId === firstActiveId)?.config
    : undefined;

  // Timeline keyframes + computed duration
  const timelineKeyframes =
    selectedAnimConfig?.timelines[0]?.entries.map((e) => ({
      offsetMs: e.offsetMs,
      properties: e.properties,
    })) ?? [];

  const TIMELINE_MIN_DURATION = 3000;
  const TIMELINE_TAIL_MS = 1000;
  const maxTimelineOffset = timelineKeyframes.reduce((max, kf) => Math.max(max, kf.offsetMs), 0);
  const timelineDuration = Math.max(TIMELINE_MIN_DURATION, maxTimelineOffset + TIMELINE_TAIL_MS);

  const handleSelectKeyframe = useCallback((index: number): void => {
    setSelectedKeyframeIndex(index);
  }, []);

  const handleAddKeyframe = useCallback((): void => {
    if (firstActiveId === undefined) return;

    const state = store.getState();
    const currentConfig = animationRegistry.find((entry) => entry.elementId === firstActiveId)?.config;

    // If no timelines exist, create one with a single keyframe
    const timelineName = currentConfig?.timelines[0]?.id ?? 'default';
    const entries = currentConfig?.timelines[0]?.entries ?? [];
    const newOffset = entries.length > 0 ? (entries[entries.length - 1]?.offsetMs ?? 0) + 500 : 0;

    const newEntry: Keyframe = {
      name: `Keyframe ${String(entries.length + 1)}`,
      offsetMs: newOffset,
      properties: {},
      action: 'setState',
    };
    const updatedEntries = [...entries, newEntry];

    const baseConfig: ElementAnimationConfig = currentConfig ?? {
      timelines: [],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
    };
    const updatedConfig = upsertTimeline(baseConfig, {
      id: timelineName,
      name: currentConfig?.timelines[0]?.name ?? 'Timeline 1',
      entries: updatedEntries,
    });

    const doc = state.getDocument();
    const updatedRegistry =
      doc.animationRegistry.some((e) => e.elementId === firstActiveId) ?
        doc.animationRegistry.map((e) => (e.elementId === firstActiveId ? { ...e, config: updatedConfig } : e))
      : [...doc.animationRegistry, { elementId: firstActiveId, config: updatedConfig }];

    state.setDocument({ ...doc, animationRegistry: updatedRegistry });
    setSelectedKeyframeIndex(updatedEntries.length - 1);
  }, [store, firstActiveId, animationRegistry]);

  const handleMoveKeyframe = useCallback(
    (index: number, newOffsetMs: number): void => {
      if (firstActiveId === undefined) return;

      const state = store.getState();
      const currentConfig = animationRegistry.find((entry) => entry.elementId === firstActiveId)?.config;
      const timeline = currentConfig?.timelines[0];

      if (timeline === undefined || currentConfig === undefined) return;

      const updatedEntries = timeline.entries.map((e, i) =>
        i === index ? { ...e, offsetMs: Math.max(0, newOffsetMs) } : e,
      );

      const updatedConfig = upsertTimeline(currentConfig, {
        id: timeline.id,
        name: timeline.name,
        entries: updatedEntries,
      });

      const doc = state.getDocument();
      const updatedRegistry = doc.animationRegistry.map((e) =>
        e.elementId === firstActiveId ? { ...e, config: updatedConfig } : e,
      );

      state.setDocument({ ...doc, animationRegistry: updatedRegistry });
    },
    [store, firstActiveId, animationRegistry],
  );

  return (
    <EditorErrorBoundary>
      <BroadsetDataStoreProvider store={dataStore}>
        <div className="relative h-screen w-screen overflow-hidden">
          {/* ---- Canvas area (fills entire viewport) ---- */}
          <div
            data-canvas-area
            className="absolute inset-0"
            style={{
              backgroundColor: 'hsl(var(--heroui-default-100))',
              cursor: spaceHeld ? 'grab' : undefined,
            }}
            onWheel={handleWheel}
            onMouseDown={handleCanvasAreaMouseDown}
            onContextMenu={handleContextMenu}
          >
            <div className="flex h-full w-full items-center justify-center">
              <div
                style={{
                  position: 'relative',
                  transform: `translate(${String(canvasSettings.panX)}px, ${String(canvasSettings.panY)}px) scale(${String(canvasSettings.zoom)})`,
                  transformOrigin: 'center center',
                }}
              >
                <div
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  style={{
                    backgroundColor: '#ffffff',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
                    border: '1px solid hsl(var(--heroui-default-200))',
                  }}
                />

                <CanvasOverlays
                  showGrid={gridSettings.showGrid}
                  gridSize={gridSettings.gridSize}
                  canvasWidth={editorDoc.canvas.width}
                  canvasHeight={editorDoc.canvas.height}
                  padding={editorDoc.canvas.padding}
                  viewMode={canvasSettings.viewMode}
                  guides={canvasSettings.guides}
                />

                {/* Transform widget — interactive handles for active elements */}
                {activeElements
                  .filter((el) => activeElementIds.includes(el.id))
                  .map((el) => {
                    const absPos = computeAbsolutePosition(el, activeElements);

                    return (
                      <TransformWidget
                        key={`tw-${el.id}`}
                        element={el}
                        absoluteX={absPos.x}
                        absoluteY={absPos.y}
                        zoom={canvasSettings.zoom}
                        store={store}
                      />
                    );
                  })}
              </div>
            </div>
          </div>

          {/* ---- Rulers (viewport-level, above canvas) ---- */}
          <Rulers
            canvasWidth={editorDoc.canvas.width}
            canvasHeight={editorDoc.canvas.height}
            zoom={canvasSettings.zoom}
            panX={canvasSettings.panX}
            panY={canvasSettings.panY}
            units={canvasSettings.units}
            originX={canvasSettings.originX}
            originY={canvasSettings.originY}
            showRulers={canvasSettings.showRulers}
            onAddGuide={handleAddGuide}
          />

          {/* ---- Placement mode banner (top-center) ---- */}
          {editingMode.type === 'placement' ?
            <div className="toolbar-glass absolute top-3 left-1/2 z-[8001] flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 text-sm">
              <span>
                Placement mode: click on the canvas to place <strong>{editingMode.elementType}</strong>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  cancelPlacement(store);
                }}
              >
                Cancel
              </Button>
            </div>
          : null}

          {/* ---- Path mode indicator (top-center) ---- */}
          {editingMode.type === 'path-editing' || editingMode.type === 'path-drawing' ?
            <div
              data-testid="path-mode-indicator"
              className={`absolute top-3 left-1/2 z-[8001] -translate-x-1/2 rounded-lg px-4 py-2 text-xs font-semibold text-white ${
                editingMode.type === 'path-drawing' ? 'bg-primary' : 'bg-warning'
              }`}
            >
              {editingMode.type === 'path-drawing' ? 'Drawing Path' : 'Editing Path'}
            </div>
          : null}

          {/* ---- Floating main toolbar (top-left) ---- */}
          <div
            role="toolbar"
            aria-label="Main toolbar"
            className="toolbar-glass absolute top-[28px] left-[28px] z-[8000] flex items-center gap-1 rounded-lg p-1.5"
          >
            {/* Document actions */}
            <ToolbarButton
              icon={FilePlus}
              label="New Document"
              onPress={() => {
                setActiveModal('newDocument');
              }}
            />
            <ToolbarButton
              icon={Save}
              label="Save"
              onPress={() => {
                const doc = store.getState().getDocument();
                const config = configRef.current;

                if (config !== null && typeof config.onSave === 'function') {
                  (config.onSave as (doc: unknown) => void)(doc);
                  toastRef.current.show('success', 'Document saved');
                }
              }}
            />
            <ToolbarButton
              icon={Upload}
              label="Import"
              onPress={() => {
                const input = document.createElement('input');

                input.type = 'file';
                input.accept = '.json';

                input.onchange = () => {
                  const file = input.files?.[0];

                  if (file === undefined) return;

                  const reader = new FileReader();

                  reader.onload = () => {
                    try {
                      const doc = JSON.parse(reader.result as string) as ReturnType<typeof sampleToEditorDocument>;

                      store.getState().loadTemplate(doc);
                      toastRef.current.show('success', 'Document imported successfully');
                    } catch {
                      toastRef.current.show('error', 'Import failed — invalid JSON file');
                    }
                  };

                  reader.readAsText(file);
                };

                input.click();
              }}
            />
            <ToolbarButton
              icon={Download}
              label="Export"
              onPress={() => {
                setActiveModal('export');
              }}
            />
            <ToolbarButton
              icon={Image}
              label="Media Library"
              onPress={() => {
                setActiveModal('mediaLibrary');
              }}
            />

            <div className="mx-1 h-5 w-px bg-divider" />

            {/* Edit actions */}
            <ToolbarButton icon={Undo2} label="Undo" onPress={handleUndo} data-testid="undo-button" />
            <ToolbarButton icon={Redo2} label="Redo" onPress={handleRedo} data-testid="redo-button" />

            <div className="mx-1 h-5 w-px bg-divider" />

            {/* View actions */}
            <ToolbarButton
              icon={Grid3x3}
              label={gridSettings.showGrid ? 'Hide Grid' : 'Show Grid'}
              onPress={handleToggleGrid}
              data-testid="grid-toggle"
            />
            <ToolbarButton
              icon={Settings}
              label="Canvas Settings"
              onPress={() => {
                setActiveModal('canvasSettings');
              }}
            />
            <ToolbarButton icon={Scan} label="Zoom to Fit" onPress={handleZoomToFit} data-testid="zoom-to-fit" />

            <div className="mx-1 h-5 w-px bg-divider" />

            {/* Playback actions */}
            <ToolbarButton
              icon={isPlaying ? Pause : Play}
              label={isPlaying ? 'Pause' : 'Play'}
              onPress={handlePlayPause}
              data-testid="play-button"
              data-playing={String(isPlaying)}
            />
            <ToolbarButton icon={RotateCcw} label="Reset" onPress={handleReset} data-testid="reset-button" />

            <div className="mx-1 h-5 w-px bg-divider" />

            {/* Utilities */}
            <ToolbarButton
              icon={Bug}
              label="Debug Snapshot"
              onPress={() => {
                const doc = store.getState().getDocument();
                const snapshot = JSON.stringify(doc, null, 2);
                const blob = new Blob([snapshot], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');

                a.href = url;
                a.download = `broadset-debug-${Date.now().toString()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            />
            <ToolbarButton
              icon={Keyboard}
              label="Keyboard Shortcuts"
              onPress={() => {
                setActiveModal('shortcutHelp');
              }}
            />
            <ToolbarButton
              icon={Info}
              label="About"
              onPress={() => {
                setActiveModal('about');
              }}
            />

            <div className="mx-1 h-5 w-px bg-divider" />

            {/* Fullscreen toggle */}
            <ToolbarButton
              icon={isFullscreen ? Minimize : Maximize}
              label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              onPress={() => {
                if (document.fullscreenElement !== null) {
                  void document.exitFullscreen();
                } else {
                  void document.documentElement.requestFullscreen();
                }
              }}
            />

            <span className="ml-1 flex items-center text-xs text-default-500">
              {Math.round(canvasSettings.zoom * 100)}%
            </span>
          </div>

          {/* ---- Vertical element toolbar (below main toolbar) ---- */}
          <div className="toolbar-glass absolute top-[80px] left-[28px] z-[8000] rounded-lg p-1.5">
            <div role="toolbar" aria-label="Element library" className="flex flex-col gap-0.5">
              {ELEMENT_TYPES.map((info) => {
                const Icon = ELEMENT_ICON_MAP[info.type] ?? ELEMENT_FALLBACK_ICON;

                return (
                  <Tooltip key={info.type}>
                    <Tooltip.Trigger>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={info.label}
                        onPress={() => {
                          handleElementTypeSelect(info.type);
                        }}
                      >
                        <Icon size={16} />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{info.label}</Tooltip.Content>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* ---- Right-side tabbed drawer ---- */}
          {sidebarTab !== null ?
            <div
              className="toolbar-glass absolute top-0 right-0 z-[8000] flex h-full flex-col overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              {/* Resize handle */}
              <div
                className="absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary/50"
                onMouseDown={handleSidebarResizeStart}
              />

              {/* Tabs */}
              <div className="shrink-0 border-b border-divider px-2 pt-2">
                <Tabs selectedKey={sidebarTab} onSelectionChange={handleSidebarTabChange}>
                  <Tabs.List>
                    <Tabs.Tab id="layers">Layers</Tabs.Tab>
                    <Tabs.Tab id="properties">Properties</Tabs.Tab>
                    <Tabs.Tab id="animation">Animation</Tabs.Tab>
                    <Tabs.Tab id="preflight">Preflight</Tabs.Tab>
                  </Tabs.List>
                </Tabs>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-2">
                {sidebarTab === 'layers' ?
                  <LayersSidebar
                    layers={layers}
                    selectedIds={activeElementIds as string[]}
                    onSelect={handleLayerSelect}
                    onToggleLock={handleLayerToggleLock}
                    onToggleVisibility={handleLayerToggleVisibility}
                    onDelete={handleLayerDelete}
                  />
                : null}

                {sidebarTab === 'properties' && panelElement !== undefined ?
                  <>
                    <PropertiesSidebar
                      element={panelElement}
                      documentMode={documentMode}
                      onUpdate={handlePropertyUpdate}
                    />
                    {selectedElement?.type === 'path' ?
                      <PathToolsPanel
                        editingMode={editingMode}
                        onEnterEditing={handleEnterPathEditing}
                        onExitEditing={handleExitPathEditing}
                        onEnterDrawing={handleEnterPathDrawing}
                        onExitDrawing={handleExitPathDrawing}
                      />
                    : null}
                  </>
                : null}

                {sidebarTab === 'properties' && panelElement === undefined ?
                  <div className="flex h-32 items-center justify-center text-sm text-default-400">
                    Select an element to edit its properties
                  </div>
                : null}

                {sidebarTab === 'animation' && firstActiveId !== undefined ?
                  <AnimationSidebar
                    elementId={firstActiveId}
                    animationsEnabled={featureConfig.animations}
                    locked={false}
                    {...(selectedAnimConfig !== undefined ? { config: selectedAnimConfig } : {})}
                  />
                : null}

                {sidebarTab === 'animation' && firstActiveId === undefined ?
                  <div className="space-y-2 text-sm text-default-500">
                    <p>Select an element to configure animations.</p>
                  </div>
                : null}

                {sidebarTab === 'preflight' ?
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-success">
                      <span>✓</span>
                      <span>All checks passed — document ready for export.</span>
                    </div>
                  </div>
                : null}
              </div>
            </div>
          : null}

          {/* Sidebar tab strip (visible when drawer is closed) */}
          {sidebarTab === null ?
            <div className="toolbar-glass absolute top-1/2 right-0 z-[8000] flex -translate-y-1/2 flex-col gap-1 rounded-l-lg p-1">
              {(['layers', 'properties', 'animation', 'preflight'] as const).map((tab) => {
                const TabIcon = SIDEBAR_ICON_MAP[tab];

                return (
                  <Tooltip key={tab}>
                    <Tooltip.Trigger>
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                        onPress={() => {
                          setSidebarTab(tab);
                        }}
                      >
                        <TabIcon size={16} />
                      </Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Tooltip.Content>
                  </Tooltip>
                );
              })}
            </div>
          : null}

          {/* ---- Timeline Bottom Panel ---- */}
          <TimelineBottomPanel
            isOpen={timelineOpen}
            onClose={() => {
              setTimelineOpen(false);
              setSelectedKeyframeIndex(null);
            }}
            keyframes={timelineKeyframes}
            durationMs={timelineDuration}
            selectedIndex={selectedKeyframeIndex}
            onSelectKeyframe={handleSelectKeyframe}
            onAddKeyframe={handleAddKeyframe}
            onMoveKeyframe={handleMoveKeyframe}
            onPlayTimeline={handlePlayPause}
          />

          {/* ---- Timeline toggle button (visible when timeline is closed) ---- */}
          {!timelineOpen ?
            <div className="toolbar-glass absolute bottom-4 left-1/2 z-[8000] -translate-x-1/2 rounded-lg p-1">
              <ToolbarButton
                icon={Timer}
                label="Open Timeline"
                onPress={() => {
                  setTimelineOpen(true);
                }}
                data-testid="timeline-toggle"
              />
            </div>
          : null}

          {/* ---- Page sorter (floating bottom-left) ---- */}
          <div className="toolbar-glass absolute bottom-4 left-[28px] z-[8000] flex items-center gap-1 rounded-lg p-1">
            <PageSorter
              pages={pages}
              activePageIndex={activePageIndex}
              onPageSelect={handlePageSelect}
              onPageAdd={handlePageAdd}
              onPageRemove={handlePageRemove}
            />
          </div>

          {/* ---- Modals ---- */}
          <AboutModal
            isOpen={activeModal === 'about'}
            onClose={() => {
              setActiveModal(null);
            }}
          />

          <CanvasSettingsModal
            isOpen={activeModal === 'canvasSettings'}
            onClose={() => {
              setActiveModal(null);
            }}
            documentName={documentName}
            onDocumentNameChange={setDocumentName}
            viewMode={canvasSettings.viewMode}
            onViewModeChange={(mode) => {
              store.getState().updateCanvasSettings({ viewMode: mode });
            }}
            showRulers={canvasSettings.showRulers}
            onRulersChange={(show) => {
              store.getState().updateCanvasSettings({ showRulers: show });
            }}
            perspectiveAngle={canvasSettings.perspective}
            onPerspectiveChange={(angle) => {
              store.getState().updateCanvasSettings({ perspective: angle });
            }}
            gridSettings={gridSettings}
            onGridChange={(gs) => {
              store.getState().updateGridSettings(gs);
            }}
          />

          <ExportModal
            isOpen={activeModal === 'export'}
            onClose={() => {
              setActiveModal(null);
            }}
            featureConfig={{ ...featureConfig }}
            onExport={(format) => {
              // Trigger download of the current document in JSON format as a reference export
              const doc = store.getState().getDocument();
              const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');

              a.href = url;
              a.download = `${documentName}-${format}.json`;
              a.click();
              URL.revokeObjectURL(url);
              setActiveModal(null);
              toastRef.current.show('success', `Exported as ${format} successfully`);
            }}
          />

          <MediaLibraryModal
            isOpen={activeModal === 'mediaLibrary'}
            onClose={() => {
              setActiveModal(null);
            }}
            assets={DEMO_MEDIA_SOURCE.assets}
            categories={DEMO_MEDIA_SOURCE.categories}
            onSelect={(assetId) => {
              // Set the selected media asset as the content of the active image element
              const state = store.getState();
              const elementId = state.activeElementIds[0];

              if (elementId !== undefined) {
                const asset = DEMO_MEDIA_SOURCE.assets.find((a) => a.id === assetId);

                if (asset !== undefined) {
                  state.commitElementUpdate(elementId, { content: asset.url });
                }
              }

              setActiveModal(null);
            }}
          />

          <NewDocumentModal
            isOpen={activeModal === 'newDocument'}
            onClose={() => {
              setActiveModal(null);
            }}
            onCreateDocument={(preset) => {
              store.getState().loadTemplate({
                id: crypto.randomUUID(),
                documentMode: 'screen',
                canvas: { width: preset.width, height: preset.height, padding: [0, 0, 0, 0] },
                pages: [{ id: 'page-1', elements: [] }],
                animationRegistry: [],
              });
              setDocumentName(preset.label);
              setActiveModal(null);
            }}
          />

          <ShortcutHelpModal
            isOpen={activeModal === 'shortcutHelp'}
            onClose={() => {
              setActiveModal(null);
            }}
          />

          {/* ---- Toast notifications (bottom-right) ---- */}
          {toasts.length > 0 ?
            <div
              data-testid="toast-container"
              style={{
                position: 'fixed',
                bottom: 16,
                right: 16,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  data-testid="toast"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 8,
                    backgroundColor: 'hsl(var(--heroui-content1))',
                    borderLeft: `3px solid ${
                      toast.severity === 'success' ? 'hsl(var(--heroui-success))'
                      : toast.severity === 'error' ? 'hsl(var(--heroui-danger))'
                      : 'hsl(var(--heroui-primary))'
                    }`,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                    fontSize: 13,
                    minWidth: 240,
                    animation: 'slideInRight 0.15s ease-out',
                  }}
                >
                  <span>
                    {toast.severity === 'success' ?
                      '✓'
                    : toast.severity === 'error' ?
                      '⚠'
                    : 'ℹ'}
                  </span>
                  <span style={{ flex: 1 }}>{toast.message}</span>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Dismiss"
                    onPress={() => {
                      toastRef.current.dismiss(toast.id);
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          : null}
        </div>
      </BroadsetDataStoreProvider>
    </EditorErrorBoundary>
  );
}
