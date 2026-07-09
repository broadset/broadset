import { TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX, TimelineBottomPanel, TimelineEditor } from '@broadset/ui';

import { FLOATING_OFFSET } from '../demo-types';
import type { DemoAppLayoutProps } from './layout-types';

const TIMELINE_PANEL_LEFT_CHROME_INSET_PX = FLOATING_OFFSET + 48;

function getPanelSubtitle(timelineName: string, selectedElementName: string | null): string {
  if (selectedElementName === null) {
    return `Editing ${timelineName}`;
  }

  return `Editing ${timelineName} on ${selectedElementName}`;
}

export function LayoutTimelinePanel(props: DemoAppLayoutProps): React.JSX.Element | null {
  const {
    canvasSettings,
    currentDocument,
    editingTimeline,
    editingTimelineSelectedKf,
    handleAnimationAddKeyframe,
    handleAnimationChangeEasing,
    handleAnimationMoveKeyframe,
    handleAnimationSeekTimeline,
    handleAnimationStopTimeline,
    isTimelinePreviewPlaying,
    isSidebarOpen,
    selectedElement,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
    sidebarWidth,
    timelinePreviewCurrentTimeMs,
  } = props;

  if (!canvasSettings.showExperimentalFeatures) {
    return null;
  }

  const panelTitle = editingTimeline?.name ?? 'Timeline';
  const panelSubtitle =
    editingTimeline === null ? undefined : getPanelSubtitle(editingTimeline.name, selectedElement?.name ?? null);
  const rightInset = isSidebarOpen ? sidebarWidth + TIMELINE_BOTTOM_PANEL_SIDE_INSET_PX : undefined;

  return (
    <TimelineBottomPanel
      isOpen={editingTimeline !== null}
      leftInset={TIMELINE_PANEL_LEFT_CHROME_INSET_PX}
      rightInset={rightInset}
      title={panelTitle}
      subtitle={panelSubtitle}
      onClose={() => {
        handleAnimationStopTimeline();
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
          isPlaying={isTimelinePreviewPlaying}
          targetName={selectedElement?.name}
          getTargetName={(targetId) => currentDocument.elements.find((element) => element.id === targetId)?.name}
        />
      )}
    </TimelineBottomPanel>
  );
}
