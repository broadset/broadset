import type { EditingMode, EditorStore } from '@broadset/editor';
import {
  appendPathPoint,
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
import type { ElementTypeInfo } from '@broadset/ui';
import {
  AboutModal,
  AnimationSidebar,
  CanvasSettingsModal,
  ElementLibrary,
  ExportModal,
  LayersSidebar,
  MediaLibraryModal,
  NewDocumentModal,
  PropertiesSidebar,
  ShortcutHelpModal,
  TimelineBottomPanel,
} from '@broadset/ui';
import { Button } from '@heroui/react';
import type { JSX, MouseEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createDemoController } from './animationSetup';
import { BottomBar } from './BottomBar';
import { CanvasOverlays } from './CanvasOverlays';
import { elementsToLayers, elementToPanelElement, sampleToEditorDocument, toRendererDoc } from './converters';
import { PathToolsPanel } from './PathToolsPanel';

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
// Element type registry for the toolbar
// ---------------------------------------------------------------------------

const ELEMENT_TYPES: readonly ElementTypeInfo[] = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'svg', label: 'SVG' },
  { type: 'path', label: 'Path' },
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'qrcode', label: 'QR Code' },
];

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

      // Escape: commit and exit path editing/drawing
      if (e.key === 'Escape') {
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

  // --- Handlers ---

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
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Element Library Toolbar */}
      <div
        style={{
          padding: 8,
          display: 'flex',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <ElementLibrary elementTypes={ELEMENT_TYPES} onSelect={handleElementTypeSelect} />
        <span style={{ borderLeft: '1px solid #ccc', margin: '0 4px' }} />
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('newDocument');
          }}
        >
          New
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('canvasSettings');
          }}
        >
          Settings
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('export');
          }}
        >
          Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('mediaLibrary');
          }}
        >
          Media
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('shortcutHelp');
          }}
        >
          Shortcuts
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setActiveModal('about');
          }}
        >
          About
        </Button>
      </div>

      {/* Main area: canvas + sidebar */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Layers sidebar */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: '1px solid #ccc',
            overflowY: 'auto',
            padding: 4,
          }}
        >
          <LayersSidebar
            layers={layers}
            onSelect={handleLayerSelect}
            onToggleLock={handleLayerToggleLock}
            onDelete={handleLayerDelete}
          />
        </div>

        {/* Canvas Area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
          onWheel={handleWheel}
        >
          {/* Path mode indicator */}
          {editingMode.type === 'path-editing' || editingMode.type === 'path-drawing' ?
            <div
              data-testid="path-mode-indicator"
              style={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: editingMode.type === 'path-drawing' ? '#2196F3' : '#FF9800',
                color: '#fff',
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                zIndex: 10,
              }}
            >
              {editingMode.type === 'path-drawing' ? 'Drawing Path' : 'Editing Path'}
            </div>
          : null}
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

        {/* Properties sidebar + Animation sidebar */}
        {panelElement !== undefined ?
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderLeft: '1px solid #ccc',
              overflowY: 'auto',
              padding: 8,
            }}
          >
            <PropertiesSidebar element={panelElement} documentMode={documentMode} onUpdate={handlePropertyUpdate} />
            {/* Path editing controls */}
            {selectedElement?.type === 'path' ?
              <PathToolsPanel
                editingMode={editingMode}
                onEnterEditing={handleEnterPathEditing}
                onExitEditing={handleExitPathEditing}
                onEnterDrawing={handleEnterPathDrawing}
                onExitDrawing={handleExitPathDrawing}
              />
            : null}
            {featureConfig.animations && selectedAnimConfig !== undefined ?
              <AnimationSidebar
                elementId={firstActiveId ?? null}
                animationsEnabled={featureConfig.animations}
                locked={false}
                config={selectedAnimConfig}
              />
            : null}
          </div>
        : null}
      </div>

      {/* Timeline Bottom Panel */}
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

      <BottomBar
        pages={pages}
        activePageIndex={activePageIndex}
        onPageSelect={handlePageSelect}
        onPageAdd={handlePageAdd}
        onPageRemove={handlePageRemove}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showGrid={gridSettings.showGrid}
        onToggleGrid={handleToggleGrid}
        zoom={canvasSettings.zoom}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onReset={handleReset}
        timelineOpen={timelineOpen}
        onToggleTimeline={() => {
          setTimelineOpen((prev) => !prev);
        }}
      />

      {/* --- Modals --- */}
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
