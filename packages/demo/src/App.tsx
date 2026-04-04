import type { EditorStore } from '@broadset/editor';
import { computeGridLines, computeSafetyBoundaries, createEditorStore } from '@broadset/editor';
import type { BroadsetElementStyle } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { DocumentRenderer } from '@broadset/renderer';
import type { ElementTypeInfo } from '@broadset/ui';
import { ElementLibrary, LayersSidebar, PageSorter, PropertiesSidebar } from '@broadset/ui';
import type { JSX, MouseEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createDemoController } from './animationSetup';
import { elementsToLayers, elementToPanelElement, sampleToEditorDocument, toRendererDoc } from './converters';

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

  // --- Refs ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<DocumentRenderer | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

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

  // --- Delete key handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = store.getState();

        for (const id of state.activeElementIds) {
          state.removeElement(id);
        }
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
      if (!(e.target instanceof HTMLElement)) {
        return;
      }

      const container = e.target.closest('[data-element-id]');
      const elementId = container?.getAttribute('data-element-id') ?? null;

      store.getState().selectElement(elementId);
    },
    [store],
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
  const selectedElement =
    firstActiveId !== undefined ? activeElements.find((el) => el.id === firstActiveId) : undefined;
  const panelElement = selectedElement !== undefined ? elementToPanelElement(selectedElement) : undefined;
  const layers = elementsToLayers(activeElements);
  const pages = editorDoc.pages.map((p) => ({ id: p.id }));

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
          <div
            style={{
              position: 'relative',
              transform: `scale(${String(canvasSettings.zoom)})`,
              transformOrigin: 'center center',
            }}
          >
            <div ref={canvasRef} onClick={handleCanvasClick} />

            {/* Grid overlay */}
            {gridSettings.showGrid ?
              <svg
                data-testid="grid-overlay"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                {computeGridLines({
                  canvasWidth: editorDoc.canvas.width,
                  canvasHeight: editorDoc.canvas.height,
                  gridSize: gridSettings.gridSize,
                  zoom: 1,
                }).map((line) =>
                  line.axis === 'v' ?
                    <line
                      key={`v-${String(line.position)}`}
                      x1={line.position}
                      y1={0}
                      x2={line.position}
                      y2={editorDoc.canvas.height}
                      stroke="rgba(0,0,0,0.1)"
                      strokeWidth={0.5}
                    />
                  : <line
                      key={`h-${String(line.position)}`}
                      x1={0}
                      y1={line.position}
                      x2={editorDoc.canvas.width}
                      y2={line.position}
                      stroke="rgba(0,0,0,0.1)"
                      strokeWidth={0.5}
                    />,
                )}
              </svg>
            : null}

            {/* Safety boundaries */}
            {computeSafetyBoundaries({
              canvasWidth: editorDoc.canvas.width,
              canvasHeight: editorDoc.canvas.height,
              padding: editorDoc.canvas.padding,
              viewMode: canvasSettings.viewMode,
            }).map((rect, idx) => (
              <div
                key={`safety-${String(idx)}`}
                data-testid="safety-boundary"
                style={{
                  position: 'absolute',
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  backgroundColor: 'rgba(255,0,0,0.08)',
                  pointerEvents: 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Properties sidebar */}
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
          </div>
        : null}
      </div>

      {/* Bottom Controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <PageSorter
          pages={pages}
          activePageIndex={activePageIndex}
          onPageSelect={handlePageSelect}
          onPageAdd={handlePageAdd}
          onPageRemove={handlePageRemove}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="undo-button"
            onClick={handleUndo}
            type="button"
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            Undo
          </button>
          <button
            data-testid="redo-button"
            onClick={handleRedo}
            type="button"
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            Redo
          </button>
          <button
            data-testid="grid-toggle"
            onClick={handleToggleGrid}
            type="button"
            style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            {gridSettings.showGrid ? 'Hide Grid' : 'Show Grid'}
          </button>
          <span style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
            Zoom: {Math.round(canvasSettings.zoom * 100)}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="play-button"
            data-playing={String(isPlaying)}
            onClick={handlePlayPause}
            type="button"
            style={{
              padding: '8px 16px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            data-testid="reset-button"
            onClick={handleReset}
            type="button"
            style={{
              padding: '8px 16px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
