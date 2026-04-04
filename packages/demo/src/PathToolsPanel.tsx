import type { EditingMode } from '@broadset/editor';
import { Button } from '@heroui/react';
import type { JSX } from 'react';

interface PathToolsPanelProps {
  readonly editingMode: EditingMode;
  readonly onEnterEditing: () => void;
  readonly onExitEditing: () => void;
  readonly onEnterDrawing: () => void;
  readonly onExitDrawing: () => void;
}

export function PathToolsPanel(props: PathToolsPanelProps): JSX.Element {
  return (
    <div style={{ marginTop: 12, padding: 8, borderTop: '1px solid #ccc' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Path Tools</div>
      {props.editingMode.type === 'path-editing' ?
        <Button data-testid="exit-path-edit" onPress={props.onExitEditing} size="sm" variant="ghost">
          Exit Edit
        </Button>
      : props.editingMode.type === 'path-drawing' ?
        <Button data-testid="exit-path-draw" onPress={props.onExitDrawing} size="sm" variant="ghost">
          Stop Drawing
        </Button>
      : <div style={{ display: 'flex', gap: 4 }}>
          <Button data-testid="enter-path-edit" onPress={props.onEnterEditing} size="sm" variant="ghost">
            Edit Path
          </Button>
          <Button data-testid="enter-path-draw" onPress={props.onEnterDrawing} size="sm" variant="ghost">
            Draw
          </Button>
        </div>
      }
      {props.editingMode.type === 'path-drawing' ?
        <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
          Click canvas to add points. Escape to commit, Enter to close path.
        </div>
      : null}
    </div>
  );
}
