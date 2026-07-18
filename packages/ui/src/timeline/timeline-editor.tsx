import type { projectFormatV1 } from '@broadset/model';
import { Button } from '@heroui/react';
import { Plus } from 'lucide-react';
import type { JSX } from 'react';

import { color, font, sp } from '../tokens';
import { EasingGraphEditor } from './easing-graph-editor';
import { TimelineLanes } from './timeline-lanes';
import { formatTickSeconds } from './timeline-math';
import { TimelineRuler } from './timeline-ruler';
import type { TimelineViewSequence } from './timeline-types';

export interface TimelineEditorProps {
  readonly sequence: TimelineViewSequence;
  readonly currentTick: number;
  readonly snapIntervalTicks: number;
  readonly selectedKeyframe: { readonly trackId: string; readonly keyframeId: string } | null;
  readonly previewState: 'playing' | 'paused' | 'scrubbing';
  /** The selected keyframe's outgoing segment easing; null hides the graph even when a keyframe is selected. */
  readonly easing: {
    readonly interpolation: projectFormatV1.Interpolation;
    readonly presets: readonly string[];
    readonly previewProgress: number | null;
  } | null;
  readonly onSeekTick: (tick: number) => void;
  readonly onSelectKeyframe: (trackId: string, keyframeId: string) => void;
  readonly onAddKeyframe: (sequenceId: string, trackId: string, tick: number) => void;
  readonly onMoveKeyframe: (trackId: string, keyframeId: string, tick: number) => void;
  readonly onDeleteKeyframe: (trackId: string, keyframeId: string) => void;
  readonly onCommitEasing: (interpolation: projectFormatV1.Interpolation) => void;
  readonly onSelectEasingPreset: (preset: string) => void;
  readonly onCloseEasing: () => void;
}

const PREVIEW_LABELS = { playing: 'Playing', paused: 'Paused', scrubbing: 'Scrubbing' } as const;

/** Resolve the add-target track: the selected keyframe's track, else the only track, else none. */
function resolveAddTrackId(props: TimelineEditorProps): string | null {
  if (props.selectedKeyframe !== null) return props.selectedKeyframe.trackId;

  return props.sequence.tracks.length === 1 ? (props.sequence.tracks[0]?.id ?? null) : null;
}

export function TimelineEditor(props: TimelineEditorProps): JSX.Element {
  const addTrackId = resolveAddTrackId(props);

  return (
    <section
      aria-label={`Timeline editor for ${props.sequence.name}`}
      data-testid="timeline-editor"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), font: font('body-compact') }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-03') }}>
        <Button
          aria-label="Add keyframe"
          data-testid="timeline-add-keyframe"
          isDisabled={addTrackId === null}
          size="sm"
          variant="secondary"
          onPress={() => {
            if (addTrackId !== null) props.onAddKeyframe(props.sequence.id, addTrackId, props.currentTick);
          }}
        >
          <Plus size={14} />
          Add keyframe
        </Button>
        {addTrackId === null && (
          <span style={{ font: font('label'), color: color('muted') }}>Select a property track</span>
        )}
        <span data-testid="timeline-tick-readout" style={{ marginLeft: 'auto', color: color('muted') }}>
          {`tick ${String(props.currentTick)} · ${formatTickSeconds(props.currentTick, props.sequence.ticksPerSecond)}`}
        </span>
        <span style={{ font: font('label'), color: color('muted') }}>{PREVIEW_LABELS[props.previewState]}</span>
      </div>
      <TimelineRuler
        currentTick={props.currentTick}
        durationTicks={props.sequence.durationTicks}
        ticksPerSecond={props.sequence.ticksPerSecond}
        onSeekTick={props.onSeekTick}
      />
      {props.selectedKeyframe !== null && props.easing !== null && (
        <EasingGraphEditor
          interpolation={props.easing.interpolation}
          presets={props.easing.presets}
          previewProgress={props.easing.previewProgress}
          onClose={props.onCloseEasing}
          onCommit={props.onCommitEasing}
          onSelectPreset={props.onSelectEasingPreset}
        />
      )}
      <TimelineLanes
        durationTicks={props.sequence.durationTicks}
        selectedKeyframe={props.selectedKeyframe}
        snapIntervalTicks={props.snapIntervalTicks}
        ticksPerSecond={props.sequence.ticksPerSecond}
        tracks={props.sequence.tracks}
        onDeleteKeyframe={props.onDeleteKeyframe}
        onMoveKeyframe={props.onMoveKeyframe}
        onSeekTick={props.onSeekTick}
        onSelectKeyframe={props.onSelectKeyframe}
      />
    </section>
  );
}
