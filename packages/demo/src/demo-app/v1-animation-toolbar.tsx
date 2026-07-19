import { type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import type { projectFormatV1 } from '@broadset/model';
import { Slider, Toolbar } from '@heroui/react';
import { PanelBottomOpen, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';

import { IconToolButton } from '../demo-components';
import { useEditorSelector } from './helpers';

interface V1AnimationToolbarProps {
  readonly editorStore: ProjectEditorStore;
  readonly onTimelineOpen: () => void;
}

function reachedLoopEnd(loop: projectFormatV1.LoopDefinition, loopCount: number): boolean {
  return loop.kind === 'none' || (loop.count !== undefined && loopCount >= loop.count);
}

function usePlaybackClock(editorStore: ProjectEditorStore): void {
  const playing = useEditorSelector(editorStore, (state) => state.playbackPlaying);
  const state = editorStore.getState();
  const document = selectActiveDocumentV1(state);
  const sequence = document?.sequences.find(({ id }) => id === state.playbackSequenceId);
  const ticksPerSecond = document?.timebase?.ticksPerSecond ?? 1000;
  const durationTicks = sequence?.durationTicks ?? 0;
  const loop = sequence?.loop;

  useEffect(() => {
    if (!playing || durationTicks === 0 || loop === undefined) return undefined;

    let frameId = 0;
    let previousTimestamp: number | null = null;
    let reverse = false;
    let loopCount = 0;

    const frame = (timestamp: number): void => {
      const previous = previousTimestamp;

      previousTimestamp = timestamp;

      if (previous !== null) {
        const deltaTicks = Math.max(1, Math.round(((timestamp - previous) * ticksPerSecond) / 1000));
        const current = editorStore.getState().playbackTick;
        const candidate = current + (reverse ? -deltaTicks : deltaTicks);

        if (!reverse && candidate >= durationTicks) {
          loopCount += 1;

          if (reachedLoopEnd(loop, loopCount)) {
            editorStore.getState().seekPlaybackTick(durationTicks);
            editorStore.getState().setPlaybackPlaying(false);

            return;
          }

          // Native preview treats one ping-pong boundary as a reversible transport leg.
          reverse = loop.kind === 'ping-pong';
          editorStore.getState().seekPlaybackTick(reverse ? durationTicks : 0);
        } else if (reverse && candidate <= 0) {
          reverse = false;
          editorStore.getState().seekPlaybackTick(0);
        } else {
          editorStore.getState().seekPlaybackTick(candidate);
        }
      }

      frameId = window.requestAnimationFrame(frame);
    };

    frameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationTicks, editorStore, loop, playing, ticksPerSecond]);
}

export function V1AnimationToolbar({ editorStore, onTimelineOpen }: V1AnimationToolbarProps): React.JSX.Element {
  usePlaybackClock(editorStore);

  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const sequence = document?.sequences.find(({ id }) => id === state.playbackSequenceId);
  const durationTicks = sequence?.durationTicks ?? 0;
  const contextName = sequence?.name ?? 'No sequence';

  return (
    <Toolbar
      aria-label={`Animation controls · ${contextName}`}
      isAttached
      style={{
        bottom: 8,
        left: '50%',
        position: 'absolute',
        transform: 'translateX(-50%)',
        zIndex: 40,
      }}
    >
      <IconToolButton
        isActive={state.playbackPlaying}
        isDisabled={sequence === undefined}
        label={`${state.playbackPlaying ? 'Pause' : 'Play'} ${contextName}`}
        onPress={() => {
          state.setPlaybackPlaying(!state.playbackPlaying);
        }}
      >
        {state.playbackPlaying ?
          <Pause aria-hidden="true" size={16} />
        : <Play aria-hidden="true" size={16} />}
      </IconToolButton>
      <IconToolButton
        isDisabled={sequence === undefined}
        label={`Reset ${contextName}`}
        onPress={() => {
          state.resetPlayback();
        }}
      >
        <RotateCcw aria-hidden="true" size={16} />
      </IconToolButton>
      <Slider
        aria-label={`${contextName} exact tick`}
        isDisabled={sequence === undefined}
        maxValue={Math.max(1, durationTicks)}
        minValue={0}
        step={1}
        value={state.playbackTick}
        style={{ width: 220 }}
        onChange={(value) => {
          const tick = typeof value === 'number' ? value : (value[0] ?? 0);

          state.seekPlaybackTick(Math.round(tick));
        }}
      >
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
      <span aria-live="polite">{`${String(state.playbackTick)} / ${String(durationTicks)}`}</span>
      <IconToolButton label="Open timeline" onPress={onTimelineOpen}>
        <PanelBottomOpen aria-hidden="true" size={16} />
      </IconToolButton>
    </Toolbar>
  );
}
