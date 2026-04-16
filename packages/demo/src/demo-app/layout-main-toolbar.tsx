import { glassPanelStyle, sp } from '@broadset/ui';
import { Chip, Dropdown, Toolbar, Tooltip } from '@heroui/react';
import {
  Bug,
  Camera,
  CheckCircle2,
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
  Plus,
  RotateCcw,
  Ruler,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';

import { ToolbarMenu } from '../demo-components';
import { FLOATING_OFFSET } from '../demo-types';
import { LayoutToolbarActions } from './layout-toolbar-actions';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutMainToolbar(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    canvasSettings,
    currentDocument,
    editorState,
    editorStore,
    handleDebugSnapshotDownload,
    handleDeleteSnapshot,
    handleOpenImportDialog,
    handleResetZoom,
    handleRestoreSnapshot,
    handleSaveAsJson,
    handleSaveSnapshot,
    handleZoomToFit,
    pushToast,
    setActiveDialog,
  } = props;

  return (
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
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteSnapshot(snapshot.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.stopPropagation();
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
                editorStore.getState().updateCanvasSettings({ showRulers: !canvasSettings.showRulers });
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Ruler size={14} />
                <span>Show rulers</span>
                {canvasSettings.showRulers ?
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
                editorStore.getState().updateGridSettings({ snapToGrid: !editorState.gridSettings.snapToGrid });
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
                {canvasSettings.units === 'px' ?
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
                {canvasSettings.units === 'mm' ?
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
                {canvasSettings.units === 'in' ?
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
                {canvasSettings.viewMode === 'none' ?
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
                {canvasSettings.viewMode === 'broadcast' ?
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
                {canvasSettings.viewMode === 'print' ?
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
        <LayoutToolbarActions {...props} />
      </Toolbar>
    </div>
  );
}
