import type { Timeline } from '@broadset/model';
import { useState } from 'react';

import { TimelineEditor } from '../src/timeline/editor';
import { EditorToolbar } from '../src/toolbar-nav';

export function ToolbarHarness(): React.JSX.Element {
  const [redoCount, setRedoCount] = useState(0);
  const [gridEnabled, setGridEnabled] = useState(false);

  return (
    <div>
      <EditorToolbar
        canUndo={false}
        canRedo
        showGrid={gridEnabled}
        showGuides={false}
        zoomPercent={125}
        onUndo={() => undefined}
        onRedo={() => {
          setRedoCount((count) => count + 1);
        }}
        onToggleGrid={() => {
          setGridEnabled((current) => !current);
        }}
      />
      <output aria-label="Redo count">{String(redoCount)}</output>
      <output aria-label="Grid state">{gridEnabled ? 'on' : 'off'}</output>
    </div>
  );
}

export function TimelineHarness(): React.JSX.Element {
  const [keyframeCount, setKeyframeCount] = useState(2);
  const [seekValue, setSeekValue] = useState('idle');
  const allKeyframes: Timeline['keyframes'] = [
    {
      name: 'start',
      action: 'none',
      offsetMs: 0,
      properties: {
        opacity: { type: 'number', value: 0, easing: 'linear' },
      },
    },
    {
      name: 'mid',
      action: 'none',
      offsetMs: 500,
      properties: {
        opacity: { type: 'number', value: 0.5, easing: 'ease-in-out' },
      },
    },
    {
      name: 'end',
      action: 'none',
      offsetMs: 1000,
      properties: {
        opacity: { type: 'number', value: 1, easing: 'ease-out' },
      },
    },
  ];

  const timeline: Timeline = {
    id: 'tl-1',
    name: 'Preview',
    loop: 'none',
    loopCount: null,
    durationMs: 1000,
    childTimelines: [],
    audioCues: [],
    keyframes: allKeyframes.slice(0, keyframeCount),
  };

  return (
    <div style={{ width: 720 }}>
      <TimelineEditor
        timeline={timeline}
        selectedKeyframeIndex={0}
        onSelectKeyframe={() => undefined}
        onAddKeyframe={() => {
          setKeyframeCount((count) => count + 1);
        }}
        onMoveKeyframe={() => undefined}
        onChangeEasing={() => undefined}
        onSeekTimeline={(timeMs) => {
          setSeekValue(String(timeMs));
        }}
        currentTimeMs={0}
      />
      <output aria-label="Seek value">{seekValue}</output>
    </div>
  );
}
