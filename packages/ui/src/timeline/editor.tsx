import type { EasingMode, Keyframe, Timeline } from '@broadset/model';
import { Button, Chip, ListBox, Select, Tooltip } from '@heroui/react';
import { Plus } from 'lucide-react';
import { type JSX, type PointerEvent as ReactPointerEvent, useCallback, useMemo, useRef, useState } from 'react';

import { color, type ColorToken, sp } from '../tokens';
import { buildTimelineLanes, getKeyframeScopeLabel, getStackPositionPx } from './editor-lanes';

const MIN_DURATION_MS = 3000;
const DURATION_PAD_MS = 1000;
const RULER_STEP_MS = 500;
const SNAP_INTERVAL_MS = 100;
const RULER_HEIGHT_PX = 20;
const TRACK_HEIGHT_PX = 40;
const LANE_HEIGHT_PX = 36;
const LANE_LABEL_WIDTH_PX = 124;
const MARKER_SIZE_PX = 12;
const MAX_GRID_LINE_COUNT = 241;

const EASING_PRESET_OPTIONS: readonly EasingMode[] = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step',
  'counting',
  'spring-gentle',
  'spring-bouncy',
  'spring-stiff',
];

const ACTION_COLOR_MAP: Readonly<Record<string, ColorToken>> = {
  setState: 'accent',
  addModifier: 'focus',
  removeModifier: 'danger',
  none: 'muted',
};

function computeDurationMs(timeline: Timeline): number {
  if (timeline.durationMs !== undefined) {
    return timeline.durationMs;
  }

  if (timeline.keyframes.length === 0) {
    return MIN_DURATION_MS;
  }

  const maxOffset = timeline.keyframes.reduce((max, kf) => Math.max(max, kf.offsetMs), 0);

  return Math.max(maxOffset + DURATION_PAD_MS, MIN_DURATION_MS);
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function snapToGrid(ms: number): number {
  return Math.round(ms / SNAP_INTERVAL_MS) * SNAP_INTERVAL_MS;
}

function getGridIntervalMs(durationMs: number): number {
  const snapLineCount = Math.floor(durationMs / SNAP_INTERVAL_MS) + 1;

  if (snapLineCount <= MAX_GRID_LINE_COUNT) {
    return SNAP_INTERVAL_MS;
  }

  return Math.ceil(durationMs / (MAX_GRID_LINE_COUNT - 1) / SNAP_INTERVAL_MS) * SNAP_INTERVAL_MS;
}

function getTimePercent(ms: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (ms / durationMs) * 100));
}

function getPlaybackStatusLabel(isPlaying: boolean, isScrubbing: boolean): string {
  if (isPlaying) {
    return 'Playing';
  }

  if (isScrubbing) {
    return 'Scrubbing';
  }

  return 'Paused';
}

function getDisplayEasing(kf: Keyframe): string {
  const values = Object.values(kf.properties);

  if (values.length === 0) {
    return 'ease';
  }

  const first = values[0];

  return first !== undefined ? first.easing : 'ease';
}

export interface TimelineEditorProps {
  readonly timeline: Timeline;
  readonly selectedKeyframeIndex: number | null;
  readonly onSelectKeyframe: (index: number) => void;
  readonly onAddKeyframe: (offsetMs: number) => void;
  readonly onMoveKeyframe: (index: number, offsetMs: number) => void;
  readonly onChangeEasing: (index: number, easing: EasingMode) => void;
  readonly onSeekTimeline: (timeMs: number) => void;
  readonly currentTimeMs: number;
  readonly isPlaying?: boolean | undefined;
  readonly targetName?: string | undefined;
  readonly getTargetName?: ((targetId: string) => string | undefined) | undefined;
}

export function TimelineEditor(props: TimelineEditorProps): JSX.Element {
  const {
    timeline,
    selectedKeyframeIndex,
    onSelectKeyframe,
    onAddKeyframe,
    onMoveKeyframe,
    onChangeEasing,
    onSeekTimeline,
    currentTimeMs,
    isPlaying = false,
    targetName,
    getTargetName,
  } = props;

  const { keyframes } = timeline;
  const durationMs = computeDurationMs(timeline);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const suppressClickSeekRef = useRef(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffsetMs, setDragOffsetMs] = useState<number | null>(null);
  const [scrubOffsetMs, setScrubOffsetMs] = useState<number | null>(null);

  const selectedKeyframe = selectedKeyframeIndex !== null ? (keyframes[selectedKeyframeIndex] ?? null) : null;
  const displayCurrentTimeMs = scrubOffsetMs ?? currentTimeMs;
  const targetLabel = targetName?.trim();
  const playbackStatusLabel = getPlaybackStatusLabel(isPlaying, scrubOffsetMs !== null);
  const selectedScopeLabel =
    selectedKeyframe !== null ? getKeyframeScopeLabel(selectedKeyframe, getTargetName) : 'Owner';
  const timelineLanes = useMemo(() => buildTimelineLanes(keyframes, getTargetName), [getTargetName, keyframes]);
  const laneHeightPx = timelineLanes.length === 1 ? TRACK_HEIGHT_PX : LANE_HEIGHT_PX;
  const trackHeightPx = timelineLanes.length * laneHeightPx;

  const getPreciseTimeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;

      if (track === null) {
        return 0;
      }

      const rect = track.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / width));

      return ratio * durationMs;
    },
    [durationMs],
  );
  const getSnappedTimeFromClientX = useCallback(
    (clientX: number): number => snapToGrid(getPreciseTimeFromClientX(clientX)),
    [getPreciseTimeFromClientX],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (suppressClickSeekRef.current) {
        suppressClickSeekRef.current = false;

        return;
      }

      if ((e.target as HTMLElement).closest('[data-testid="keyframe-marker"]') !== null) {
        return;
      }

      const timeMs = getPreciseTimeFromClientX(e.clientX);

      onSeekTimeline(timeMs);
    },
    [getPreciseTimeFromClientX, onSeekTimeline],
  );

  const handleTrackPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) {
        return;
      }

      if ((e.target as HTMLElement).closest('[data-testid="keyframe-marker"]') !== null) {
        return;
      }

      const timeMs = getPreciseTimeFromClientX(e.clientX);

      isScrubbingRef.current = true;
      suppressClickSeekRef.current = true;
      setScrubOffsetMs(timeMs);
      onSeekTimeline(timeMs);

      if (typeof e.currentTarget.setPointerCapture === 'function') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture — safe to ignore in tests
        }
      }
    },
    [getPreciseTimeFromClientX, onSeekTimeline],
  );

  const handleMarkerPointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>): void => {
      if (e.button !== 0) {
        return;
      }

      e.stopPropagation();
      onSelectKeyframe(index);
      setDragIndex(index);

      const kf = keyframes[index];

      if (kf !== undefined) {
        setDragOffsetMs(kf.offsetMs);
        onSeekTimeline(kf.offsetMs);
      }

      if (e.target instanceof HTMLElement && typeof e.target.setPointerCapture === 'function') {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture — safe to ignore in tests
        }
      }
    },
    [keyframes, onSeekTimeline, onSelectKeyframe],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragIndex !== null) {
        const timeMs = getSnappedTimeFromClientX(e.clientX);

        setDragOffsetMs(timeMs);
        onSeekTimeline(timeMs);

        return;
      }

      if (isScrubbingRef.current) {
        const timeMs = getPreciseTimeFromClientX(e.clientX);

        setScrubOffsetMs(timeMs);
        onSeekTimeline(timeMs);
      }
    },
    [dragIndex, getPreciseTimeFromClientX, getSnappedTimeFromClientX, onSeekTimeline],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragIndex !== null) {
        const timeMs = getSnappedTimeFromClientX(e.clientX);

        onMoveKeyframe(dragIndex, timeMs);
        setDragIndex(null);
        setDragOffsetMs(null);

        return;
      }

      if (isScrubbingRef.current) {
        isScrubbingRef.current = false;
        setScrubOffsetMs(null);

        if (typeof e.currentTarget.releasePointerCapture === 'function') {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // jsdom doesn't support releasePointerCapture — safe to ignore in tests
          }
        }
      }
    },
    [dragIndex, getSnappedTimeFromClientX, onMoveKeyframe],
  );

  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragIndex !== null) {
        setDragIndex(null);
        setDragOffsetMs(null);
      }

      if (isScrubbingRef.current) {
        isScrubbingRef.current = false;
        setScrubOffsetMs(null);
        suppressClickSeekRef.current = false;
      }

      if (typeof e.currentTarget.releasePointerCapture === 'function') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support releasePointerCapture — safe to ignore in tests
        }
      }
    },
    [dragIndex],
  );

  const rulerLabels = useMemo(() => {
    const labels: Array<{ readonly ms: number; readonly label: string }> = [];

    for (let ms = 0; ms <= durationMs; ms += RULER_STEP_MS) {
      labels.push({ ms, label: formatTime(ms) });
    }

    return labels;
  }, [durationMs]);
  const snapGridLines = useMemo(() => {
    const lines: Array<{ readonly ms: number; readonly isMajor: boolean }> = [];
    const gridIntervalMs = getGridIntervalMs(durationMs);

    for (let ms = 0; ms <= durationMs; ms += gridIntervalMs) {
      lines.push({ ms, isMajor: ms % RULER_STEP_MS === 0 });
    }

    return lines;
  }, [durationMs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: sp('sp-02'),
          justifyContent: 'space-between',
          padding: `0 ${sp('sp-03')}`,
        }}
      >
        <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: sp('sp-02') }}>
          <Chip
            size="sm"
            style={{
              maxWidth: 'min(18rem, 34vw)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {`Editing ${timeline.name}`}
          </Chip>
          {targetLabel !== undefined && targetLabel.length > 0 ?
            <Chip
              size="sm"
              style={{
                maxWidth: 'min(16rem, 28vw)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {`Element: ${targetLabel}`}
            </Chip>
          : null}
          <Chip size="sm">{`${playbackStatusLabel} at ${formatTime(displayCurrentTimeMs)}`}</Chip>
        </div>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Add keyframe"
          onPress={() => {
            onAddKeyframe(displayCurrentTimeMs);
          }}
        >
          <Plus size={14} />
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${String(LANE_LABEL_WIDTH_PX)}px minmax(0, 1fr)`,
          height: `${String(RULER_HEIGHT_PX)}px`,
          borderBottom: `1px solid ${color('border')}`,
          fontSize: '10px',
          color: color('muted'),
          userSelect: 'none',
        }}
      >
        <div />
        <div style={{ position: 'relative' }}>
          {rulerLabels.map((r) => (
            <span
              key={r.ms}
              style={{
                position: 'absolute',
                left: `${String((r.ms / durationMs) * 100)}%`,
                transform: 'translateX(-50%)',
              }}
            >
              {r.label}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${String(LANE_LABEL_WIDTH_PX)}px minmax(0, 1fr)`,
          minHeight: `${String(trackHeightPx)}px`,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${String(timelineLanes.length)}, ${String(laneHeightPx)}px)`,
            borderTopLeftRadius: '4px',
            borderBottomLeftRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {timelineLanes.map((lane, laneIndex) => (
            <div
              key={lane.id}
              data-testid={`timeline-lane-label-${lane.testIdSegment}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                padding: `0 ${sp('sp-02')}`,
                borderBottom: laneIndex === timelineLanes.length - 1 ? 'none' : `1px solid ${color('border')}`,
                backgroundColor: laneIndex % 2 === 0 ? color('surface-tertiary') : color('surface-secondary'),
              }}
            >
              <Chip
                size="sm"
                style={{
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {lane.label}
              </Chip>
            </div>
          ))}
        </div>

        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- timeline track is a pointer-scrub widget; keyboard navigation of keyframes happens at the editor level via shortcuts rather than per-track key events */}
        <div
          ref={trackRef}
          data-testid="timeline-track"
          data-duration-ms={String(durationMs)}
          onClick={handleTrackClick}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{
            position: 'relative',
            height: `${String(trackHeightPx)}px`,
            backgroundColor: color('surface-secondary'),
            borderTopRightRadius: '4px',
            borderBottomRightRadius: '4px',
            cursor: 'crosshair',
            overflow: 'visible',
          }}
        >
          <div
            data-testid="playhead"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${String(getTimePercent(displayCurrentTimeMs, durationMs))}%`,
              width: '2px',
              backgroundColor: color('accent'),
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />

          {snapGridLines.map((line) => (
            <div
              key={line.ms}
              data-testid="timeline-grid-line"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${String(getTimePercent(line.ms, durationMs))}%`,
                width: '1px',
                backgroundColor: color('border'),
                opacity: line.isMajor ? 0.72 : 0.32,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          ))}

          {timelineLanes.map((lane, laneIndex) => (
            <div
              key={lane.id}
              data-testid={`timeline-lane-markers-${lane.testIdSegment}`}
              style={{
                position: 'absolute',
                top: `${String(laneIndex * laneHeightPx)}px`,
                left: 0,
                right: 0,
                height: `${String(laneHeightPx)}px`,
                borderBottom: laneIndex === timelineLanes.length - 1 ? 'none' : `1px solid ${color('border')}`,
                borderTopRightRadius: laneIndex === 0 ? '4px' : undefined,
                borderBottomRightRadius: laneIndex === timelineLanes.length - 1 ? '4px' : undefined,
                backgroundColor: laneIndex % 2 === 0 ? color('surface-secondary') : color('surface-tertiary'),
              }}
            >
              {lane.keyframes.map(({ keyframe: kf, sourceIndex }, laneKeyframeIndex) => {
                const isSelected = selectedKeyframeIndex === sourceIndex;
                const actionToken: ColorToken = ACTION_COLOR_MAP[kf.action] ?? 'muted';
                const displayOffset = dragIndex === sourceIndex && dragOffsetMs !== null ? dragOffsetMs : kf.offsetMs;
                const laneKeyframes = lane.keyframes.map((entry) => entry.keyframe);
                const stackPosition =
                  dragIndex === sourceIndex ?
                    { xPx: 0, yPx: 0 }
                  : getStackPositionPx(laneKeyframes, laneKeyframeIndex, MARKER_SIZE_PX, laneHeightPx);
                const scopeLabel = getKeyframeScopeLabel(kf, getTargetName);

                return (
                  <Tooltip key={`${String(sourceIndex)}-${kf.name}-${String(kf.offsetMs)}`} delay={0}>
                    <Button
                      isIconOnly
                      data-testid="keyframe-marker"
                      data-action={kf.action}
                      data-target={kf.target ?? 'owner'}
                      data-stack-x-px={String(stackPosition.xPx)}
                      data-stack-y-px={String(stackPosition.yPx)}
                      aria-pressed={isSelected}
                      aria-label={`Keyframe ${kf.name} at ${formatTime(kf.offsetMs)} on ${scopeLabel}`}
                      onPointerDown={(e) => {
                        handleMarkerPointerDown(sourceIndex, e);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${String(getTimePercent(displayOffset, durationMs))}%`,
                        marginLeft: `${String(stackPosition.xPx)}px`,
                        top: `calc(50% + ${String(stackPosition.yPx)}px)`,
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        width: `${String(MARKER_SIZE_PX)}px`,
                        height: `${String(MARKER_SIZE_PX)}px`,
                        minWidth: `${String(MARKER_SIZE_PX)}px`,
                        minHeight: `${String(MARKER_SIZE_PX)}px`,
                        backgroundColor: color(actionToken),
                        border: isSelected ? `2px solid ${color('foreground')}` : 'none',
                        borderRadius: '2px',
                        cursor: 'grab',
                        padding: 0,
                        zIndex: 2,
                      }}
                    />
                    <Tooltip.Content>{`${scopeLabel} - ${kf.name} (${formatTime(kf.offsetMs)})`}</Tooltip.Content>
                  </Tooltip>
                );
              })}
            </div>
          ))}

          {keyframes.length === 0 ?
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color('muted'),
                fontSize: '12px',
              }}
            >
              No keyframes
            </div>
          : null}

          {dragIndex !== null && dragOffsetMs !== null ?
            <div
              data-testid="drag-indicator"
              style={{
                position: 'absolute',
                top: '-18px',
                left: `${String(getTimePercent(dragOffsetMs, durationMs))}%`,
                transform: 'translateX(-50%)',
                fontSize: '10px',
                color: color('foreground'),
                pointerEvents: 'none',
                backgroundColor: color('surface-tertiary'),
                padding: '1px 4px',
                borderRadius: '2px',
              }}
            >
              {formatTime(dragOffsetMs)}
            </div>
          : null}
          {scrubOffsetMs !== null ?
            <div
              data-testid="scrub-indicator"
              style={{
                position: 'absolute',
                top: '-18px',
                left: `${String(getTimePercent(scrubOffsetMs, durationMs))}%`,
                transform: 'translateX(-50%)',
                fontSize: '10px',
                color: color('foreground'),
                pointerEvents: 'none',
                backgroundColor: color('surface-tertiary'),
                padding: '1px 4px',
                borderRadius: '2px',
              }}
            >
              {formatTime(scrubOffsetMs)}
            </div>
          : null}
        </div>
      </div>

      {keyframes.length > 0 ?
        <div
          aria-label="Keyframes"
          role="list"
          style={{
            display: 'grid',
            gap: sp('sp-01'),
          }}
        >
          {timelineLanes.map((lane) => (
            <div key={`${lane.id}-rows`} style={{ display: 'grid', gap: sp('sp-01') }}>
              <div
                style={{
                  color: color('muted'),
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: `0 ${sp('sp-02')}`,
                }}
              >
                {lane.label}
              </div>
              {lane.keyframes.map(({ keyframe: kf, sourceIndex }) => {
                const propertyCount = Object.keys(kf.properties).length;
                const isSelected = selectedKeyframeIndex === sourceIndex;

                return (
                  <Button
                    key={`${String(sourceIndex)}-${kf.name}-row-${String(kf.offsetMs)}`}
                    size="sm"
                    variant={isSelected ? 'primary' : 'ghost'}
                    onPress={() => {
                      onSelectKeyframe(sourceIndex);
                      onSeekTimeline(kf.offsetMs);
                    }}
                    style={{
                      alignItems: 'center',
                      display: 'grid',
                      gap: sp('sp-02'),
                      gridTemplateColumns: 'minmax(0, 1fr) 72px 112px 80px',
                      justifyItems: 'start',
                      minHeight: 28,
                      width: '100%',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {kf.name}
                    </span>
                    <span>{`${String(kf.offsetMs)}ms`}</span>
                    <span>{kf.action}</span>
                    <span>{`${String(propertyCount)} ${propertyCount === 1 ? 'prop' : 'props'}`}</span>
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      : null}

      {selectedKeyframe !== null ?
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: sp('sp-03'),
            padding: sp('sp-02'),
            fontSize: '12px',
            color: color('foreground'),
            backgroundColor: color('surface-tertiary'),
            borderRadius: '4px',
          }}
        >
          <Chip size="sm">{selectedScopeLabel}</Chip>
          <span>{selectedKeyframe.name}</span>
          <span>{formatTime(selectedKeyframe.offsetMs)}</span>
          <Select
            aria-label="Easing"
            value={getDisplayEasing(selectedKeyframe)}
            onChange={(key: string | number | null) => {
              if (typeof key === 'string' && selectedKeyframeIndex !== null) {
                const preset = EASING_PRESET_OPTIONS.find((p) => p === key);

                if (preset !== undefined) {
                  onChangeEasing(selectedKeyframeIndex, preset);
                }
              }
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {EASING_PRESET_OPTIONS.map((preset) => (
                  <ListBox.Item key={preset} id={preset} textValue={preset}>
                    {preset}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      : null}
    </div>
  );
}
