import type { JSX, PointerEvent } from 'react';
import { useRef, useState } from 'react';

import { color, font, sp } from '../tokens';
import { fanOffsets, formatTickSeconds, railRatioFromTick, snapTick, tickFromRailRatio } from './timeline-math';
import { sortTimelineLanes, type TimelineViewTrack } from './timeline-types';

export interface TimelineLanesProps {
  readonly tracks: readonly TimelineViewTrack[];
  readonly durationTicks: number;
  readonly ticksPerSecond: number;
  readonly snapIntervalTicks: number;
  readonly selectedKeyframe: { readonly trackId: string; readonly keyframeId: string } | null;
  readonly onSelectKeyframe: (trackId: string, keyframeId: string) => void;
  readonly onSeekTick: (tick: number) => void;
  readonly onMoveKeyframe: (trackId: string, keyframeId: string, tick: number) => void;
  readonly onDeleteKeyframe: (trackId: string, keyframeId: string) => void;
}

const LANE_HEIGHT_PX = 28;
const MARKER_SIZE_PX = 10;
const FAN_STEP_PX = 8;
const LANE_LABEL_WIDTH_PX = 160;

interface DragState {
  readonly trackId: string;
  readonly keyframeId: string;
  readonly candidateTick: number;
}

/** Per-track keyframe lanes. Pointer widgets are plain elements by repo precedent (not HeroUI chrome). */
export function TimelineLanes(props: TimelineLanesProps): JSX.Element {
  const [drag, setDrag] = useState<DragState | null>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());

  const tickFromLanePointer = (trackId: string, event: PointerEvent): number => {
    const lane = laneRefs.current.get(trackId);

    if (lane === undefined) return 0;

    const bounds = lane.getBoundingClientRect();
    const ratio = bounds.width === 0 ? 0 : (event.clientX - bounds.left) / bounds.width;

    return tickFromRailRatio(ratio, props.durationTicks);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {drag !== null && (
        <div
          data-testid="timeline-drag-indicator"
          style={{ font: font('label'), color: color('accent'), padding: sp('sp-01') }}
        >
          {`tick ${String(drag.candidateTick)} · ${formatTickSeconds(drag.candidateTick, props.ticksPerSecond)}`}
        </div>
      )}
      {sortTimelineLanes(props.tracks).map((track) => {
        const offsets = fanOffsets(track.keyframes, FAN_STEP_PX);

        return (
          <div key={track.id} style={{ display: 'flex', alignItems: 'stretch', gap: sp('sp-02') }}>
            <span
              style={{
                width: LANE_LABEL_WIDTH_PX,
                font: font('label'),
                color: color('muted'),
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                alignSelf: 'center',
              }}
            >
              {track.label}
            </span>
            <div
              ref={(node) => {
                if (node !== null) laneRefs.current.set(track.id, node);
                else laneRefs.current.delete(track.id);
              }}
              data-testid={`timeline-lane-rail-${track.id}`}
              style={{
                position: 'relative',
                flex: 1,
                height: LANE_HEIGHT_PX,
                background: color('surface-secondary'),
                borderBottom: `1px solid ${color('border')}`,
                touchAction: 'none',
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || event.target !== event.currentTarget) return;
                props.onSeekTick(tickFromLanePointer(track.id, event));
              }}
            >
              {track.keyframes.length === 0 && (
                <span style={{ font: font('label'), color: color('muted'), paddingLeft: sp('sp-02') }}>
                  No keyframes
                </span>
              )}
              {track.keyframes.map((keyframe) => {
                const selected =
                  props.selectedKeyframe?.trackId === track.id &&
                  props.selectedKeyframe.keyframeId === keyframe.id;

                return (
                  <button
                    key={keyframe.id}
                    aria-label={`${track.label} keyframe at ${formatTickSeconds(keyframe.tick, props.ticksPerSecond)}`}
                    aria-pressed={selected}
                    data-testid={`timeline-marker-${keyframe.id}`}
                    type="button"
                    style={{
                      position: 'absolute',
                      top: (LANE_HEIGHT_PX - MARKER_SIZE_PX) / 2,
                      left: `calc(${String(railRatioFromTick(keyframe.tick, props.durationTicks) * 100)}% + ${String(offsets.get(keyframe.id) ?? 0)}px)`,
                      width: MARKER_SIZE_PX,
                      height: MARKER_SIZE_PX,
                      transform: 'translateX(-50%) rotate(45deg)',
                      background: color(keyframe.category),
                      border: selected ? `2px solid ${color('foreground')}` : 'none',
                      padding: 0,
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                    onClick={() => {
                      props.onSelectKeyframe(track.id, keyframe.id);
                    }}
                    onKeyDown={(event) => {
                      if (!selected) return;

                      if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        props.onDeleteKeyframe(track.id, keyframe.id);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;

                      if (typeof event.currentTarget.setPointerCapture === 'function') {
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          /* jsdom */
                        }
                      }

                      event.stopPropagation();
                      setDrag({ trackId: track.id, keyframeId: keyframe.id, candidateTick: keyframe.tick });
                    }}
                    onPointerMove={(event) => {
                      if (drag === null) return;
                      if (event.buttons !== 1 || drag.keyframeId !== keyframe.id) return;
                      setDrag({ ...drag, candidateTick: tickFromLanePointer(track.id, event) });
                    }}
                    onPointerUp={() => {
                      if (drag === null) return;
                      if (drag.keyframeId !== keyframe.id) return;
                      props.onMoveKeyframe(
                        drag.trackId,
                        drag.keyframeId,
                        snapTick(drag.candidateTick, props.snapIntervalTicks, props.durationTicks),
                      );
                      setDrag(null);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
