import type { Keyframe, Timeline } from '@broadset/model';
import { TimelineEditor } from '@broadset/ui';
import { type JSX, useMemo, useState } from 'react';

const BASE_KEYFRAMES: readonly Keyframe[] = [
  {
    action: 'none',
    name: 'kf-start',
    offsetMs: 0,
    properties: {
      x: { easing: 'linear', type: 'number', value: 0 },
    },
  },
  {
    action: 'setState',
    name: 'kf-mid',
    offsetMs: 900,
    payload: 'IN',
    properties: {
      x: { easing: 'ease-in-out', type: 'number', value: 240 },
    },
  },
];

function createTimeline(keyframes: readonly Keyframe[]): Timeline {
  return {
    id: 'tl-main',
    keyframes,
    name: 'Main Timeline',
  };
}

export function TimelineDeleteUndoHarness(): JSX.Element {
  const [timeline, setTimeline] = useState(createTimeline(BASE_KEYFRAMES));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [undoStack, setUndoStack] = useState<readonly Timeline[]>([]);

  const deleteSelected = (): void => {
    if (selectedIndex === null || timeline.keyframes[selectedIndex] === undefined) {
      return;
    }

    setUndoStack((existing) => [...existing, timeline]);

    const nextKeyframes = timeline.keyframes.filter((_frame, index) => index !== selectedIndex);

    setTimeline(createTimeline(nextKeyframes));
    setSelectedIndex(nextKeyframes.length === 0 ? null : Math.max(0, selectedIndex - 1));
  };

  const undoDelete = (): void => {
    const previous = undoStack[undoStack.length - 1];

    if (previous === undefined) {
      return;
    }

    setUndoStack((existing) => existing.slice(0, -1));
    setTimeline(previous);
    setSelectedIndex(previous.keyframes.length - 1);
  };

  return (
    <div
      data-testid="timeline-delete-undo-root"
      onKeyDown={(event) => {
        if (event.key === 'Delete') {
          deleteSelected();
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          undoDelete();
        }
      }}
      tabIndex={0}
    >
      <TimelineEditor
        timeline={timeline}
        selectedKeyframeIndex={selectedIndex}
        onSelectKeyframe={setSelectedIndex}
        onAddKeyframe={() => {
          const nextOffset = timeline.keyframes.length * 300 + 300;
          const nextKeyframe: Keyframe = {
            action: 'none',
            name: `kf-${String(timeline.keyframes.length + 1)}`,
            offsetMs: nextOffset,
            properties: { x: { easing: 'linear', type: 'number', value: nextOffset } },
          };

          const next = createTimeline([...timeline.keyframes, nextKeyframe]);

          setTimeline(next);
          setSelectedIndex(next.keyframes.length - 1);
        }}
        onMoveKeyframe={(index, offsetMs) => {
          const next = createTimeline(
            timeline.keyframes.map((frame, frameIndex) => (frameIndex === index ? { ...frame, offsetMs } : frame)),
          );

          setTimeline(next);
          setCurrentTimeMs(offsetMs);
        }}
        onChangeEasing={(index, easing) => {
          const next = createTimeline(
            timeline.keyframes.map((frame, frameIndex) => {
              if (frameIndex !== index) {
                return frame;
              }

              const nextProperties = Object.fromEntries(
                Object.entries(frame.properties).map(([key, value]) => [key, { ...value, easing }]),
              );

              return { ...frame, properties: nextProperties };
            }),
          );

          setTimeline(next);
        }}
        onPlayTimeline={() => {
          setIsPlaying(true);
        }}
        onStopTimeline={() => {
          setIsPlaying(false);
        }}
        onSeekTimeline={setCurrentTimeMs}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
      />
      <button aria-label="Delete keyframe" onClick={deleteSelected} type="button">
        Delete keyframe
      </button>
      <button aria-label="Undo delete" onClick={undoDelete} type="button">
        Undo delete
      </button>
      <output data-testid="timeline-keyframe-count">{String(timeline.keyframes.length)}</output>
      <output data-testid="timeline-offsets">{timeline.keyframes.map((frame) => frame.offsetMs).join(',')}</output>
      <output data-testid="timeline-selected">{selectedIndex === null ? 'none' : String(selectedIndex)}</output>
    </div>
  );
}

export function KeyframePropertyContextHarness(): JSX.Element {
  const [baseX, setBaseX] = useState(60);
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(1);
  const [timeline, setTimeline] = useState(
    createTimeline([
      {
        action: 'none',
        name: 'kf-base',
        offsetMs: 0,
        properties: {
          x: { easing: 'ease', type: 'number', value: 60 },
        },
      },
      {
        action: 'none',
        name: 'kf-edit',
        offsetMs: 1000,
        properties: {
          x: { easing: 'ease-in', type: 'number', value: 180 },
        },
      },
    ]),
  );

  const selectedKeyframeX = useMemo(() => {
    if (selectedKeyframeIndex === null) {
      return null;
    }

    const frame = timeline.keyframes[selectedKeyframeIndex];
    const value = frame?.properties['x'];

    return value?.type === 'number' ? value.value : null;
  }, [selectedKeyframeIndex, timeline.keyframes]);

  const applyXValue = (nextValue: number): void => {
    if (selectedKeyframeIndex === null) {
      setBaseX(nextValue);

      return;
    }

    const nextTimeline = createTimeline(
      timeline.keyframes.map((frame, frameIndex) => {
        if (frameIndex !== selectedKeyframeIndex) {
          return frame;
        }

        return {
          ...frame,
          properties: {
            ...frame.properties,
            x: {
              ...(frame.properties['x'] ?? { easing: 'ease', type: 'number', value: 0 }),
              easing: frame.properties['x']?.easing ?? 'ease',
              type: 'number',
              value: nextValue,
            },
          },
        };
      }),
    );

    setTimeline(nextTimeline);
  };

  return (
    <div>
      <label htmlFor="property-x-input">X property</label>
      <input
        id="property-x-input"
        aria-label="X property"
        type="number"
        value={selectedKeyframeIndex === null ? baseX : (selectedKeyframeX ?? 0)}
        onChange={(event) => {
          applyXValue(Number(event.currentTarget.value));
        }}
      />
      <button
        aria-label="Select keyframe context"
        onClick={() => {
          setSelectedKeyframeIndex(1);
        }}
        type="button"
      >
        Select keyframe context
      </button>
      <button
        aria-label="Clear keyframe context"
        onClick={() => {
          setSelectedKeyframeIndex(null);
        }}
        type="button"
      >
        Clear keyframe context
      </button>
      <output data-testid="base-x">{String(baseX)}</output>
      <output data-testid="keyframe-x">{selectedKeyframeX === null ? 'none' : String(selectedKeyframeX)}</output>
      <output data-testid="editing-context">{selectedKeyframeIndex === null ? 'base' : 'keyframe'}</output>
    </div>
  );
}

export function TimelineSnapshotRestoreHarness(): JSX.Element {
  const [timeline, setTimeline] = useState(createTimeline(BASE_KEYFRAMES));
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [events, setEvents] = useState<readonly string[]>([]);

  const record = (entry: string): void => {
    setEvents((existing) => [...existing, entry]);
  };

  const restoreSnapshot = (): void => {
    record('restore');
  };

  return (
    <div>
      <TimelineEditor
        timeline={timeline}
        selectedKeyframeIndex={selectedIndex}
        onSelectKeyframe={setSelectedIndex}
        onAddKeyframe={() => {
          const nextOffset = timeline.keyframes.length * 350 + 250;
          const nextKeyframe: Keyframe = {
            action: 'none',
            name: `kf-${String(timeline.keyframes.length + 1)}`,
            offsetMs: nextOffset,
            properties: {
              x: { easing: 'linear', type: 'number', value: nextOffset },
            },
          };

          setTimeline(createTimeline([...timeline.keyframes, nextKeyframe]));
        }}
        onMoveKeyframe={(index, offsetMs) => {
          const next = createTimeline(
            timeline.keyframes.map((frame, frameIndex) => (frameIndex === index ? { ...frame, offsetMs } : frame)),
          );

          setTimeline(next);
        }}
        onChangeEasing={() => undefined}
        onPlayTimeline={() => {
          restoreSnapshot();
          record('play');
          setIsPlaying(true);
        }}
        onStopTimeline={() => {
          setIsPlaying(false);
          record('stop');
        }}
        onSeekTimeline={(nextTimeMs) => {
          restoreSnapshot();
          record('seek');
          setCurrentTimeMs(nextTimeMs);
        }}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
      />
      <output data-testid="snapshot-sequence">{events.join('>')}</output>
    </div>
  );
}
