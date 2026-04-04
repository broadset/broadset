import { Button } from '@heroui/react';
import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineKeyframe {
  readonly offsetMs: number;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface TimelineEditorProps {
  readonly keyframes: readonly TimelineKeyframe[];
  readonly durationMs: number;
  readonly selectedIndex: number | null;
  readonly onSelectKeyframe: (index: number) => void;
  readonly onAddKeyframe: () => void;
  readonly onMoveKeyframe: (index: number, newOffsetMs: number) => void;
  readonly onPlayTimeline: () => void;
}

export interface TimelineBottomPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly keyframes?: readonly TimelineKeyframe[];
  readonly durationMs?: number;
  readonly selectedIndex?: number | null;
  readonly onSelectKeyframe?: (index: number) => void;
  readonly onAddKeyframe?: () => void;
  readonly onMoveKeyframe?: (index: number, newOffsetMs: number) => void;
  readonly onPlayTimeline?: () => void;
  readonly className?: string;
  readonly height?: number;
}

interface StateBindingDisplay {
  readonly stateName: string;
  readonly timelineId: string;
  readonly timelineName: string;
}

interface ModifierBindingDisplay {
  readonly modifierName: string;
  readonly inTimelineId: string;
  readonly inTimelineName: string;
  readonly outTimelineId?: string;
  readonly outTimelineName?: string;
}

export interface AnimationBindingSectionsProps {
  readonly stateBindings: readonly StateBindingDisplay[];
  readonly modifierBindings: readonly ModifierBindingDisplay[];
  readonly onAddModifier: () => void;
  readonly onRemoveStateBinding: (stateName: string) => void;
}

// ---------------------------------------------------------------------------
// TimelineEditingContext
// ---------------------------------------------------------------------------

interface TimelineTarget {
  readonly elementId: string;
  readonly timelineName: string;
}

interface TimelineEditingContextValue {
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
    (elementId: string, timelineName: string, snap: ReadonlyMap<string, unknown>): void => {
      setTarget({ elementId, timelineName });
      setSnapshot(snap);
    },
    [],
  );

  const closeTimeline = useCallback((): void => {
    setTarget(null);
    setSnapshot(null);
  }, []);

  return (
    <TimelineEditingContext value={{ target, snapshot, openTimeline, closeTimeline }}>
      {children}
    </TimelineEditingContext>
  );
}

// ---------------------------------------------------------------------------
// TimelineEditor
// ---------------------------------------------------------------------------

export function TimelineEditor({
  keyframes,
  durationMs,
  selectedIndex,
  onSelectKeyframe,
  onAddKeyframe,
  onPlayTimeline,
}: TimelineEditorProps): JSX.Element {
  if (keyframes.length === 0) {
    return (
      <div data-testid="timeline-editor">
        <p>No keyframes</p>
        <Button size="sm" variant="ghost" aria-label="Add keyframe" onPress={onAddKeyframe}>
          +
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="timeline-editor">
      <div style={{ position: 'relative', height: 32 }}>
        {keyframes.map((kf, idx) => {
          const left = durationMs > 0 ? (kf.offsetMs / durationMs) * 100 : 0;

          return (
            <Button
              key={idx}
              isIconOnly
              size="sm"
              aria-label={`Keyframe at ${String(kf.offsetMs)}ms`}
              aria-pressed={idx === selectedIndex}
              style={{
                position: 'absolute',
                left: `${String(left)}%`,
                width: 12,
                height: 12,
                minWidth: 12,
                borderRadius: '50%',
                backgroundColor: idx === selectedIndex ? '#2563eb' : '#94a3b8',
                border: 'none',
                cursor: 'pointer',
                transform: 'translateX(-50%)',
                padding: 0,
              }}
              onPress={() => {
                onSelectKeyframe(idx);
              }}
            />
          );
        })}
      </div>

      {selectedIndex !== null ?
        <div data-testid="keyframe-hint" style={{ fontSize: 12, marginTop: 4 }}>
          {`Keyframe at ${String(keyframes[selectedIndex]?.offsetMs ?? 0)}ms`}
        </div>
      : null}

      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <Button size="sm" variant="ghost" aria-label="Add keyframe" onPress={onAddKeyframe}>
          +
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Play timeline"
          onPress={() => {
            onPlayTimeline();
          }}
        >
          Play
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimelineBottomPanel
// ---------------------------------------------------------------------------

export function TimelineBottomPanel({
  isOpen,
  onClose,
  keyframes,
  durationMs,
  selectedIndex,
  onSelectKeyframe,
  onAddKeyframe,
  onMoveKeyframe,
  onPlayTimeline,
  className,
  height,
}: TimelineBottomPanelProps): JSX.Element {
  if (!isOpen) {
    return (
      <div
        data-testid="timeline-bottom-panel"
        aria-hidden="true"
        className={className}
        style={{ height: height ?? 200 }}
      />
    );
  }

  return (
    <div
      data-testid="timeline-bottom-panel"
      className={className}
      style={{ height: height ?? 200, borderTop: '1px solid #ccc' }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 4 }}>
        <Button size="sm" variant="ghost" aria-label="Close timeline" onPress={onClose}>
          Close
        </Button>
      </div>
      <TimelineEditor
        keyframes={keyframes ?? []}
        durationMs={durationMs ?? 2000}
        selectedIndex={selectedIndex ?? null}
        onSelectKeyframe={onSelectKeyframe ?? (() => {})}
        onAddKeyframe={onAddKeyframe ?? (() => {})}
        onMoveKeyframe={onMoveKeyframe ?? (() => {})}
        onPlayTimeline={onPlayTimeline ?? (() => {})}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnimationBindingSections
// ---------------------------------------------------------------------------

export function AnimationBindingSections({
  stateBindings,
  modifierBindings,
  onAddModifier,
  onRemoveStateBinding,
}: AnimationBindingSectionsProps): JSX.Element {
  return (
    <div data-testid="animation-binding-sections">
      <section>
        <h4>State Bindings</h4>
        {stateBindings.length === 0 ?
          <p>No state bindings</p>
        : <ul style={{ listStyle: 'none', padding: 0 }}>
            {stateBindings.map((binding) => (
              <li key={binding.stateName} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span>{binding.stateName}</span>
                <span>{binding.timelineName}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${binding.stateName}`}
                  onPress={() => {
                    onRemoveStateBinding(binding.stateName);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        }
      </section>

      <section>
        <h4>Modifier Bindings</h4>
        {modifierBindings.length === 0 ?
          <p>No modifier bindings</p>
        : <ul style={{ listStyle: 'none', padding: 0 }}>
            {modifierBindings.map((binding) => (
              <li key={binding.modifierName} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span>{binding.modifierName}</span>
                <span>{binding.inTimelineName}</span>
                {binding.outTimelineName !== undefined ?
                  <span>{binding.outTimelineName}</span>
                : null}
              </li>
            ))}
          </ul>
        }
        <Button size="sm" variant="ghost" aria-label="Add modifier" onPress={onAddModifier}>
          Add Modifier
        </Button>
      </section>
    </div>
  );
}
