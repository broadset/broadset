import {
  type ChangeStream,
  createChangeStream,
  createDataStore,
  createEditorStore,
  diffDocuments,
  type EditorStore,
  runPreflightDiagnostics,
} from '@broadset/editor';
import { type BroadsetElement, broadsetProjectSchema, type TemplateGroup, type Timeline } from '@broadset/model';
import { type PreflightIssue } from '@broadset/ui';
import { toast } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ActiveDialog,
  type ContextMenuState,
  RULER_SIZE,
  SIDEBAR_STORAGE_KEY,
  type SidebarPreferences,
  type SidebarTab,
  TOAST_DISMISS_MS,
  type ToastSeverity,
} from '../demo-types';
import {
  clampSidebarWidth,
  formatResolutionLabel,
  loadSavedDocument,
  loadSidebarPreferences,
  toLayerInfo,
} from '../demo-utils';
import { DEMO_EDITOR_CONFIG } from '../demoConfig';
import { SAMPLE_PROJECT } from '../sampleDocument';
import { useLiveData } from '../useLiveData';
import { useCommandHandlers } from './command-handlers';
import { getElementLabel, useEditorSnapshot } from './helpers';
import { DemoAppLayout } from './layout';
import { DemoSidebarPanel } from './sidebar';
import { useCanvasControlHandlers } from './use-canvas-control-handlers';
import { useDemoFileHandlers } from './use-demo-file-handlers';
import { useShellBrowserEffects } from './use-shell-browser-effects';
import { useTemplateGroupManagement } from './use-template-group-management';

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
  const initialSidebarPreferences = useMemo<SidebarPreferences>(() => loadSidebarPreferences(), []);
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
    if (selectedElementId === null) {
      return null;
    }

    const definition = currentDocument.animations.find((animation) => animation.elementId === selectedElementId);

    return definition?.config ?? null;
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

  const {
    handleCreateFromPreset,
    handleDebugSnapshotDownload,
    handleDeleteSnapshot,
    handleExportFormat,
    handleImportFileChange,
    handleMediaSelect,
    handleOpenImportDialog,
    handleRestoreSnapshot,
    handleSaveAsJson,
    handleSaveDocument,
    handleSaveSnapshot,
    handleTemplateSelect,
  } = useDemoFileHandlers({
    currentDocument,
    editorStore,
    fileInputRef,
    pushToast,
    setActiveDialog,
  });
  const {
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
  } = useCanvasControlHandlers({
    editorStore,
    pushToast,
    selectedMovableElements,
    setIsPlaying,
    setResetToken,
  });

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
  }, [currentDocument.canvas.width, editorStore, pushToast]);

  const {
    handleCanvasClick,
    handleCanvasContextMenu,
    handleCopySelection,
    handleCutSelection,
    handleDuplicateSelection,
    handleElementSelect,
    handlePropertyUpdate,
    handleSidebarTabToggle,
  } = useCommandHandlers({
    activeElementIds: editorState.activeElementIds,
    clipboardRef,
    currentDocumentCanvas: currentDocument.canvas,
    currentDocumentElements: currentDocument.elements,
    editorStore,
    pasteClipboardElements,
    pushToast,
    selectedElement,
    setContextMenu,
    setIsSidebarOpen,
    setSidebarTab,
    sidebarTab,
  });

  const {
    availableDocuments,
    handleAddMember,
    handleCreateGroup,
    handleRemoveGroup,
    handleRemoveMember,
    handleRenameGroup,
    handleUpdateMemberRole,
  } = useTemplateGroupManagement({
    currentDocument,
    setTemplateGroups,
    templateGroups,
  });

  const sidebarPanel = (
    <DemoSidebarPanel
      activeElementIds={editorState.activeElementIds}
      animationConfig={animationConfig}
      availableDocuments={availableDocuments}
      currentDocumentMode={currentDocument.documentMode}
      handleAddMember={handleAddMember}
      handleCreateGroup={handleCreateGroup}
      handleRemoveGroup={handleRemoveGroup}
      handleRemoveMember={handleRemoveMember}
      handleRenameGroup={handleRenameGroup}
      handleUpdateMemberRole={handleUpdateMemberRole}
      layers={layers}
      onRemoveElement={(elementId) => {
        editorStore.getState().removeElement(elementId);
      }}
      onSelectElement={(elementId) => {
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
      onUpdateProperty={handlePropertyUpdate}
      preflightIssues={preflightIssues}
      selectedElement={selectedElement}
      setEditingTimeline={setEditingTimeline}
      setEditingTimelineSelectedKf={setEditingTimelineSelectedKf}
      sidebarTab={sidebarTab}
      templateGroups={templateGroups}
    />
  );

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

  useShellBrowserEffects({
    editorStore,
    handleSaveDocument,
    setContextMenu,
    setIsFullscreen,
    setViewportSize,
  });

  return (
    <DemoAppLayout
      activeDialog={activeDialog}
      clipboardRef={clipboardRef}
      contextMenu={contextMenu}
      contextMenuElement={contextMenuElement}
      currentDocument={currentDocument}
      dataStore={dataStore}
      destructiveContextActionDisabled={destructiveContextActionDisabled}
      editingTimeline={editingTimeline}
      editingTimelineSelectedKf={editingTimelineSelectedKf}
      editorState={editorState}
      editorStore={editorStore}
      fileInputRef={fileInputRef}
      handleAlignSelection={handleAlignSelection}
      handleCanvasClick={handleCanvasClick}
      handleCanvasContextMenu={handleCanvasContextMenu}
      handleCanvasViewportChange={handleCanvasViewportChange}
      handleCopySelection={handleCopySelection}
      handleCreateFromPreset={handleCreateFromPreset}
      handleCutSelection={handleCutSelection}
      handleDebugSnapshotDownload={handleDebugSnapshotDownload}
      handleDeleteSnapshot={handleDeleteSnapshot}
      handleDistributeSelection={handleDistributeSelection}
      handleDuplicateSelection={handleDuplicateSelection}
      handleElementSelect={handleElementSelect}
      handleElementTransformCommit={handleElementTransformCommit}
      handleElementTransformPreview={handleElementTransformPreview}
      handleExportFormat={handleExportFormat}
      handleImportFileChange={handleImportFileChange}
      handleMediaSelect={handleMediaSelect}
      handleOpenImportDialog={handleOpenImportDialog}
      handleResetPlayback={handleResetPlayback}
      handleResetZoom={handleResetZoom}
      handleRestoreSnapshot={handleRestoreSnapshot}
      handleSaveAsJson={handleSaveAsJson}
      handleSaveDocument={handleSaveDocument}
      handleSaveSnapshot={handleSaveSnapshot}
      handleSidebarTabToggle={handleSidebarTabToggle}
      handleTemplateSelect={handleTemplateSelect}
      handleToggleFullscreen={handleToggleFullscreen}
      handleTogglePlayback={handleTogglePlayback}
      handleZoomStep={handleZoomStep}
      handleZoomToFit={handleZoomToFit}
      hasGroupedSelection={hasGroupedSelection}
      horizontalTicks={horizontalTicks}
      isFullscreen={isFullscreen}
      isPlaying={isPlaying}
      isSidebarOpen={isSidebarOpen}
      pasteClipboardElements={pasteClipboardElements}
      placementLabel={placementLabel}
      pushToast={pushToast}
      resetToken={resetToken}
      resolutionLabel={resolutionLabel}
      selectedElement={selectedElement}
      selectedElements={selectedElements}
      selectedMovableElements={selectedMovableElements}
      setActiveDialog={setActiveDialog}
      setContextMenu={setContextMenu}
      setEditingTimeline={setEditingTimeline}
      setEditingTimelineSelectedKf={setEditingTimelineSelectedKf}
      setIsSidebarOpen={setIsSidebarOpen}
      setSidebarWidth={setSidebarWidth}
      sidebarPanel={sidebarPanel}
      sidebarTab={sidebarTab}
      sidebarWidth={sidebarWidth}
      temporalState={temporalState}
      verticalTicks={verticalTicks}
    />
  );
}
