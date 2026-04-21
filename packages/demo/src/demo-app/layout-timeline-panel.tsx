import { TimelineBottomPanel, TimelineEditor } from '@broadset/ui';

import type { DemoAppLayoutProps } from './layout-types';

export function LayoutTimelinePanel(props: DemoAppLayoutProps): React.JSX.Element | null {
  const {
    canvasSettings,
    editingTimeline,
    editingTimelineSelectedKf,
    handleAnimationAddKeyframe,
    handleAnimationChangeEasing,
    handleAnimationMoveKeyframe,
    handleAnimationSeekTimeline,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
    timelinePreviewCurrentTimeMs,
  } = props;

  if (!canvasSettings.showExperimentalFeatures) {
    return null;
  }

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
          onSeekTimeline={handleAnimationSeekTimeline}
          currentTimeMs={timelinePreviewCurrentTimeMs}
        />
      )}
    </TimelineBottomPanel>
  );
}
