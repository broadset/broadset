import type { EditorStore } from '@broadset/editor';
import { color, font } from '@broadset/ui';

import { useCanvasZoomPercent } from './helpers';

export interface ZoomPercentDisplayProps {
  readonly editorStore: EditorStore;
}

export function ZoomPercentDisplay({ editorStore }: ZoomPercentDisplayProps): React.JSX.Element {
  const percent = useCanvasZoomPercent(editorStore);

  return (
    <span
      aria-label="Zoom level"
      style={{
        color: color('muted'),
        fontSize: font('label'),
        minWidth: '3rem',
        textAlign: 'right',
      }}
    >
      {percent}%
    </span>
  );
}
