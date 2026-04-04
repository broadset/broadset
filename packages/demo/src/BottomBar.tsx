import { PageSorter } from '@broadset/ui';
import { Button } from '@heroui/react';
import type { JSX } from 'react';

interface BottomBarProps {
  readonly pages: readonly { readonly id: string }[];
  readonly activePageIndex: number;
  readonly onPageSelect: (index: number) => void;
  readonly onPageAdd: () => void;
  readonly onPageRemove: (index: number) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly showGrid: boolean;
  readonly onToggleGrid: () => void;
  readonly zoom: number;
  readonly isPlaying: boolean;
  readonly onPlayPause: () => void;
  readonly onReset: () => void;
  readonly timelineOpen: boolean;
  readonly onToggleTimeline: () => void;
}

export function BottomBar(props: BottomBarProps): JSX.Element {
  return (
    <div className="toolbar-glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-lg px-4 py-1.5">
      <PageSorter
        pages={props.pages}
        activePageIndex={props.activePageIndex}
        onPageSelect={props.onPageSelect}
        onPageAdd={props.onPageAdd}
        onPageRemove={props.onPageRemove}
      />
      <div className="flex items-center gap-2">
        <Button data-testid="undo-button" onPress={props.onUndo} size="sm" variant="ghost">
          Undo
        </Button>
        <Button data-testid="redo-button" onPress={props.onRedo} size="sm" variant="ghost">
          Redo
        </Button>
        <Button data-testid="grid-toggle" onPress={props.onToggleGrid} size="sm" variant="ghost">
          {props.showGrid ? 'Hide Grid' : 'Show Grid'}
        </Button>
        <span className="flex items-center text-xs text-default-500">Zoom: {Math.round(props.zoom * 100)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          data-testid="play-button"
          data-playing={String(props.isPlaying)}
          onPress={props.onPlayPause}
          size="sm"
          variant="ghost"
        >
          {props.isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button data-testid="reset-button" onPress={props.onReset} size="sm" variant="ghost">
          Reset
        </Button>
        <Button data-testid="timeline-toggle" onPress={props.onToggleTimeline} size="sm" variant="ghost">
          {props.timelineOpen ? 'Close Timeline' : 'Open Timeline'}
        </Button>
      </div>
    </div>
  );
}
