import { type createDataStore, type EditorStore, type ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement, Timeline } from '@broadset/model';

import type { DocumentPreset, MediaAsset, TemplateEntry } from '../../../ui/src/modals/types';
import type { ActiveDialog, ContextMenuState, SidebarTab } from '../demo-types';

export interface DemoAppLayoutProps {
  readonly activeDialog: ActiveDialog;
  readonly clipboardRef: { current: readonly BroadsetElement[] };
  readonly contextMenu: ContextMenuState | null;
  readonly contextMenuElement: BroadsetElement | null;
  readonly currentDocument: BroadsetDocument;
  readonly dataStore: ReturnType<typeof createDataStore>;
  readonly destructiveContextActionDisabled: boolean;
  readonly editingTimeline: Timeline | null;
  readonly editingTimelineSelectedKf: number | null;
  readonly editorState: ReturnType<EditorStore['getState']>;
  readonly editorStore: EditorStore;
  readonly fileInputRef: { current: HTMLInputElement | null };
  readonly handleCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly handleCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly handleCanvasViewportChange: (settings: {
    readonly panX?: number;
    readonly panY?: number;
    readonly zoom?: number;
  }) => void;
  readonly handleAlignSelection: (action: 'bottom' | 'center-x' | 'center-y' | 'left' | 'right' | 'top') => void;
  readonly handleCopySelection: () => void;
  readonly handleCreateFromPreset: (preset: DocumentPreset) => void;
  readonly handleCutSelection: () => void;
  readonly handleDebugSnapshotDownload: () => void;
  readonly handleDeleteSnapshot: (snapshotId: string) => void;
  readonly handleDistributeSelection: (axis: 'horizontal' | 'vertical') => void;
  readonly handleDuplicateSelection: () => void;
  readonly handleElementSelect: (elementType: string) => void;
  readonly handleElementTransformCommit: (elementId: string, updates: ElementUpdate) => void;
  readonly handleElementTransformPreview: (elementId: string, updates: ElementUpdate) => void;
  readonly handleExportFormat: (exporter: string, data: Readonly<Record<string, unknown>>) => void;
  readonly handleImportFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly handleMediaSelect: (asset: MediaAsset) => void;
  readonly handleOpenImportDialog: () => void;
  readonly handleResetPlayback: () => void;
  readonly handleResetZoom: () => void;
  readonly handleRestoreSnapshot: (snapshotId: string) => void;
  readonly handleSaveAsJson: () => void;
  readonly handleSaveDocument: () => void;
  readonly handleSaveSnapshot: () => void;
  readonly handleSidebarTabToggle: (
    tab: 'animation' | 'layers' | 'preflight' | 'properties' | 'template-groups',
  ) => void;
  readonly handleTemplateSelect: (template: TemplateEntry) => void;
  readonly handleToggleFullscreen: () => Promise<void>;
  readonly handleTogglePlayback: () => void;
  readonly handleZoomStep: (delta: number) => void;
  readonly handleZoomToFit: () => void;
  readonly hasGroupedSelection: boolean;
  readonly horizontalTicks: readonly { readonly label: string; readonly position: number }[];
  readonly isFullscreen: boolean;
  readonly isPlaying: boolean;
  readonly isSidebarOpen: boolean;
  readonly pasteClipboardElements: () => void;
  readonly placementLabel: string;
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly resetToken: number;
  readonly resolutionLabel: string;
  readonly selectedElement: BroadsetElement | null;
  readonly selectedElements: readonly BroadsetElement[];
  readonly selectedMovableElements: readonly BroadsetElement[];
  readonly setActiveDialog: React.Dispatch<React.SetStateAction<ActiveDialog>>;
  readonly setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
  readonly setEditingTimeline: React.Dispatch<React.SetStateAction<Timeline | null>>;
  readonly setEditingTimelineSelectedKf: React.Dispatch<React.SetStateAction<number | null>>;
  readonly setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  readonly sidebarPanel: React.ReactNode;
  readonly sidebarTab: SidebarTab;
  readonly sidebarWidth: number;
  readonly temporalState: {
    readonly futureStates: readonly unknown[];
    readonly pastStates: readonly unknown[];
  };
  readonly verticalTicks: readonly { readonly label: string; readonly position: number }[];
}
