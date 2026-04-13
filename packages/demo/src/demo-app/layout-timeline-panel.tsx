import type { EasingMode } from '@broadset/model';
import { TimelineBottomPanel, TimelineEditor } from '@broadset/ui';
import { toast } from '@heroui/react';

import type { DemoAppLayoutProps } from './layout-types';

export function LayoutTimelinePanel(props: DemoAppLayoutProps): React.JSX.Element {
  const { editingTimeline, editingTimelineSelectedKf, setEditingTimeline, setEditingTimelineSelectedKf } = props;

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
          onAddKeyframe={() => {
            toast.info('Add keyframe not yet wired.');
          }}
          onMoveKeyframe={(_index: number, _offsetMs: number) => {
            toast.info('Move keyframe not yet wired.');
          }}
          onChangeEasing={(_index: number, _easing: EasingMode) => {
            toast.info('Change easing not yet wired.');
          }}
          onPlayTimeline={() => {
            toast.info('Play timeline not yet wired.');
          }}
          onStopTimeline={() => {
            toast.info('Stop timeline not yet wired.');
          }}
          onSeekTimeline={(_timeMs: number) => {
            toast.info('Seek timeline not yet wired.');
          }}
          currentTimeMs={0}
          isPlaying={false}
        />
      )}
    </TimelineBottomPanel>
  );
}
