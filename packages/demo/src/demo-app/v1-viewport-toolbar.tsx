import type { ProjectEditorStore } from '@broadset/editor';
import { Dropdown, Separator, Toolbar } from '@heroui/react';
import { Grid3X3, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

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

export function V1ViewportToolbar({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const zoomPercent = useCanvasZoomPercent(editorStore);
  const undoCount = useEditorSelector(editorStore.temporal, (state) => state.pastStates.length);
  const redoCount = useEditorSelector(editorStore.temporal, (state) => state.futureStates.length);

  return (
    <Toolbar aria-label="Main editor toolbar" isAttached>
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
  );
}
