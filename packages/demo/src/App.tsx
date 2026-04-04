import type { EditingMode, EditorStore } from '@broadset/editor';
import {
  appendPathPoint,
  cancelPlacement,
  createEditorStore,
  handleShortcutAction,
  matchShortcut,
  resolveShortcuts,
  startPathDrawing,
  startPathEditing,
  stopPathDrawing,
  stopPathEditing,
} from '@broadset/editor';
import type { BroadsetElementStyle } from '@broadset/model';
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
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
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
import { PathToolsPanel } from './PathToolsPanel';
import {
  ELEMENT_FALLBACK_ICON,
  ELEMENT_ICON_MAP,
  ELEMENT_TYPES,
  persistSidebarWidth,
  readSidebarWidth,
  SIDEBAR_ICON_MAP,
  ToolbarButton,
} from './toolbar-helpers';

// ---------------------------------------------------------------------------
// Modal name type
// ---------------------------------------------------------------------------

type ModalName = 'about' | 'canvasSettings' | 'export' | 'mediaLibrary' | 'newDocument' | 'shortcutHelp';

// ---------------------------------------------------------------------------
// Sample media assets for the Media Library demo
// ---------------------------------------------------------------------------

const DEMO_ASSETS = [
  { id: 'a1', name: 'Company Logo', url: '/assets/logo.png', categoryId: 'logos' },
  { id: 'a2', name: 'Event Banner', url: '/assets/banner.jpg', categoryId: 'graphics' },
  { id: 'a3', name: 'Score Bug', url: '/assets/bug.svg', categoryId: 'graphics' },
  { id: 'a4', name: 'Sponsor Logo', url: '/assets/sponsor.png', categoryId: 'logos' },
] as const;

const DEMO_CATEGORIES = [
  { id: 'logos', name: 'Logos' },
  { id: 'graphics', name: 'Graphics' },
] as const;

// ---------------------------------------------------------------------------
// App component
// ---------------------------------------------------------------------------

export default function App(): JSX.Element {
  // --- Editor store (created once) ---
  const storeRef = useRef<EditorStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createEditorStore();
    storeRef.current.getState().loadTemplate(sampleToEditorDocument());
  }

  const store = storeRef.current;

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

  // --- Sidebar drawer state ---

  type SidebarTab = 'layers' | 'properties' | 'animation' | 'preflight';

  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>('layers');
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const sidebarResizing = useRef(false);
  const SIDEBAR_MIN = 256;
  const SIDEBAR_MAX = 800;

  // --- Lock viewport overflow (runs once) ---
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevBodyMargin = body.style.margin;

    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    body.style.margin = '0';

    return (): void => {
      html.style.overflow = prevHtmlOverflow;
      html.style.height = prevHtmlHeight;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      body.style.margin = prevBodyMargin;
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

  // Persist sidebar width on change
  useEffect(() => {
    persistSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

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

      if (!(e.target instanceof HTMLElement)) {
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

  const handleLayerToggleLock = useCallback((_id: string): void => {
    // Lock toggle will be implemented in later phases
  }, []);

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

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>): void => {
      e.preventDefault();

      const state = store.getState();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, state.canvasSettings.zoom * delta));

      state.updateCanvasSettings({ zoom: newZoom });
    },
    [store],
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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* ---- Canvas area (fills entire viewport) ---- */}
      <div className="absolute inset-0" onWheel={handleWheel} onContextMenu={handleContextMenu}>
        <div className="flex h-full w-full items-center justify-center">
          <div
            style={{
              position: 'relative',
              transform: `scale(${String(canvasSettings.zoom)})`,
              transformOrigin: 'center center',
            }}
          >
            <div ref={canvasRef} onClick={handleCanvasClick} />

            <CanvasOverlays
              showGrid={gridSettings.showGrid}
              gridSize={gridSettings.gridSize}
              canvasWidth={editorDoc.canvas.width}
              canvasHeight={editorDoc.canvas.height}
              padding={editorDoc.canvas.padding}
              viewMode={canvasSettings.viewMode}
            />
          </div>
        </div>
      </div>

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
            console.log('Save triggered');
          }}
        />
        <ToolbarButton
          icon={Upload}
          label="Import"
          onPress={() => {
            console.log('Import triggered');
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
            console.log('Debug snapshot downloaded');
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

        <span className="ml-1 flex items-center text-xs text-default-500">
          {Math.round(canvasSettings.zoom * 100)}%
        </span>
      </div>

      {/* ---- Vertical element toolbar (below main toolbar) ---- */}
      <div className="toolbar-glass absolute top-[80px] left-[28px] z-[8000] flex flex-col gap-0.5 rounded-lg p-1.5">
        <div role="toolbar" aria-label="Element library" className="grid grid-cols-2 gap-0.5">
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
                onSelect={handleLayerSelect}
                onToggleLock={handleLayerToggleLock}
                onDelete={handleLayerDelete}
              />
            : null}

            {sidebarTab === 'properties' && panelElement !== undefined ?
              <>
                <PropertiesSidebar element={panelElement} documentMode={documentMode} onUpdate={handlePropertyUpdate} />
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

            {sidebarTab === 'animation' && featureConfig.animations && selectedAnimConfig !== undefined ?
              <AnimationSidebar
                elementId={firstActiveId ?? null}
                animationsEnabled={featureConfig.animations}
                locked={false}
                config={selectedAnimConfig}
              />
            : null}

            {sidebarTab === 'preflight' ?
              <div className="space-y-2 text-sm text-default-500">
                <p>Preflight checks will be available in a future update.</p>
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
        }}
        keyframes={
          selectedAnimConfig?.timelines[0]?.entries.map((e) => ({
            offsetMs: e.offsetMs,
            properties: e.properties,
          })) ?? []
        }
        durationMs={3000}
        selectedIndex={null}
        onSelectKeyframe={() => {
          /* keyframe selection will be wired in later phases */
        }}
        onAddKeyframe={() => {
          /* keyframe creation will be wired in later phases */
        }}
        onMoveKeyframe={() => {
          /* keyframe reorder will be wired in later phases */
        }}
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
          console.log('Export requested:', format);
          setActiveModal(null);
        }}
      />

      <MediaLibraryModal
        isOpen={activeModal === 'mediaLibrary'}
        onClose={() => {
          setActiveModal(null);
        }}
        assets={DEMO_ASSETS}
        categories={DEMO_CATEGORIES}
        onSelect={(assetId) => {
          console.log('Media selected:', assetId);
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
    </div>
  );
}
