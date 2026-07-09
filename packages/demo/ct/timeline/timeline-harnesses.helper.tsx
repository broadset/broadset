import type { EasingMode, Keyframe, ModifierTimelineBinding, StateTimelineBinding, Timeline } from '@broadset/model';
import {
  AnimationBindingSections,
  EasingGraphEditor,
  PerPropertyLanes,
  TimelineBottomPanel,
  TimelineEditor,
} from '@broadset/ui';
import { type JSX, useState } from 'react';

const BASE_KEYFRAMES: readonly Keyframe[] = [
  {
    name: 'kf-start',
    action: 'none',
    offsetMs: 0,
    properties: {
      x: { type: 'number', value: 0, easing: 'ease' },
      opacity: { type: 'number', value: 1, easing: 'ease-in' },
    },
  },
  {
    name: 'kf-end',
    action: 'setState',
    offsetMs: 1200,
    properties: {
      x: { type: 'number', value: 320, easing: 'ease-out' },
      opacity: { type: 'number', value: 0.5, easing: 'ease-in-out' },
    },
    payload: 'IN',
  },
];

function createTimeline(keyframes: readonly Keyframe[]): Timeline {
  return {
    id: 'tl-main',
    name: 'Main Timeline',
    keyframes,
  };
}

export function TimelineHarness(): JSX.Element {
  const [timeline, setTimeline] = useState(createTimeline(BASE_KEYFRAMES));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  return (
    <div>
      <TimelineEditor
        timeline={timeline}
        selectedKeyframeIndex={selectedIndex}
        onSelectKeyframe={setSelectedIndex}
        onAddKeyframe={(offsetMs) => {
          const nextOffset = offsetMs;
          const nextKeyframe: Keyframe = {
            name: `kf-${String(timeline.keyframes.length + 1)}`,
            action: 'none',
            offsetMs: nextOffset,
            properties: {
              x: { type: 'number', value: nextOffset, easing: 'linear' },
            },
          };

          const keyframes = [...timeline.keyframes, nextKeyframe];

          setTimeline(createTimeline(keyframes));
          setSelectedIndex(keyframes.length - 1);
        }}
        onMoveKeyframe={(index, offsetMs) => {
          const keyframes = timeline.keyframes.map((frame, frameIndex) =>
            frameIndex === index ? { ...frame, offsetMs } : frame,
          );

          setTimeline(createTimeline(keyframes));
          setCurrentTimeMs(offsetMs);
        }}
        onChangeEasing={(index, easing) => {
          const keyframes = timeline.keyframes.map((frame, frameIndex) => {
            if (frameIndex !== index) {
              return frame;
            }

            const updatedProperties = Object.fromEntries(
              Object.entries(frame.properties).map(([key, value]) => [key, { ...value, easing }]),
            );

            return {
              ...frame,
              properties: updatedProperties,
            };
          });

          setTimeline(createTimeline(keyframes));
        }}
        onSeekTimeline={(timeMs) => {
          setCurrentTimeMs(timeMs);
        }}
        currentTimeMs={currentTimeMs}
      />
      <output data-testid="timeline-offsets">{timeline.keyframes.map((frame) => frame.offsetMs).join(',')}</output>
      <output data-testid="timeline-selected">{selectedIndex === null ? 'none' : String(selectedIndex)}</output>
      <output data-testid="timeline-time">{String(currentTimeMs)}</output>
    </div>
  );
}

export function ScopedTimelineHarness(): JSX.Element {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [timeline, setTimeline] = useState(
    createTimeline([
      {
        name: 'Owner Fade',
        action: 'setState',
        offsetMs: 0,
        properties: {
          opacity: { type: 'number', value: 1, easing: 'ease' },
        },
      },
      {
        name: 'Child Drift',
        action: 'setState',
        offsetMs: 500,
        target: 'child-1',
        properties: {
          x: { type: 'number', value: 120, easing: 'ease-out' },
        },
      },
    ]),
  );

  return (
    <>
      <TimelineEditor
        timeline={timeline}
        selectedKeyframeIndex={selectedIndex}
        onSelectKeyframe={setSelectedIndex}
        onAddKeyframe={() => undefined}
        onMoveKeyframe={(index, offsetMs) => {
          setTimeline((existing) =>
            createTimeline(
              existing.keyframes.map((frame, frameIndex) => (frameIndex === index ? { ...frame, offsetMs } : frame)),
            ),
          );
          setCurrentTimeMs(offsetMs);
        }}
        onChangeEasing={() => undefined}
        onSeekTimeline={setCurrentTimeMs}
        currentTimeMs={currentTimeMs}
        getTargetName={(targetId) => (targetId === 'child-1' ? 'Lower Third Text' : undefined)}
      />
      <output data-testid="scoped-timeline-time">{String(currentTimeMs)}</output>
      <output data-testid="scoped-timeline-offsets">
        {timeline.keyframes.map((frame) => frame.offsetMs).join(',')}
      </output>
    </>
  );
}

export function TimelinePanelHarness(): JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <>
      <TimelineBottomPanel
        isOpen={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <span>Timeline body</span>
      </TimelineBottomPanel>
      <output data-testid="timeline-panel-open">{String(open)}</output>
    </>
  );
}

export function BindingHarness(): JSX.Element {
  const [stateBindings, setStateBindings] = useState<readonly StateTimelineBinding[]>([
    { stateName: 'Enter', timelineId: 'tl-in' },
    { stateName: 'Exit', timelineId: 'tl-out' },
  ]);
  const [modifierBindings, setModifierBindings] = useState<readonly ModifierTimelineBinding[]>([
    { modifierName: 'hover', inTimelineId: 'tl-hover-in', outTimelineId: 'tl-hover-out' },
  ]);

  return (
    <>
      <AnimationBindingSections
        stateBindings={stateBindings}
        modifierBindings={modifierBindings}
        timelines={[
          createTimeline(BASE_KEYFRAMES),
          { id: 'tl-in', name: 'In', keyframes: [] },
          { id: 'tl-out', name: 'Out', keyframes: [] },
          { id: 'tl-hover-in', name: 'Hover In', keyframes: [] },
          { id: 'tl-hover-out', name: 'Hover Out', keyframes: [] },
        ]}
        onAddStateBinding={(stateName, timelineId) => {
          setStateBindings((existing) => [...existing, { stateName, timelineId }]);
        }}
        onRemoveStateBinding={(stateName) => {
          setStateBindings((existing) => existing.filter((binding) => binding.stateName !== stateName));
        }}
        onRenameStateBinding={() => undefined}
        onAddModifierBinding={(modifierName, inTimelineId, outTimelineId) => {
          setModifierBindings((existing) => [...existing, { modifierName, inTimelineId, outTimelineId }]);
        }}
        onRemoveModifierBinding={(modifierName) => {
          setModifierBindings((existing) => existing.filter((binding) => binding.modifierName !== modifierName));
        }}
      />
      <output data-testid="binding-state-count">{String(stateBindings.length)}</output>
      <output data-testid="binding-modifier-count">{String(modifierBindings.length)}</output>
    </>
  );
}

export function EasingGraphHarness(): JSX.Element {
  const [easing, setEasing] = useState<EasingMode>('cubic-bezier(0.25, 0.1, 0.25, 1)');
  const [closed, setClosed] = useState(false);

  return (
    <>
      {closed ? null : (
        <div>
          <EasingGraphEditor
            easing={easing}
            onChange={setEasing}
            isPlaying
            playbackProgress={0.5}
            onClose={() => {
              setClosed(true);
            }}
          />
        </div>
      )}
      <output data-testid="easing-value">{easing}</output>
      <output data-testid="easing-closed">{String(closed)}</output>
    </>
  );
}

export function PropertyLanesHarness(): JSX.Element {
  const [keyframes, setKeyframes] = useState(BASE_KEYFRAMES);

  return (
    <>
      <PerPropertyLanes
        keyframes={keyframes}
        durationMs={3000}
        onAddPropertyKeyframe={(offsetMs, property) => {
          const created: Keyframe = {
            name: `lane-${property}-${String(offsetMs)}`,
            action: 'none',
            offsetMs,
            properties: {
              [property]: { type: 'number', value: 1, easing: 'linear' },
            },
          };

          setKeyframes((existing) => [...existing, created]);
        }}
        onMovePropertyKeyframe={(fromIndex, property, toOffsetMs) => {
          setKeyframes((existing) =>
            existing.map((frame, frameIndex) => {
              if (frameIndex !== fromIndex || frame.properties[property] === undefined) {
                return frame;
              }

              return { ...frame, offsetMs: toOffsetMs };
            }),
          );
        }}
        isExpanded
      />
      <output data-testid="lanes-keyframe-count">{String(keyframes.length)}</output>
      <output data-testid="lanes-offsets">{keyframes.map((frame) => frame.offsetMs).join(',')}</output>
    </>
  );
}
