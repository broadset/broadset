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
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <PageSorter
        pages={props.pages}
        activePageIndex={props.activePageIndex}
        onPageSelect={props.onPageSelect}
        onPageAdd={props.onPageAdd}
        onPageRemove={props.onPageRemove}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button data-testid="undo-button" onPress={props.onUndo} size="sm" variant="ghost">
          Undo
        </Button>
        <Button data-testid="redo-button" onPress={props.onRedo} size="sm" variant="ghost">
          Redo
        </Button>
        <Button data-testid="grid-toggle" onPress={props.onToggleGrid} size="sm" variant="ghost">
          {props.showGrid ? 'Hide Grid' : 'Show Grid'}
        </Button>
        <span style={{ fontSize: 12, display: 'flex', alignItems: 'center' }}>
          Zoom: {Math.round(props.zoom * 100)}%
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
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
