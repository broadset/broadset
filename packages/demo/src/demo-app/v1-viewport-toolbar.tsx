import type { ProjectEditorStore } from '@broadset/editor';
import { Separator, Toolbar } from '@heroui/react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { useCanvasZoomPercent, useEditorSelector } from './helpers';

interface V1ViewportToolbarProps {
  readonly editorStore: ProjectEditorStore;
}

function updateZoom(editorStore: ProjectEditorStore, delta: number): void {
  const current = editorStore.getState().canvasSettings.zoom;
  const zoom = Math.max(0.1, Math.min(4, Math.round((current + delta) * 100) / 100));

  editorStore.getState().updateCanvasSettings({ zoom });
}

export function V1ViewportToolbar({ editorStore }: V1ViewportToolbarProps): React.JSX.Element {
  const zoomPercent = useCanvasZoomPercent(editorStore);
  const undoCount = useEditorSelector(editorStore.temporal, (state) => state.pastStates.length);
  const redoCount = useEditorSelector(editorStore.temporal, (state) => state.futureStates.length);

  return (
    <Toolbar aria-label="Main editor toolbar" isAttached>
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
