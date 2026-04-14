import { TimelineBottomPanel, TimelineEditor } from '@broadset/ui';

import type { DemoAppLayoutProps } from './layout-types';

export function LayoutTimelinePanel(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    editingTimeline,
    editingTimelineSelectedKf,
    handleAnimationAddKeyframe,
    handleAnimationChangeEasing,
    handleAnimationMoveKeyframe,
    handleAnimationPlayTimeline,
    handleAnimationSeekTimeline,
    handleAnimationStopTimeline,
    isTimelinePreviewPlaying,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
    timelinePreviewCurrentTimeMs,
  } = props;

  return (
    <TimelineBottomPanel
      isOpen={editingTimeline !== null}
      onClose={() => {
        setEditingTimeline(null);
        setEditingTimelineSelectedKf(null);
      }}
    >
      {editingTimeline !== null && (
        <TimelineEditor
          timeline={editingTimeline}
          selectedKeyframeIndex={editingTimelineSelectedKf}
          onSelectKeyframe={setEditingTimelineSelectedKf}
          onAddKeyframe={handleAnimationAddKeyframe}
          onMoveKeyframe={handleAnimationMoveKeyframe}
          onChangeEasing={handleAnimationChangeEasing}
          onPlayTimeline={handleAnimationPlayTimeline}
          onStopTimeline={handleAnimationStopTimeline}
          onSeekTimeline={handleAnimationSeekTimeline}
          currentTimeMs={timelinePreviewCurrentTimeMs}
          isPlaying={isTimelinePreviewPlaying}
        />
      )}
    </TimelineBottomPanel>
  );
}
