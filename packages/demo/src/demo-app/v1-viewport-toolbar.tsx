import type { ProjectEditorStore } from '@broadset/editor';
import { Toolbar } from '@heroui/react';
import { Maximize2, Minus, Plus } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { useCanvasZoomPercent } from './helpers';

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

  return (
    <Toolbar aria-label="Canvas viewport toolbar" isAttached>
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
