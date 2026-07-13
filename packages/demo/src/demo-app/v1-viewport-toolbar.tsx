import type { ProjectEditorStore } from '@broadset/editor';
import { CanvasSettingsModal } from '@broadset/ui';
import { Dropdown, Separator, Toolbar } from '@heroui/react';
import { FolderOpen, Grid3X3, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { IconToolButton, ToolbarMenu } from '../demo-components';
import { useCanvasZoomPercent, useEditorSelector } from './helpers';

interface V1ViewportToolbarProps {
  readonly editorStore: ProjectEditorStore;
}

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

function V1FileMenu({ onSettingsOpen }: { readonly onSettingsOpen: () => void }): React.JSX.Element {
  return (
    <ToolbarMenu icon={<FolderOpen aria-hidden="true" size={16} />} label="File">
      <Dropdown.Item key="document-settings" onAction={onSettingsOpen}>
        Document Settings
      </Dropdown.Item>
    </ToolbarMenu>
  );
}

export function V1ViewportToolbar({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false);
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
          onSettingsOpen={() => {
            setSettingsOpen(true);
          }}
        />
        <V1ViewMenu editorStore={editorStore} />
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
    </>
  );
}
