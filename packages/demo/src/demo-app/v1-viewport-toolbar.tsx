import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { CanvasSettingsModal } from '@broadset/ui';
import { Dropdown, Separator, toast, Toolbar } from '@heroui/react';
import { FolderOpen, Grid3X3, Layers, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { IconToolButton, ToolbarMenu } from '../demo-components';
import { useCanvasZoomPercent, useEditorSelector } from './helpers';
import { type V1HostDialog, V1HostDialogs } from './v1-host-dialogs';

interface V1ViewportToolbarProps {
  readonly editorStore: ProjectEditorStore;
}

const EMPTY_PAGES: readonly projectFormatV1.PageDefinition[] = [];

function updateZoom(editorStore: ProjectEditorStore, delta: number): void {
  const current = editorStore.getState().canvasSettings.zoom;
  const zoom = Math.max(0.1, Math.min(4, Math.round((current + delta) * 100) / 100));

  editorStore.getState().updateCanvasSettings({ zoom });
}

function V1ViewMenu({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const showRulers = useEditorSelector(editorStore, (state) => state.canvasSettings.showRulers);
  const showGrid = useEditorSelector(editorStore, (state) => state.gridSettings.showGrid);
  const snapToGrid = useEditorSelector(editorStore, (state) => state.gridSettings.snapToGrid);

  return (
    <ToolbarMenu icon={<Grid3X3 aria-hidden="true" size={16} />} label="View">
      <Dropdown.Item
        key="show-rulers"
        onAction={() => {
          editorStore.getState().updateCanvasSettings({ showRulers: !showRulers });
        }}
      >
        Show rulers
      </Dropdown.Item>
      <Dropdown.Item
        key="show-grid"
        onAction={() => {
          editorStore.getState().updateGridSettings({ showGrid: !showGrid });
        }}
      >
        Show grid
      </Dropdown.Item>
      <Dropdown.Item
        key="snap-grid"
        onAction={() => {
          editorStore.getState().updateGridSettings({ snapToGrid: !snapToGrid });
        }}
      >
        Snap to grid
      </Dropdown.Item>
    </ToolbarMenu>
  );
}

function V1FileMenu({
  editorStore,
  onDialogOpen,
  onSettingsOpen,
}: {
  readonly editorStore: ProjectEditorStore;
  readonly onDialogOpen: (dialog: Exclude<V1HostDialog, null>) => void;
  readonly onSettingsOpen: () => void;
}): React.JSX.Element {
  const snapshots = useEditorSelector(editorStore, (state) => state.snapshots);

  return (
    <ToolbarMenu icon={<FolderOpen aria-hidden="true" size={16} />} label="File">
      <Dropdown.Item
        key="new-document"
        onAction={() => {
          onDialogOpen('new-document');
        }}
      >
        New Document
      </Dropdown.Item>
      <Dropdown.Item
        key="media-library"
        onAction={() => {
          onDialogOpen('media-library');
        }}
      >
        Media Library
      </Dropdown.Item>
      <Dropdown.Item key="document-settings" onAction={onSettingsOpen}>
        Document Settings
      </Dropdown.Item>
      <Dropdown.Item
        key="save-snapshot"
        onAction={() => {
          const name = window.prompt('Snapshot name:')?.trim();

          if (name === undefined || name === '') return;

          if (editorStore.getState().createSnapshot(name) === null) {
            toast.danger('Snapshot name must be unique and the 20-snapshot limit cannot be exceeded.', {
              timeout: 5000,
            });
          } else {
            toast.success(`Snapshot ${name} saved.`, { timeout: 3000 });
          }
        }}
      >
        <span>Save Snapshot</span>
        {snapshots.length === 0 ? null : <span>{snapshots.length}</span>}
      </Dropdown.Item>
      {snapshots.map((snapshot) => (
        <Dropdown.Item
          key={`restore-${snapshot.id}`}
          onAction={() => {
            if (editorStore.getState().restoreSnapshot(snapshot.id)) {
              toast.success(`Snapshot ${snapshot.name} restored.`, { timeout: 3000 });
            }
          }}
        >
          {snapshot.name}
        </Dropdown.Item>
      ))}
      {snapshots.map((snapshot) => (
        <Dropdown.Item
          key={`rename-${snapshot.id}`}
          onAction={() => {
            const name = window.prompt('Rename snapshot:', snapshot.name)?.trim();

            if (name !== undefined && name !== '') {
              if (editorStore.getState().renameSnapshot(snapshot.id, name)) {
                toast.success(`Snapshot renamed to ${name}.`, { timeout: 3000 });
              } else {
                toast.danger('Snapshot names must be non-empty and unique.', { timeout: 5000 });
              }
            }
          }}
        >
          Rename {snapshot.name}
        </Dropdown.Item>
      ))}
      {snapshots.map((snapshot) => (
        <Dropdown.Item
          key={`delete-${snapshot.id}`}
          onAction={() => {
            if (editorStore.getState().deleteSnapshot(snapshot.id)) {
              toast.info(`Snapshot ${snapshot.name} deleted.`, { timeout: 3000 });
            }
          }}
        >
          Delete {snapshot.name}
        </Dropdown.Item>
      ))}
    </ToolbarMenu>
  );
}

function V1HelpMenu({
  onDialogOpen,
}: {
  readonly onDialogOpen: (dialog: Exclude<V1HostDialog, null>) => void;
}): React.JSX.Element {
  return (
    <ToolbarMenu icon={<span aria-hidden="true">?</span>} label="Help">
      <Dropdown.Item
        key="shortcuts"
        onAction={() => {
          onDialogOpen('shortcuts');
        }}
      >
        Keyboard shortcuts
      </Dropdown.Item>
      <Dropdown.Item
        key="about"
        onAction={() => {
          onDialogOpen('about');
        }}
      >
        About
      </Dropdown.Item>
    </ToolbarMenu>
  );
}

function V1ScenesMenu({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const [message, setMessage] = useState('');
  const pages = useEditorSelector(
    editorStore,
    (state) => state.project.documents.find((document) => document.id === state.activeDocumentId)?.pages ?? EMPTY_PAGES,
  );
  const activePageId = useEditorSelector(editorStore, (state) => state.activePageId);

  useEffect(() => {
    if (message === '') return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message]);

  return (
    <>
      <ToolbarMenu icon={<Layers aria-hidden="true" size={16} />} label="Scenes">
        {pages.map((page) => (
          <Dropdown.Item
            key={page.id}
            onAction={() => {
              editorStore.getState().setActivePage(page.id);
            }}
          >
            {page.name}
          </Dropdown.Item>
        ))}
        <Dropdown.Item
          key="add-scene"
          onAction={() => {
            const state = editorStore.getState();
            const page = projectFormatV1.createPageV1({
              id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
              name: `Scene ${String(pages.length + 1)}`,
            });

            if (state.addPage(page)) {
              state.setActivePage(page.id);
              setMessage('Added a new scene.');
            }
          }}
        >
          Add scene
        </Dropdown.Item>
        <Dropdown.Item
          key="remove-scene"
          isDisabled={pages.length <= 1}
          onAction={() => {
            editorStore.getState().removePage(activePageId);
          }}
        >
          Remove scene
        </Dropdown.Item>
      </ToolbarMenu>
      {message === '' ? null : <span role="status">{message}</span>}
    </>
  );
}

export function V1ViewportToolbar({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<V1HostDialog>(null);
  const zoomPercent = useCanvasZoomPercent(editorStore);
  const undoCount = useEditorSelector(editorStore.temporal, (state) => state.pastStates.length);
  const redoCount = useEditorSelector(editorStore.temporal, (state) => state.futureStates.length);
  const canvasSettings = useEditorSelector(editorStore, (state) => state.canvasSettings);
  const gridSettings = useEditorSelector(editorStore, (state) => state.gridSettings);
  const document = useEditorSelector(editorStore, (state) =>
    state.project.documents.find((candidate) => candidate.id === state.activeDocumentId),
  );

  return (
    <>
      <Toolbar aria-label="Main editor toolbar" isAttached>
        <V1FileMenu
          editorStore={editorStore}
          onDialogOpen={setActiveDialog}
          onSettingsOpen={() => {
            setSettingsOpen(true);
          }}
        />
        <V1ViewMenu editorStore={editorStore} />
        <V1ScenesMenu editorStore={editorStore} />
        <V1HelpMenu onDialogOpen={setActiveDialog} />
        <Separator orientation="vertical" />
        <IconToolButton
          isDisabled={undoCount === 0}
          label="Undo"
          onPress={() => {
            editorStore.getState().undo();
          }}
        >
          <RotateCcw aria-hidden="true" size={16} />
        </IconToolButton>
        <IconToolButton
          isDisabled={redoCount === 0}
          label="Redo"
          onPress={() => {
            editorStore.getState().redo();
          }}
        >
          <RotateCcw aria-hidden="true" size={16} style={{ transform: 'scaleX(-1)' }} />
        </IconToolButton>
        <Separator orientation="vertical" />
        <IconToolButton
          label="Zoom out"
          onPress={() => {
            updateZoom(editorStore, -0.1);
          }}
        >
          <Minus aria-hidden="true" size={16} />
        </IconToolButton>
        <IconToolButton
          label="Zoom to fit"
          onPress={() => {
            editorStore.getState().updateCanvasSettings({ panX: 0, panY: 0, zoom: 1 });
          }}
        >
          <Maximize2 aria-hidden="true" size={16} />
        </IconToolButton>
        <IconToolButton
          label="Zoom in"
          onPress={() => {
            updateZoom(editorStore, 0.1);
          }}
        >
          <Plus aria-hidden="true" size={16} />
        </IconToolButton>
        <span aria-label="Zoom level">{zoomPercent}%</span>
      </Toolbar>
      <CanvasSettingsModal
        documentName={document?.name ?? 'Untitled'}
        gridSize={gridSettings.gridSize}
        isOpen={settingsOpen}
        perspective={canvasSettings.perspective}
        rulerUnit={canvasSettings.units}
        showExperimentalFeatures={canvasSettings.showExperimentalFeatures}
        showGrid={gridSettings.showGrid}
        showRulers={canvasSettings.showRulers}
        snapThreshold={gridSettings.snapThreshold}
        snapToGrid={gridSettings.snapToGrid}
        viewMode={canvasSettings.viewMode}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onDocumentNameChange={(name) => {
          editorStore.getState().updateActiveDocument((activeDocument) => ({ ...activeDocument, name }));
        }}
        onGridChange={(changes) => {
          editorStore.getState().updateGridSettings(changes);
        }}
        onPerspectiveChange={(perspective) => {
          editorStore.getState().updateCanvasSettings({ perspective });
        }}
        onRulerChange={(showRulers) => {
          editorStore.getState().updateCanvasSettings({ showRulers });
        }}
        onRulerUnitChange={(units) => {
          if (units === 'in' || units === 'mm' || units === 'px')
            editorStore.getState().updateCanvasSettings({ units });
        }}
        onShowExperimentalFeaturesChange={(showExperimentalFeatures) => {
          editorStore.getState().updateCanvasSettings({ showExperimentalFeatures });
        }}
        onViewModeChange={(viewMode) => {
          if (viewMode === 'broadcast' || viewMode === 'none' || viewMode === 'print') {
            editorStore.getState().updateCanvasSettings({ viewMode });
          }
        }}
      />
      <V1HostDialogs
        activeDialog={activeDialog}
        editorStore={editorStore}
        onClose={() => {
          setActiveDialog(null);
        }}
      />
    </>
  );
}
