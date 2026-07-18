import { type ProjectEditorState, selectActiveDocumentV1, selectActiveElementIdsV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import {
  isInterpolationPreset,
  KEYFRAME_INTERPOLATION_PRESETS,
  resolveSnapIntervalTicks,
  TimelineBottomPanel,
  TimelineEditor,
} from '@broadset/ui';

import { presetToInterpolation } from './keyframe-interpolation-presets';
import {
  parseTimelineId,
  resolveActiveSequenceId,
  resolveAddedKeyframeSeedValue,
  resolveTimelinePreviewState,
} from './v1-demo-workspace-helpers';
import type { TimelineKeyframeSelection } from './v1-demo-workspace-types';
import { buildTimelineViewSequence } from './v1-timeline-adapter';

/** timeline.md's 100 ms grid preference, converted once per render to an integer tick interval. */
const SNAP_PREFERENCE_MS = 100;

/** Hosts the shipped TimelineEditor for the sequence currently previewed by playback, or renders nothing. */
export function renderTimelinePanel(options: {
  readonly state: ProjectEditorState;
  readonly timelineOpen: boolean;
  readonly selectedTimelineKeyframe: TimelineKeyframeSelection | null;
  /** True once the user has dismissed the easing graph for the current selection; hides the graph without touching the selection. */
  readonly easingGraphDismissed: boolean;
  readonly scrubbing: boolean;
  readonly onCloseTimeline: () => void;
  readonly onClearSelectedTimelineKeyframe: () => void;
  readonly onDismissEasingGraph: () => void;
  readonly onScrubbingChange: (scrubbing: boolean) => void;
  readonly onSelectTimelineKeyframe: (selection: TimelineKeyframeSelection) => void;
}): React.JSX.Element | null {
  const {
    state,
    timelineOpen,
    selectedTimelineKeyframe,
    easingGraphDismissed,
    scrubbing,
    onCloseTimeline,
    onClearSelectedTimelineKeyframe,
    onDismissEasingGraph,
    onScrubbingChange,
    onSelectTimelineKeyframe,
  } = options;
  const document = selectActiveDocumentV1(state);
  const sequenceId = resolveActiveSequenceId(state);
  const sequence = document?.sequences.find(({ id }) => id === sequenceId);

  if (document === undefined || sequence === undefined) return null;

  const view = buildTimelineViewSequence({
    document,
    sequence,
    selectedElementIds: new Set(selectActiveElementIdsV1(state)),
  });
  const snapIntervalTicks = resolveSnapIntervalTicks(SNAP_PREFERENCE_MS, view.ticksPerSecond);
  const selectedTrack = sequence.tracks.find(({ id }) => id === selectedTimelineKeyframe?.trackId);
  const selectedIndex =
    selectedTrack?.keyframes.findIndex(({ id }) => id === selectedTimelineKeyframe?.keyframeId) ?? -1;
  const selectedModelKeyframe = selectedIndex >= 0 ? selectedTrack?.keyframes[selectedIndex] : undefined;
  const nextModelKeyframe = selectedIndex >= 0 ? selectedTrack?.keyframes[selectedIndex + 1] : undefined;
  const easing =
    !easingGraphDismissed && selectedTrack !== undefined && selectedModelKeyframe?.interpolation !== undefined ?
      {
        interpolation: selectedModelKeyframe.interpolation,
        presets: KEYFRAME_INTERPOLATION_PRESETS.filter((preset) =>
          projectFormatV1.interpolationMatchesType(presetToInterpolation(preset), selectedTrack.valueType),
        ),
        previewProgress:
          (
            nextModelKeyframe !== undefined &&
            state.playbackTick >= selectedModelKeyframe.tick &&
            state.playbackTick <= nextModelKeyframe.tick &&
            nextModelKeyframe.tick > selectedModelKeyframe.tick
          ) ?
            (state.playbackTick - selectedModelKeyframe.tick) / (nextModelKeyframe.tick - selectedModelKeyframe.tick)
          : null,
      }
    : null;

  const previewState = resolveTimelinePreviewState({ scrubbing, playing: state.playbackPlaying });

  return (
    <TimelineBottomPanel isOpen={timelineOpen} subtitle={document.name} title={sequence.name} onClose={onCloseTimeline}>
      <TimelineEditor
        currentTick={state.playbackTick}
        easing={easing}
        previewState={previewState}
        selectedKeyframe={selectedTimelineKeyframe}
        sequence={view}
        snapIntervalTicks={snapIntervalTicks}
        onAddKeyframe={(seqId, trackId, tick) => {
          const track = sequence.tracks.find(({ id }) => id === trackId);

          state.addKeyframe({
            sequenceId: parseTimelineId(seqId),
            trackId: parseTimelineId(trackId),
            tick,
            value: resolveAddedKeyframeSeedValue({ track, document }),
          });
        }}
        onCloseEasing={onDismissEasingGraph}
        onCommitEasing={(interpolation) => {
          if (selectedTimelineKeyframe === null) return;

          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(selectedTimelineKeyframe.trackId),
            keyframeId: parseTimelineId(selectedTimelineKeyframe.keyframeId),
            interpolation,
          });
        }}
        onDeleteKeyframe={(trackId, keyframeId) => {
          state.removeKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(trackId),
            keyframeId: parseTimelineId(keyframeId),
          });
          onClearSelectedTimelineKeyframe();
        }}
        onMoveKeyframe={(trackId, keyframeId, tick) => {
          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(trackId),
            keyframeId: parseTimelineId(keyframeId),
            tick,
          });
        }}
        onScrubbingChange={onScrubbingChange}
        onSeekTick={(tick) => {
          state.seekPlaybackTick(tick);
        }}
        onSelectEasingPreset={(preset) => {
          if (selectedTimelineKeyframe === null || !isInterpolationPreset(preset)) return;

          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(selectedTimelineKeyframe.trackId),
            keyframeId: parseTimelineId(selectedTimelineKeyframe.keyframeId),
            interpolation: presetToInterpolation(preset),
          });
        }}
        onSelectKeyframe={(trackId, keyframeId) => {
          onSelectTimelineKeyframe({ trackId, keyframeId });
        }}
      />
    </TimelineBottomPanel>
  );
}
