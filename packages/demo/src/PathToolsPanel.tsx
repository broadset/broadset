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
    <div className="mt-3 border-t border-divider pt-2">
      <div className="mb-2 text-xs font-semibold">Path Tools</div>
      {props.editingMode.type === 'path-editing' ?
        <Button data-testid="exit-path-edit" onPress={props.onExitEditing} size="sm" variant="ghost">
          Exit Edit
        </Button>
      : props.editingMode.type === 'path-drawing' ?
        <Button data-testid="exit-path-draw" onPress={props.onExitDrawing} size="sm" variant="ghost">
          Stop Drawing
        </Button>
      : <div className="flex gap-1">
          <Button data-testid="enter-path-edit" onPress={props.onEnterEditing} size="sm" variant="ghost">
            Edit Path
          </Button>
          <Button data-testid="enter-path-draw" onPress={props.onEnterDrawing} size="sm" variant="ghost">
            Draw
          </Button>
        </div>
      }
      {props.editingMode.type === 'path-drawing' ?
        <div className="mt-1 text-[11px] text-default-500">
          Click canvas to add points. Escape to commit, Enter to close path.
        </div>
      : null}
    </div>
  );
}
