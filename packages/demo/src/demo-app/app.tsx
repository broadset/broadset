import {
  type ChangeStream,
  createChangeStream,
  createDataStore,
  createEditorStore,
  diffDocuments,
  type EditorStore,
  type PluginDefaults,
  runPreflightDiagnostics,
} from '@broadset/editor';
import {
  type BroadsetElement,
  broadsetProjectSchema,
  type CanvasSettings,
  type TemplateGroup,
  type Timeline,
} from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { type MediaAsset, type PreflightIssue } from '@broadset/ui';
import { toast } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ActiveDialog,
  type ContextMenuState,
  SIDEBAR_STORAGE_KEY,
  type SidebarPreferences,
  type SidebarTab,
  TOAST_DISMISS_MS,
  type ToastSeverity,
} from '../demo-types';
import {
  buildLayerInfoList,
  buildRenderableDocumentForActivePage,
  clampSidebarWidth,
  formatResolutionLabel,
  loadSavedDocument,
  loadSidebarPreferences,
  reorderDocumentLayers,
} from '../demo-utils';
import { COUNTDOWN_PLUGIN, DEMO_EDITOR_CONFIG } from '../demoConfig';
import { SAMPLE_PROJECT } from '../sampleDocument';
import { useLiveData } from '../useLiveData';
import { useCommandHandlers } from './command-handlers';
import { getElementLabel, useEditorSelector } from './helpers';
import { DemoAppLayout } from './layout';
import { DemoSidebarPanel } from './sidebar';
import { useAnimationEditing } from './use-animation-editing';
import { useCanvasControlHandlers } from './use-canvas-control-handlers';
import { useDemoFileHandlers } from './use-demo-file-handlers';
import { useShellBrowserEffects } from './use-shell-browser-effects';
import { useTemplateGroupManagement } from './use-template-group-management';

const DEBUG_CHANGE_STREAM_STORAGE_KEY = 'broadset:debug-change-stream';

function isChangeStreamDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DEBUG_CHANGE_STREAM_STORAGE_KEY) === '1';
}

// Viewport fields (zoom/panX/panY) intentionally excluded so DemoApp does not
// re-render on every pan/zoom RAF tick. Those are read via dedicated
// subscriptions inside DemoCanvasSurface, DemoRulers, and ZoomPercentDisplay.
function areCanvasSettingsEqualIgnoringViewport(left: CanvasSettings, right: CanvasSettings): boolean {
  return (
    left.showRulers === right.showRulers &&
    left.units === right.units &&
    left.viewMode === right.viewMode &&
    left.perspective === right.perspective &&
    left.originX === right.originX &&
    left.originY === right.originY &&
    left.guides === right.guides &&
    left.grid === right.grid &&
    left.showExperimentalFeatures === right.showExperimentalFeatures
  );
}

function areEditorStateEqualIgnoringCanvas(
  left: ReturnType<EditorStore['getState']>,
  right: ReturnType<EditorStore['getState']>,
): boolean {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left) as ReadonlyArray<keyof ReturnType<EditorStore['getState']>>;

  for (const key of leftKeys) {
    if (key === 'canvasSettings') {
      continue;
    }

    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function resolveAssetSourceUrl(source: {
  readonly type: string;
  readonly url?: string;
  readonly dataUri?: string;
}): string | null {
  if (source.type === 'url') return source.url ?? null;
  if (source.type === 'embedded') return source.dataUri ?? null;

  return null;
}

const SAMPLE_MEDIA_ASSETS: readonly MediaAsset[] = (() => {
  const parsedProject = broadsetProjectSchema.safeParse(SAMPLE_PROJECT);

  if (!parsedProject.success) {
    return [];
  }

  return parsedProject.data.assets.flatMap((asset) => {
    const sourceUrl = resolveAssetSourceUrl(asset.source);

    if (sourceUrl === null) {
      return [];
    }

    return [
      {
        id: asset.id,
        name: asset.name,
        url: sourceUrl,
        category: asset.kind,
      },
    ];
  });
})();

export function DemoApp(): React.JSX.Element {
  const [editorStore] = useState<EditorStore>(() => {
    const store = createEditorStore({ config: DEMO_EDITOR_CONFIG });
    const initialDocument = loadSavedDocument();
    const initialSelectionId = initialDocument.elements.find((element) => !element.locked)?.id ?? null;

    store.getState().loadTemplate(initialDocument);

    if (initialSelectionId !== null) {
      store.getState().selectElement(initialSelectionId);
    }

    // Expose the store on window for CT tests to drive store-level state
    // (pan, zoom, selection) without relying on pointer-gesture plumbing.
    if (typeof window !== 'undefined') {
      (window as unknown as { __broadsetEditorStore?: EditorStore }).__broadsetEditorStore = store;
    }

    return store;
  });
  const [dataStore] = useState(() => createDataStore());
  const [changeStream] = useState<ChangeStream>(() => createChangeStream());

  const shouldLogChangeStream = isChangeStreamDebugEnabled();

  useLiveData(dataStore);

  useEffect(() => {
    let prevDoc = editorStore.getState().document;

    const unsubscribeStore = editorStore.subscribe((state) => {
      const nextDoc = state.document;

      if (nextDoc !== prevDoc) {
        if (!editorStore.temporal.getState().isTracking) {
          prevDoc = nextDoc;

          return;
        }

        const changes = diffDocuments(prevDoc, nextDoc);

        if (changes.length > 0) {
          changeStream.emit(changes);
        }

        prevDoc = nextDoc;
      }
    });

    let batchCount = 0;
    const unsubscribeStream =
      !shouldLogChangeStream ?
        () => {
          /* no-op */
        }
      : changeStream.subscribe((changes) => {
          batchCount += 1;
          console.info(`Change batch #${String(batchCount)}:`, changes.length, 'changes', changes);
        });

    return () => {
      unsubscribeStore();
      unsubscribeStream();
    };
  }, [editorStore, changeStream, shouldLogChangeStream]);

  const editorState = useEditorSelector(editorStore, (state) => state, areEditorStateEqualIgnoringCanvas);
  const canvasSettings = useEditorSelector(
    editorStore,
    (state) => state.canvasSettings,
    areCanvasSettingsEqualIgnoringViewport,
  );
  const temporalState = editorStore.temporal.getState();
  const currentDocument = editorState.document;
  const initialSidebarPreferences = useMemo<SidebarPreferences>(() => loadSidebarPreferences(), []);
  const selectedElementId = editorState.activeElementIds[0] ?? null;
  const selectedElement =
    selectedElementId === null ? null : (
      (currentDocument.elements.find((element) => element.id === selectedElementId) ?? null)
    );
  const selectedElementInstance =
    selectedElementId === null ? null : (
      (currentDocument.pages[editorState.activePageIndex]?.elements.find(
        (inst) => inst.elementId === selectedElementId,
      ) ?? null)
    );
  const renderDocument = useMemo(
    () => buildRenderableDocumentForActivePage(currentDocument, editorState.activePageIndex, SAMPLE_PROJECT.assets),
    [currentDocument, editorState.activePageIndex],
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarPreferences.isOpen);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(initialSidebarPreferences.tab);
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarPreferences.width);
  const isExperimental = canvasSettings.showExperimentalFeatures;
  const preflightIssues = useMemo<readonly PreflightIssue[]>(() => {
    if (!isExperimental || sidebarTab !== 'preflight') {
      return [];
    }

    const diagnostics = runPreflightDiagnostics(currentDocument, {});

    return diagnostics.map((d) => ({
      id: `${d.rule}:${d.elementName}`,
      severity: d.severity,
      message: d.message,
      elementName: d.elementName,
      ruleId: d.rule,
    }));
  }, [currentDocument, isExperimental, sidebarTab]);

  const animationConfig = useMemo(() => {
    if (selectedElementId === null) {
      return null;
    }

    const definition = currentDocument.animations.find((animation) => animation.elementId === selectedElementId);

    return definition?.config ?? null;
  }, [currentDocument, selectedElementId]);

  const activePlacementType =
    editorState.placement !== null && 'elementType' in editorState.placement ? editorState.placement.elementType : null;
  const placementLabel = getElementLabel(activePlacementType);
  const clipboardRef = useRef<readonly BroadsetElement[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playbackControllerRef = useRef<PlaybackController | null>(null);
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
    () => buildLayerInfoList(currentDocument, editorState.activePageIndex),
    [currentDocument, editorState.activePageIndex],
  );
  const mediaAssets = SAMPLE_MEDIA_ASSETS;

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
    exportProgress,
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
    renderDocument,
    editorStore,
    fileInputRef,
    playbackControllerRef,
    pushToast,
    setActiveDialog,
    projectAssets: SAMPLE_PROJECT.assets,
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
    // Deep-clone each element so pasted copies do not share nested mutable
    // state (style, transforms…). Without this, editing a nested field on one
    // pasted copy would mutate its siblings.
    const clonedElements = (JSON.parse(JSON.stringify(clipboardRef.current)) as readonly BroadsetElement[]).map(
      (element) => ({
        ...element,
        id: crypto.randomUUID(),
        name: `${element.name} Copy`,
        position: {
          x: element.position.x + pasteOffset,
          y: element.position.y + pasteOffset,
        },
      }),
    );

    editorStore.setState((state) => ({
      activeElementIds: clonedElements.map((element) => element.id),
      document: {
        ...state.document,
        elements: [...state.document.elements, ...clonedElements],
      },
      editingMode: { type: 'none' },
      pathDrawingElementId: null,
      pathEditingElementId: null,
      placement: null,
      placementPreview: null,
    }));
    setContextMenu(null);
    pushToast('success', `Pasted ${String(clonedElements.length)} element${clonedElements.length === 1 ? '' : 's'}.`);
  }, [currentDocument.canvas.width, editorStore, pushToast]);

  const placementPlugins = useMemo<readonly PluginDefaults[]>(
    () => [
      {
        type: COUNTDOWN_PLUGIN.type,
        label: COUNTDOWN_PLUGIN.label,
        ...(COUNTDOWN_PLUGIN.defaults === undefined ? {} : { defaults: COUNTDOWN_PLUGIN.defaults }),
      },
    ],
    [],
  );

  const {
    handleCanvasClick,
    handleCanvasContextMenu,
    handleCanvasPointerMove,
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
    placementPlugins,
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

  const animationEditing = useAnimationEditing({
    currentDocument,
    selectedElementId,
    editorStore,
    playbackControllerRef,
    pushToast,
    editingTimeline,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
  });

  const sidebarPanel = useMemo(
    () => (
      <DemoSidebarPanel
        activeElementIds={editorState.activeElementIds}
        animationConfig={animationConfig}
        availableDocuments={availableDocuments}
        currentDocumentMode={currentDocument.documentMode}
        editorStore={editorStore}
        editingTimeline={editingTimeline}
        editingTimelineSelectedKf={editingTimelineSelectedKf}
        handleAddMember={handleAddMember}
        handleCreateGroup={handleCreateGroup}
        handleRemoveGroup={handleRemoveGroup}
        handleRemoveMember={handleRemoveMember}
        handleRenameGroup={handleRenameGroup}
        handleUpdateMemberRole={handleUpdateMemberRole}
        layers={layers}
        onAnimationAddModifierBinding={animationEditing.onAddModifierBinding}
        onAnimationAddStateBinding={animationEditing.onAddStateBinding}
        onAnimationAddTimeline={animationEditing.onAddTimeline}
        onAnimationDeleteTimeline={animationEditing.onDeleteTimeline}
        onAnimationDuplicateTimeline={animationEditing.onDuplicateTimeline}
        onAnimationEditTimeline={animationEditing.onEditTimeline}
        onAnimationQuickSetup={animationEditing.onQuickSetup}
        onAnimationRemoveModifierBinding={animationEditing.onRemoveModifierBinding}
        onAnimationRemoveStateBinding={animationEditing.onRemoveStateBinding}
        onAnimationRenameTimeline={animationEditing.onRenameTimeline}
        onAnimationSelectState={animationEditing.onSelectState}
        onAnimationToggleModifier={animationEditing.onToggleModifier}
        onRemoveElement={(elementId) => {
          editorStore.getState().removeElement(elementId);
        }}
        onSelectElement={(elementId) => {
          editorStore.getState().selectElement(elementId);
        }}
        onToggleLock={(elementId) => {
          editorStore.getState().toggleLock(elementId);
        }}
        onReorderLayers={(dragId, targetId, position) => {
          editorStore.setState((state) => {
            const nextDocument = reorderDocumentLayers(state.document, dragId, targetId, position);

            return nextDocument === state.document ? {} : { document: nextDocument };
          });
        }}
        onToggleVisibility={(elementId) => {
          editorStore.getState().toggleVisibility(elementId);
        }}
        onUpdateProperty={handlePropertyUpdate}
        preflightIssues={preflightIssues}
        selectedElement={selectedElement}
        selectedElementInstance={selectedElementInstance}
        setEditingTimeline={setEditingTimeline}
        setEditingTimelineSelectedKf={setEditingTimelineSelectedKf}
        sidebarTab={sidebarTab}
        templateGroups={templateGroups}
        timelinePreviewActiveModifiers={animationEditing.activeModifiers}
        timelinePreviewActiveState={animationEditing.activeState}
        mediaAssets={mediaAssets}
        canvasWidth={currentDocument.canvas.width}
        canvasHeight={currentDocument.canvas.height}
        documentUnit={isExperimental ? currentDocument.canvas.unit : 'px'}
      />
    ),
    [
      animationConfig,
      animationEditing.activeModifiers,
      animationEditing.activeState,
      animationEditing.onAddModifierBinding,
      animationEditing.onAddStateBinding,
      animationEditing.onAddTimeline,
      animationEditing.onDeleteTimeline,
      animationEditing.onDuplicateTimeline,
      animationEditing.onEditTimeline,
      animationEditing.onQuickSetup,
      animationEditing.onRemoveModifierBinding,
      animationEditing.onRemoveStateBinding,
      animationEditing.onRenameTimeline,
      animationEditing.onSelectState,
      animationEditing.onToggleModifier,
      availableDocuments,
      currentDocument.canvas.height,
      currentDocument.canvas.unit,
      currentDocument.canvas.width,
      currentDocument.documentMode,
      editingTimeline,
      editingTimelineSelectedKf,
      editorState.activeElementIds,
      editorStore,
      handleAddMember,
      handleCreateGroup,
      handlePropertyUpdate,
      handleRemoveGroup,
      handleRemoveMember,
      handleRenameGroup,
      handleUpdateMemberRole,
      isExperimental,
      layers,
      mediaAssets,
      preflightIssues,
      selectedElement,
      selectedElementInstance,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
      sidebarTab,
      templateGroups,
    ],
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
    if (isExperimental) {
      return;
    }

    if (sidebarTab === 'animation' || sidebarTab === 'preflight' || sidebarTab === 'template-groups') {
      setSidebarTab('layers');
    }

    if (editingTimeline !== null) {
      setEditingTimeline(null);
      setEditingTimelineSelectedKf(null);
    }

    if (activeDialog === 'export' || activeDialog === 'template-browser') {
      setActiveDialog(null);
    }
  }, [activeDialog, editingTimeline, isExperimental, sidebarTab]);

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
      canvasSettings={canvasSettings}
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
      handleAnimationAddKeyframe={animationEditing.onAddKeyframe}
      handleAnimationAddModifierBinding={animationEditing.onAddModifierBinding}
      handleAnimationAddStateBinding={animationEditing.onAddStateBinding}
      handleAnimationAddTimeline={animationEditing.onAddTimeline}
      handleAnimationChangeEasing={animationEditing.onChangeEasing}
      handleAnimationDeleteTimeline={animationEditing.onDeleteTimeline}
      handleAnimationDuplicateTimeline={animationEditing.onDuplicateTimeline}
      handleAnimationEditTimeline={animationEditing.onEditTimeline}
      handleAnimationMoveKeyframe={animationEditing.onMoveKeyframe}
      handleAnimationPlayTimeline={animationEditing.onPlayTimeline}
      handleAnimationQuickSetup={animationEditing.onQuickSetup}
      handleAnimationRemoveModifierBinding={animationEditing.onRemoveModifierBinding}
      handleAnimationRemoveStateBinding={animationEditing.onRemoveStateBinding}
      handleAnimationRenameTimeline={animationEditing.onRenameTimeline}
      handleAnimationSeekTimeline={animationEditing.onSeekTimeline}
      handleAnimationSelectState={animationEditing.onSelectState}
      handleAnimationStopTimeline={animationEditing.onStopTimeline}
      handleAnimationToggleModifier={animationEditing.onToggleModifier}
      handleAlignSelection={handleAlignSelection}
      handleCanvasClick={handleCanvasClick}
      handleCanvasContextMenu={handleCanvasContextMenu}
      handleCanvasPointerMove={handleCanvasPointerMove}
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
      exportProgress={exportProgress}
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
      isFullscreen={isFullscreen}
      isPlaying={isPlaying}
      isSidebarOpen={isSidebarOpen}
      isTimelinePreviewPlaying={animationEditing.isTimelinePlaying}
      pasteClipboardElements={pasteClipboardElements}
      placementLabel={placementLabel}
      pushToast={pushToast}
      renderDocument={renderDocument}
      resetToken={resetToken}
      resolutionLabel={resolutionLabel}
      selectedElement={selectedElement}
      selectedElements={selectedElements}
      selectedMovableElements={selectedMovableElements}
      setPreviewPlaybackController={animationEditing.registerPlaybackController}
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
      timelinePreviewActiveModifiers={animationEditing.activeModifiers}
      timelinePreviewActiveState={animationEditing.activeState}
      timelinePreviewCurrentTimeMs={animationEditing.currentTimeMs}
      viewportSize={viewportSize}
    />
  );
}
