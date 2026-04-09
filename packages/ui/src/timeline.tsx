import type { EasingMode, Keyframe, ModifierTimelineBinding, StateTimelineBinding, Timeline } from '@broadset/model';
import { Button, ListBoxItem, Select, Tooltip } from '@heroui/react';
import { Pause, Play, Plus, Square, Trash2, X } from 'lucide-react';
import {
  createContext,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { color, type ColorToken, sp } from './tokens';

/* ---------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------------- */

const MIN_DURATION_MS = 3000;
const DURATION_PAD_MS = 1000;
const DEFAULT_HEIGHT_PX = 240;
const RULER_STEP_MS = 500;
const SNAP_INTERVAL_MS = 100;
const PANEL_INSET = sp('sp-04');
const RULER_HEIGHT_PX = 20;
const TRACK_HEIGHT_PX = 40;
const MARKER_SIZE_PX = 12;
const PANEL_Z_INDEX = 8000;

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

/* ---------------------------------------------------------------------------
 * Timeline Editing Context (existing)
 * --------------------------------------------------------------------------- */

export interface TimelineTarget {
  readonly elementId: string;
  readonly timelineName: string;
}

export interface TimelineEditingContextValue {
  readonly target: TimelineTarget | null;
  readonly snapshot: ReadonlyMap<string, unknown> | null;
  readonly openTimeline: (elementId: string, timelineName: string, snapshot: ReadonlyMap<string, unknown>) => void;
  readonly closeTimeline: () => void;
}

const TimelineEditingContext = createContext<TimelineEditingContextValue | null>(null);

export function useTimelineEditing(): TimelineEditingContextValue | null {
  return useContext(TimelineEditingContext);
}

export function TimelineEditingProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [target, setTarget] = useState<TimelineTarget | null>(null);
  const [snapshot, setSnapshot] = useState<ReadonlyMap<string, unknown> | null>(null);

  const openTimeline = useCallback(
    (elementId: string, timelineName: string, nextSnapshot: ReadonlyMap<string, unknown>): void => {
      setTarget({ elementId, timelineName });
      setSnapshot(nextSnapshot);
    },
    [],
  );

  const closeTimeline = useCallback((): void => {
    setTarget(null);
    setSnapshot(null);
  }, []);

  return (
    <TimelineEditingContext.Provider value={{ closeTimeline, openTimeline, snapshot, target }}>
      {children}
    </TimelineEditingContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
 * TimelineEditor
 * --------------------------------------------------------------------------- */

export interface TimelineEditorProps {
  readonly timeline: Timeline;
  readonly selectedKeyframeIndex: number | null;
  readonly onSelectKeyframe: (index: number) => void;
  readonly onAddKeyframe: () => void;
  readonly onMoveKeyframe: (index: number, offsetMs: number) => void;
  readonly onChangeEasing: (index: number, easing: EasingMode) => void;
  readonly onPlayTimeline: () => void;
  readonly onStopTimeline: () => void;
  readonly onSeekTimeline: (timeMs: number) => void;
  readonly currentTimeMs: number;
  readonly isPlaying: boolean;
}

const ACTION_COLOR_MAP: Readonly<Record<string, ColorToken>> = {
  setState: 'accent',
  addModifier: 'focus',
  removeModifier: 'danger',
  none: 'muted',
};

function computeDurationMs(keyframes: readonly Keyframe[]): number {
  if (keyframes.length === 0) {
    return MIN_DURATION_MS;
  }

  const maxOffset = keyframes.reduce((max, kf) => Math.max(max, kf.offsetMs), 0);

  return Math.max(maxOffset + DURATION_PAD_MS, MIN_DURATION_MS);
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function snapToGrid(ms: number): number {
  return Math.round(ms / SNAP_INTERVAL_MS) * SNAP_INTERVAL_MS;
}

export function TimelineEditor(props: TimelineEditorProps): JSX.Element {
  const {
    timeline,
    selectedKeyframeIndex,
    onSelectKeyframe,
    onAddKeyframe,
    onMoveKeyframe,
    onChangeEasing,
    onPlayTimeline,
    onStopTimeline,
    onSeekTimeline,
    currentTimeMs,
    isPlaying,
  } = props;

  const { keyframes } = timeline;
  const durationMs = computeDurationMs(keyframes);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOffsetMs, setDragOffsetMs] = useState<number | null>(null);

  const selectedKeyframe = selectedKeyframeIndex !== null ? (keyframes[selectedKeyframeIndex] ?? null) : null;

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;

      if (track === null) {
        return 0;
      }

      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      return snapToGrid(ratio * durationMs);
    },
    [durationMs],
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if ((e.target as HTMLElement).getAttribute('data-testid') === 'keyframe-marker') {
        return;
      }

      const timeMs = getTimeFromClientX(e.clientX);

      onSeekTimeline(timeMs);
    },
    [getTimeFromClientX, onSeekTimeline],
  );

  const handleMarkerPointerDown = useCallback(
    (index: number, e: React.PointerEvent<HTMLElement>): void => {
      e.stopPropagation();
      onSelectKeyframe(index);
      setDragIndex(index);

      const kf = keyframes[index];

      if (kf !== undefined) {
        setDragOffsetMs(kf.offsetMs);
      }

      if (e.target instanceof HTMLElement && typeof e.target.setPointerCapture === 'function') {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture — safe to ignore in tests
        }
      }
    },
    [keyframes, onSelectKeyframe],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragIndex === null) {
        return;
      }

      const timeMs = getTimeFromClientX(e.clientX);

      setDragOffsetMs(timeMs);
    },
    [dragIndex, getTimeFromClientX],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>): void => {
      if (dragIndex === null) {
        return;
      }

      const timeMs = getTimeFromClientX(e.clientX);

      onMoveKeyframe(dragIndex, timeMs);
      setDragIndex(null);
      setDragOffsetMs(null);
    },
    [dragIndex, getTimeFromClientX, onMoveKeyframe],
  );

  /* Ruler labels */
  const rulerLabels = useMemo(() => {
    const labels: Array<{ readonly ms: number; readonly label: string }> = [];

    for (let ms = 0; ms <= durationMs; ms += RULER_STEP_MS) {
      labels.push({ ms, label: formatTime(ms) });
    }

    return labels;
  }, [durationMs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02'), width: '100%' }}>
      {/* Playback controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02'), padding: `0 ${sp('sp-03')}` }}>
        {isPlaying ?
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Pause"
              onPress={() => {
                onStopTimeline();
              }}
            >
              <Pause size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Stop"
              onPress={() => {
                onStopTimeline();
              }}
            >
              <Square size={14} />
            </Button>
          </>
        : <Button
            size="sm"
            variant="ghost"
            aria-label="Play"
            onPress={() => {
              onPlayTimeline();
            }}
          >
            <Play size={14} />
          </Button>
        }

        <Button
          size="sm"
          variant="ghost"
          aria-label="Add keyframe"
          onPress={() => {
            onAddKeyframe();
          }}
        >
          <Plus size={14} />
        </Button>
      </div>

      {/* Ruler */}
      <div
        style={{
          display: 'flex',
          position: 'relative',
          height: `${String(RULER_HEIGHT_PX)}px`,
          borderBottom: `1px solid ${color('border')}`,
          fontSize: '10px',
          color: color('muted'),
          userSelect: 'none',
        }}
      >
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

      {/* Keyframe track */}
      <div
        ref={trackRef}
        data-testid="timeline-track"
        data-duration-ms={String(durationMs)}
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'relative',
          height: `${String(TRACK_HEIGHT_PX)}px`,
          backgroundColor: color('surface-secondary'),
          borderRadius: '4px',
          cursor: 'crosshair',
        }}
      >
        {/* Playhead */}
        <div
          data-testid="playhead"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${String((currentTimeMs / durationMs) * 100)}%`,
            width: '2px',
            backgroundColor: color('accent'),
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Keyframe markers */}
        {keyframes.length === 0 ?
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: color('muted'),
              fontSize: '12px',
            }}
          >
            No keyframes — click + to add
          </div>
        : keyframes.map((kf, i) => {
            const isSelected = selectedKeyframeIndex === i;
            const actionToken: ColorToken = ACTION_COLOR_MAP[kf.action] ?? 'muted';
            const displayOffset = dragIndex === i && dragOffsetMs !== null ? dragOffsetMs : kf.offsetMs;

            return (
              <Tooltip key={`${kf.name}-${String(kf.offsetMs)}`}>
                <Tooltip.Trigger>
                  <Button
                    isIconOnly
                    data-testid="keyframe-marker"
                    data-action={kf.action}
                    aria-pressed={isSelected}
                    aria-label={`Keyframe ${kf.name} at ${formatTime(kf.offsetMs)}`}
                    onPointerDown={(e) => {
                      handleMarkerPointerDown(i, e);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${String((displayOffset / durationMs) * 100)}%`,
                      top: '50%',
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
                </Tooltip.Trigger>
                <Tooltip.Content>{`${kf.name} (${formatTime(kf.offsetMs)})`}</Tooltip.Content>
              </Tooltip>
            );
          })
        }

        {/* Drag indicator */}
        {dragIndex !== null && dragOffsetMs !== null && (
          <div
            data-testid="drag-indicator"
            style={{
              position: 'absolute',
              top: '-18px',
              left: `${String((dragOffsetMs / durationMs) * 100)}%`,
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
        )}
      </div>

      {/* Selected keyframe detail */}
      {selectedKeyframe !== null && (
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
            {EASING_PRESET_OPTIONS.map((preset) => (
              <ListBoxItem key={preset} id={preset}>
                {preset}
              </ListBoxItem>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

function getDisplayEasing(kf: Keyframe): string {
  const values = Object.values(kf.properties);

  if (values.length === 0) {
    return 'ease';
  }

  const first = values[0];

  return first !== undefined ? first.easing : 'ease';
}

/* ---------------------------------------------------------------------------
 * TimelineBottomPanel
 * --------------------------------------------------------------------------- */

export interface TimelineBottomPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly height?: number | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

export function TimelineBottomPanel(props: TimelineBottomPanelProps): JSX.Element {
  const { isOpen, onClose, height = DEFAULT_HEIGHT_PX, className, children } = props;

  return (
    <div
      data-testid="timeline-bottom-panel"
      aria-hidden={!isOpen}
      className={className}
      style={{
        position: 'fixed',
        bottom: 0,
        left: PANEL_INSET,
        right: PANEL_INSET,
        height: `${String(height)}px`,
        zIndex: PANEL_Z_INDEX,
        backgroundColor: color('surface'),
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        borderTop: `1px solid ${color('border')}`,
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'var(--transition-panel, transform 0.25s ease)',
        pointerEvents: isOpen ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${sp('sp-02')} ${sp('sp-03')}`,
          borderBottom: `1px solid ${color('border')}`,
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: color('foreground') }}>Timeline</span>
        <Button size="sm" variant="ghost" isIconOnly aria-label="Close" onPress={onClose}>
          <X size={14} />
        </Button>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'auto', padding: sp('sp-03') }}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * AnimationBindingSections
 * --------------------------------------------------------------------------- */

export interface AnimationBindingSectionsProps {
  readonly stateBindings: readonly StateTimelineBinding[];
  readonly modifierBindings: readonly ModifierTimelineBinding[];
  readonly timelines: readonly Timeline[];
  readonly onAddStateBinding: (stateName: string, timelineId: string) => void;
  readonly onRemoveStateBinding: (stateName: string) => void;
  readonly onRenameStateBinding: (oldName: string, newName: string) => void;
  readonly onAddModifierBinding: (modifierName: string, inTimelineId: string, outTimelineId: string) => void;
  readonly onRemoveModifierBinding: (modifierName: string) => void;
}

function sortStateBindings(bindings: readonly StateTimelineBinding[]): readonly StateTimelineBinding[] {
  return [...bindings].sort((a, b) => {
    const order = (name: string): number => {
      if (name === 'Enter') return -1;
      if (name === 'Exit') return 1;

      return 0;
    };

    const oa = order(a.stateName);
    const ob = order(b.stateName);

    if (oa !== ob) {
      return oa - ob;
    }

    return a.stateName.localeCompare(b.stateName);
  });
}

function generateModifierId(): string {
  return `mod-${crypto.randomUUID().slice(0, 8)}`;
}

export function AnimationBindingSections(props: AnimationBindingSectionsProps): JSX.Element {
  const {
    stateBindings,
    modifierBindings,
    timelines,
    onAddStateBinding,
    onRemoveStateBinding,
    onRenameStateBinding: _onRenameStateBinding,
    onAddModifierBinding,
    onRemoveModifierBinding,
  } = props;

  const timelineMap = useMemo(() => {
    const map = new Map<string, Timeline>();

    for (const tl of timelines) {
      map.set(tl.id, tl);
    }

    return map;
  }, [timelines]);

  const sortedBindings = useMemo(() => sortStateBindings(stateBindings), [stateBindings]);

  const handleAddState = useCallback(() => {
    const id = generateModifierId();

    onAddStateBinding(`state-${id}`, timelines[0]?.id ?? `tl-${id}`);
  }, [onAddStateBinding, timelines]);

  const handleAddModifier = useCallback(() => {
    const id = generateModifierId();

    onAddModifierBinding(`modifier-${id}`, `tl-in-${id}`, `tl-out-${id}`);
  }, [onAddModifierBinding]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
      {/* State Bindings */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: sp('sp-02'),
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
            }}
          >
            State Bindings
          </span>
          <Button size="sm" variant="ghost" aria-label="Add state" onPress={handleAddState}>
            <Plus size={12} />
          </Button>
        </div>
        {sortedBindings.map((binding) => {
          const tl = timelineMap.get(binding.timelineId);

          return (
            <div
              key={binding.stateName}
              data-testid="state-binding-item"
              data-state-name={binding.stateName}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${sp('sp-01')} ${sp('sp-02')}`,
                borderBottom: `1px solid ${color('border')}`,
                fontSize: '12px',
                color: color('foreground'),
              }}
            >
              <span>{binding.stateName}</span>
              <span style={{ color: color('muted') }}>{tl?.name ?? binding.timelineId}</span>
              {binding.stateName !== 'Enter' && binding.stateName !== 'Exit' && (
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label={`Remove ${binding.stateName}`}
                  onPress={() => {
                    onRemoveStateBinding(binding.stateName);
                  }}
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Modifier Bindings */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: sp('sp-02'),
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
            }}
          >
            Modifier Bindings
          </span>
          <Button size="sm" variant="ghost" aria-label="Add modifier" onPress={handleAddModifier}>
            <Plus size={12} />
          </Button>
        </div>

        {modifierBindings.map((binding) => (
          <div
            key={binding.modifierName}
            data-testid="modifier-binding-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${sp('sp-01')} ${sp('sp-02')}`,
              borderBottom: `1px solid ${color('border')}`,
              fontSize: '12px',
              color: color('foreground'),
            }}
          >
            <span>{binding.modifierName}</span>
            <div style={{ display: 'flex', gap: sp('sp-02'), color: color('muted') }}>
              <span>In: {timelineMap.get(binding.inTimelineId)?.name ?? binding.inTimelineId}</span>
              {binding.outTimelineId !== undefined && (
                <span>Out: {timelineMap.get(binding.outTimelineId)?.name ?? binding.outTimelineId}</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label={`Remove ${binding.modifierName}`}
              onPress={() => {
                onRemoveModifierBinding(binding.modifierName);
              }}
            >
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
