import { glassPanelStyle, sp, TIMELINE_BOTTOM_PANEL_HEIGHT_PX, zLayer } from '@broadset/ui';
import { Separator, Toolbar } from '@heroui/react';
import { PanelBottomOpen, Pause, Play, RotateCcw } from 'lucide-react';

import { IconToolButton } from '../demo-components';
import { FLOATING_OFFSET } from '../demo-types';
import type { DemoAppLayoutProps } from './layout-types';

const TIMELINE_OPEN_TOOLBAR_BOTTOM_PX = TIMELINE_BOTTOM_PANEL_HEIGHT_PX + FLOATING_OFFSET;

export function LayoutCanvasChrome(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    currentDocument,
    editingTimeline,
    handleAnimationPlayTimeline,
    handleAnimationStopTimeline,
    handleResetPlayback,
    handleTogglePlayback,
    isPlaying,
    isTimelinePreviewPlaying,
    selectedElement,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
  } = props;

  const selectedAnimationConfig =
    selectedElement === null ? null : (
      (currentDocument.animations.find((animation) => animation.elementId === selectedElement.id)?.config ?? null)
    );
  const firstAvailableTimeline = selectedAnimationConfig?.timelines[0] ?? null;
  const isTimelineOpen = editingTimeline !== null;
  const isToggleDisabled = !isTimelineOpen && firstAvailableTimeline === null;

  const isPlaybackActive = isTimelineOpen ? isTimelinePreviewPlaying : isPlaying;
  const handlePlaybackToggle = (): void => {
    if (isTimelineOpen) {
      if (isTimelinePreviewPlaying) {
        handleAnimationStopTimeline();

        return;
      }

      handleAnimationPlayTimeline();

      return;
    }

    handleTogglePlayback();
  };
  const handlePlaybackReset = (): void => {
    if (isTimelineOpen) {
      handleAnimationStopTimeline();

      return;
    }

    handleResetPlayback();
  };

  const handleToggleTimeline = (): void => {
    if (isTimelineOpen) {
      setEditingTimeline(null);
      setEditingTimelineSelectedKf(null);

      return;
    }

    if (firstAvailableTimeline === null) {
      return;
    }

    setEditingTimeline(firstAvailableTimeline);
    setEditingTimelineSelectedKf(null);
  };

  const toolbarBottomPx = isTimelineOpen ? TIMELINE_OPEN_TOOLBAR_BOTTOM_PX : FLOATING_OFFSET;

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        bottom: `${String(toolbarBottomPx)}px`,
        transition: 'var(--transition-panel, bottom 0.25s ease)',
        zIndex: zLayer('overlay') + 1,
      }}
    >
      <Toolbar
        aria-label="Animation toolbar"
        className="pointer-events-auto"
        isAttached
        style={{
          ...glassPanelStyle(),
          alignItems: 'center',
          borderRadius: '0.75rem',
          display: 'flex',
          gap: sp('sp-01'),
          padding: sp('sp-01'),
        }}
      >
        <IconToolButton
          label={isPlaybackActive ? 'Pause playback' : 'Play playback'}
          testId="demo-playback-toggle"
          tooltipPlacement="top"
          onPress={handlePlaybackToggle}
        >
          {isPlaybackActive ?
            <Pause size={16} />
          : <Play size={16} />}
        </IconToolButton>
        <IconToolButton
          label="Reset playback"
          testId="demo-playback-reset"
          tooltipPlacement="top"
          onPress={handlePlaybackReset}
        >
          <RotateCcw size={16} />
        </IconToolButton>
        <Separator orientation="vertical" />
        <IconToolButton
          isActive={isTimelineOpen}
          isDisabled={isToggleDisabled}
          label={isTimelineOpen ? 'Close timeline view' : 'Open timeline view'}
          testId="open-timeline-button"
          tooltipPlacement="top"
          onPress={handleToggleTimeline}
        >
          <PanelBottomOpen size={16} />
        </IconToolButton>
      </Toolbar>
    </div>
  );
}
