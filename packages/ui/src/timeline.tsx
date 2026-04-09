import type { EasingMode, Keyframe, ModifierTimelineBinding, StateTimelineBinding, Timeline } from '@broadset/model';
import { validateCubicBezier } from '@broadset/model';
import { Button, ListBox, Select, Tooltip } from '@heroui/react';
import { Pause, Play, Plus, Square, Trash2, X } from 'lucide-react';
import {
  createContext,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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
              <Tooltip key={`${kf.name}-${String(kf.offsetMs)}`} delay={0}>
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

/* ---------------------------------------------------------------------------
 * Easing Graph Editor (7-D)
 * --------------------------------------------------------------------------- */

const GRAPH_SIZE = 160;
const HANDLE_RADIUS = 6;

/** Preset chips displayed above the curve. */
const EASING_GRAPH_PRESETS: readonly EasingMode[] = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'spring-gentle',
  'spring-bouncy',
  'spring-stiff',
];

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;

interface BezierHandles {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function parseCubicBezier(easing: string): BezierHandles | null {
  const m = CUBIC_BEZIER_RE.exec(easing);

  if (m === null) {
    return null;
  }

  const x1 = Number(m[1]);
  const y1 = Number(m[2]);
  const x2 = Number(m[3]);
  const y2 = Number(m[4]);

  if (!validateCubicBezier(x1, y1, x2, y2)) {
    return null;
  }

  return { x1, y1, x2, y2 };
}

function isSpringEasing(easing: EasingMode): boolean {
  return (
    easing === 'spring-gentle' ||
    easing === 'spring-bouncy' ||
    easing === 'spring-stiff' ||
    easing.startsWith('spring(')
  );
}

/** Known preset curves mapped to cubic-bezier handles for display. */
const PRESET_CURVES: Readonly<Record<string, BezierHandles>> = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  ease: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
};

function getDisplayHandles(easing: EasingMode): BezierHandles | null {
  const preset = PRESET_CURVES[easing];

  if (preset !== undefined) {
    return preset;
  }

  return parseCubicBezier(easing);
}

/** Build an SVG path data string for a cubic-bezier curve in the unit square. */
function buildCurvePath(h: BezierHandles, size: number): string {
  const sx = (v: number): number => v * size;
  const sy = (v: number): number => (1 - v) * size;

  return `M ${String(sx(0))} ${String(sy(0))} C ${String(sx(h.x1))} ${String(sy(h.y1))}, ${String(sx(h.x2))} ${String(sy(h.y2))}, ${String(sx(1))} ${String(sy(1))}`;
}

/** Evaluate cubic-bezier at parameter t using De Casteljau's algorithm. */
function evalBezierY(h: BezierHandles, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return mt3 * 0 + 3 * mt2 * t * h.y1 + 3 * mt * t2 * h.y2 + t3 * 1;
}

export interface EasingGraphEditorProps {
  readonly easing: EasingMode;
  readonly onChange: (easing: EasingMode) => void;
  readonly isPlaying: boolean;
  readonly playbackProgress: number;
  readonly onClose?: (() => void) | undefined;
}

export function EasingGraphEditor(props: EasingGraphEditorProps): JSX.Element {
  const { easing, onChange, isPlaying, playbackProgress, onClose } = props;

  const isCubicBezier = parseCubicBezier(easing) !== null;
  const isSpring = isSpringEasing(easing);
  const handles = getDisplayHandles(easing);

  /* Drag state for cubic-bezier handles */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragHandle, setDragHandle] = useState<1 | 2 | null>(null);
  const [localHandles, setLocalHandles] = useState<BezierHandles | null>(null);

  /* Click-outside detection: close when clicking outside the graph editor */
  useEffect(() => {
    if (onClose === undefined) {
      return;
    }

    function handleClickOutside(e: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const activeHandles = localHandles ?? handles;

  const clientToUnit = useCallback((clientX: number, clientY: number): { readonly ux: number; readonly uy: number } => {
    const svg = svgRef.current;

    if (svg === null) {
      return { ux: 0, uy: 0 };
    }

    const rect = svg.getBoundingClientRect();
    const ux = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const uy = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

    return { ux, uy };
  }, []);

  const handlePointerDownHandle = useCallback(
    (which: 1 | 2, e: React.PointerEvent<SVGCircleElement>): void => {
      e.stopPropagation();
      setDragHandle(which);

      if (handles !== null) {
        setLocalHandles(handles);
      }

      const target = e.target;

      if (target instanceof Element && 'setPointerCapture' in target) {
        try {
          (target as Element & { setPointerCapture(id: number): void }).setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture
        }
      }
    },
    [handles],
  );

  const handlePointerMoveGraph = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): void => {
      if (dragHandle === null || localHandles === null) {
        return;
      }

      const { ux, uy } = clientToUnit(e.clientX, e.clientY);
      const clampedX = Math.max(0, Math.min(1, ux));

      if (dragHandle === 1) {
        setLocalHandles({ ...localHandles, x1: clampedX, y1: uy });
      } else {
        setLocalHandles({ ...localHandles, x2: clampedX, y2: uy });
      }
    },
    [dragHandle, localHandles, clientToUnit],
  );

  const handlePointerUpGraph = useCallback(
    (_e: React.PointerEvent<SVGSVGElement>): void => {
      if (dragHandle === null || localHandles === null) {
        return;
      }

      const h = localHandles;

      const newEasing: EasingMode = `cubic-bezier(${h.x1.toFixed(2)}, ${h.y1.toFixed(2)}, ${h.x2.toFixed(2)}, ${h.y2.toFixed(2)})`;

      onChange(newEasing);
      setDragHandle(null);
      setLocalHandles(null);
    },
    [dragHandle, localHandles, onChange],
  );

  /* Preview dot position */
  const previewDotVisible = isPlaying && playbackProgress > 0;
  const previewDotY = activeHandles !== null ? evalBezierY(activeHandles, playbackProgress) : playbackProgress;

  return (
    <div
      ref={rootRef}
      data-testid="easing-graph-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-02'),
        padding: sp('sp-03'),
        backgroundColor: color('surface-tertiary'),
        borderRadius: '8px',
      }}
    >
      {/* Preset chips */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: sp('sp-01'),
        }}
      >
        {EASING_GRAPH_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={easing === preset ? 'primary' : 'ghost'}
            aria-label={preset}
            onPress={() => {
              onChange(preset);
            }}
          >
            {preset}
          </Button>
        ))}
      </div>

      {/* Graph canvas */}
      <div data-testid="easing-graph-canvas" style={{ position: 'relative' }}>
        {isSpring ?
          /* Spring curve indicator — simplified visual */
          <div
            data-testid="spring-curve-indicator"
            style={{
              width: `${String(GRAPH_SIZE)}px`,
              height: `${String(GRAPH_SIZE)}px`,
              border: `1px solid ${color('border')}`,
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color('muted'),
              fontSize: '11px',
              backgroundColor: color('surface'),
            }}
          >
            <svg width={GRAPH_SIZE} height={GRAPH_SIZE} viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}>
              {/* Spring decay curve with overshoot */}
              <path
                d={`M 0 ${String(GRAPH_SIZE)} Q ${String(GRAPH_SIZE * 0.3)} ${String(-GRAPH_SIZE * 0.15)}, ${String(GRAPH_SIZE * 0.5)} ${String(GRAPH_SIZE * 0.05)} T ${String(GRAPH_SIZE)} 0`}
                fill="none"
                stroke={color('accent')}
                strokeWidth="2"
              />
              {/* Baseline at y=0 (top) and y=1 (bottom) */}
              <line
                x1="0"
                y1={String(GRAPH_SIZE)}
                x2={String(GRAPH_SIZE)}
                y2={String(GRAPH_SIZE)}
                stroke={color('border')}
                strokeDasharray="4"
              />
              <line x1="0" y1="0" x2={String(GRAPH_SIZE)} y2="0" stroke={color('border')} strokeDasharray="4" />
            </svg>
          </div>
        : /* Cubic-bezier / preset curve */
          <svg
            ref={svgRef}
            data-testid="easing-graph-svg"
            width={GRAPH_SIZE}
            height={GRAPH_SIZE}
            viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}
            style={{
              border: `1px solid ${color('border')}`,
              borderRadius: '4px',
              backgroundColor: color('surface'),
            }}
            onPointerMove={handlePointerMoveGraph}
            onPointerUp={handlePointerUpGraph}
          >
            {/* Unit square grid lines */}
            <line
              x1="0"
              y1={String(GRAPH_SIZE)}
              x2={String(GRAPH_SIZE)}
              y2={String(GRAPH_SIZE)}
              stroke={color('border')}
              strokeDasharray="4"
            />
            <line x1="0" y1="0" x2={String(GRAPH_SIZE)} y2="0" stroke={color('border')} strokeDasharray="4" />
            <line x1="0" y1="0" x2="0" y2={String(GRAPH_SIZE)} stroke={color('border')} strokeDasharray="4" />
            <line
              x1={String(GRAPH_SIZE)}
              y1="0"
              x2={String(GRAPH_SIZE)}
              y2={String(GRAPH_SIZE)}
              stroke={color('border')}
              strokeDasharray="4"
            />

            {/* Curve path */}
            {activeHandles !== null && (
              <path
                d={buildCurvePath(activeHandles, GRAPH_SIZE)}
                fill="none"
                stroke={color('accent')}
                strokeWidth="2"
              />
            )}

            {/* Control handles — only for custom cubic-bezier */}
            {isCubicBezier && activeHandles !== null && (
              <>
                {/* Handle 1 line */}
                <line
                  x1="0"
                  y1={String(GRAPH_SIZE)}
                  x2={String(activeHandles.x1 * GRAPH_SIZE)}
                  y2={String((1 - activeHandles.y1) * GRAPH_SIZE)}
                  stroke={color('muted')}
                  strokeWidth="1"
                />
                {/* Handle 1 */}
                <circle
                  data-testid="bezier-handle"
                  cx={activeHandles.x1 * GRAPH_SIZE}
                  cy={(1 - activeHandles.y1) * GRAPH_SIZE}
                  r={HANDLE_RADIUS}
                  fill={color('accent')}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    handlePointerDownHandle(1, e);
                  }}
                />
                {/* Handle 2 line */}
                <line
                  x1={String(GRAPH_SIZE)}
                  y1="0"
                  x2={String(activeHandles.x2 * GRAPH_SIZE)}
                  y2={String((1 - activeHandles.y2) * GRAPH_SIZE)}
                  stroke={color('muted')}
                  strokeWidth="1"
                />
                {/* Handle 2 */}
                <circle
                  data-testid="bezier-handle"
                  cx={activeHandles.x2 * GRAPH_SIZE}
                  cy={(1 - activeHandles.y2) * GRAPH_SIZE}
                  r={HANDLE_RADIUS}
                  fill={color('accent')}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    handlePointerDownHandle(2, e);
                  }}
                />
              </>
            )}

            {/* Preview dot */}
            {previewDotVisible && (
              <circle
                data-testid="preview-dot"
                cx={playbackProgress * GRAPH_SIZE}
                cy={(1 - previewDotY) * GRAPH_SIZE}
                r={4}
                fill={color('danger')}
              />
            )}
          </svg>
        }

        {/* Preview dot for spring curves */}
        {isSpring && previewDotVisible && (
          <svg
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            width={GRAPH_SIZE}
            height={GRAPH_SIZE}
            viewBox={`0 0 ${String(GRAPH_SIZE)} ${String(GRAPH_SIZE)}`}
          >
            <circle
              data-testid="preview-dot"
              cx={playbackProgress * GRAPH_SIZE}
              cy={GRAPH_SIZE * 0.5}
              r={4}
              fill={color('danger')}
            />
          </svg>
        )}
      </div>

      {/* Close button */}
      {onClose !== undefined && (
        <Button size="sm" variant="ghost" aria-label="Close" onPress={onClose}>
          <X size={14} />
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Per-Property Keyframe Lanes (7-D)
 * --------------------------------------------------------------------------- */

const PROPERTY_CATEGORIES: ReadonlyArray<{
  readonly name: string;
  readonly properties: ReadonlySet<string>;
}> = [
  { name: 'Geometry', properties: new Set(['x', 'y', 'width', 'height', 'rotation']) },
  { name: 'Appearance', properties: new Set(['opacity', 'backgroundColor', 'borderColor', 'borderWidth', 'shadow']) },
  { name: 'Typography', properties: new Set(['fontSize', 'color', 'fontWeight', 'lineHeight', 'letterSpacing']) },
];

function getCategoryForProperty(prop: string): string {
  for (const cat of PROPERTY_CATEGORIES) {
    if (cat.properties.has(prop)) {
      return cat.name;
    }
  }

  return 'Other';
}

/** Collect all unique animated property names from keyframes. */
function collectAnimatedProperties(keyframes: readonly Keyframe[]): readonly string[] {
  const props = new Set<string>();

  for (const kf of keyframes) {
    for (const key of Object.keys(kf.properties)) {
      props.add(key);
    }
  }

  return [...props];
}

/** Group properties by category, respecting the category order. */
function groupPropertiesByCategory(
  properties: readonly string[],
): ReadonlyArray<{ readonly category: string; readonly properties: readonly string[] }> {
  const groups = new Map<string, string[]>();

  for (const prop of properties) {
    const cat = getCategoryForProperty(prop);
    let arr = groups.get(cat);

    if (arr === undefined) {
      arr = [];
      groups.set(cat, arr);
    }

    arr.push(prop);
  }

  // Sort by the predefined category order, then "Other" last.
  const result: Array<{ readonly category: string; readonly properties: readonly string[] }> = [];

  for (const cat of PROPERTY_CATEGORIES) {
    const arr = groups.get(cat.name);

    if (arr !== undefined && arr.length > 0) {
      result.push({ category: cat.name, properties: arr });
      groups.delete(cat.name);
    }
  }

  // Remaining (Other)
  for (const [cat, arr] of groups) {
    if (arr.length > 0) {
      result.push({ category: cat, properties: arr });
    }
  }

  return result;
}

const LANE_HEIGHT_PX = 28;

export interface PerPropertyLanesProps {
  readonly keyframes: readonly Keyframe[];
  readonly durationMs: number;
  readonly onAddPropertyKeyframe: (offsetMs: number, property: string) => void;
  readonly onMovePropertyKeyframe: (fromIndex: number, property: string, toOffsetMs: number) => void;
  readonly isExpanded?: boolean | undefined;
}

export function PerPropertyLanes(props: PerPropertyLanesProps): JSX.Element {
  const { keyframes, durationMs, onAddPropertyKeyframe, onMovePropertyKeyframe, isExpanded = true } = props;

  const allProperties = useMemo(() => collectAnimatedProperties(keyframes), [keyframes]);
  const groupedProperties = useMemo(() => groupPropertiesByCategory(allProperties), [allProperties]);

  /* Drag state for property keyframe markers */
  const [dragState, setDragState] = useState<{
    readonly keyframeIndex: number;
    readonly property: string;
  } | null>(null);
  const laneContainerRef = useRef<HTMLDivElement | null>(null);

  const getOffsetFromClientX = useCallback(
    (clientX: number): number => {
      const container = laneContainerRef.current;

      if (container === null) {
        return 0;
      }

      const rect = container.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      return snapToGrid(ratio * durationMs);
    },
    [durationMs],
  );

  const handleLaneDoubleClick = useCallback(
    (property: string, e: React.MouseEvent<HTMLDivElement>): void => {
      const offsetMs = getOffsetFromClientX(e.clientX);

      onAddPropertyKeyframe(offsetMs, property);
    },
    [getOffsetFromClientX, onAddPropertyKeyframe],
  );

  const handleMarkerPointerDown = useCallback(
    (keyframeIndex: number, property: string, e: React.PointerEvent<HTMLDivElement>): void => {
      e.stopPropagation();
      setDragState({ keyframeIndex, property });

      if (e.target instanceof HTMLElement && typeof e.target.setPointerCapture === 'function') {
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {
          // jsdom doesn't support setPointerCapture
        }
      }
    },
    [],
  );

  const handleContainerPointerMove = useCallback((_e: React.PointerEvent<HTMLDivElement>): void => {
    // Drag visual feedback could be added here; the commit happens on pointerUp.
  }, []);

  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (dragState === null) {
        return;
      }

      const offsetMs = getOffsetFromClientX(e.clientX);

      onMovePropertyKeyframe(dragState.keyframeIndex, dragState.property, offsetMs);
      setDragState(null);
    },
    [dragState, getOffsetFromClientX, onMovePropertyKeyframe],
  );

  if (!isExpanded || allProperties.length === 0) {
    return <div data-testid="per-property-lanes-collapsed" />;
  }

  return (
    <div
      ref={laneContainerRef}
      data-testid="per-property-lanes"
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-01'),
      }}
    >
      {groupedProperties.map((group) => (
        <div key={group.category}>
          {/* Category heading */}
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: color('muted'),
              textTransform: 'uppercase',
              padding: `${sp('sp-01')} 0`,
            }}
          >
            {group.category}
          </div>

          {/* Property lanes */}
          {group.properties.map((prop) => (
            <div
              key={prop}
              data-testid="property-lane"
              data-property={prop}
              onDoubleClick={(e) => {
                handleLaneDoubleClick(prop, e);
              }}
              style={{
                position: 'relative',
                height: `${String(LANE_HEIGHT_PX)}px`,
                backgroundColor: color('surface-secondary'),
                borderRadius: '3px',
                marginBottom: '2px',
                cursor: 'crosshair',
              }}
            >
              {/* Property label */}
              <span
                style={{
                  position: 'absolute',
                  left: sp('sp-01'),
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '10px',
                  color: color('muted'),
                  zIndex: 1,
                  pointerEvents: 'none',
                }}
              >
                {prop}
              </span>

              {/* Per-property keyframe markers */}
              {keyframes.map((kf, kfIndex) => {
                const propValue = kf.properties[prop];

                if (propValue === undefined) {
                  return null;
                }

                return (
                  <div
                    key={`${kf.name}-${String(kf.offsetMs)}-${prop}`}
                    data-testid="property-keyframe-marker"
                    data-offset-ms={String(kf.offsetMs)}
                    data-property={prop}
                    onPointerDown={(e) => {
                      handleMarkerPointerDown(kfIndex, prop, e);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${String((kf.offsetMs / durationMs) * 100)}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                      width: '8px',
                      height: '8px',
                      backgroundColor: color('accent'),
                      borderRadius: '1px',
                      cursor: 'grab',
                      zIndex: 2,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
