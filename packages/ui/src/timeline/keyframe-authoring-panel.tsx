import { Button, Input, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';

import { color, font, sp } from '../tokens';

/** Friendly interpolation presets a number track keyframe can carry; the host maps them to typed records. */
export const KEYFRAME_INTERPOLATION_PRESETS = [
  'hold',
  'step',
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'spring',
] as const;

export type KeyframeInterpolationPreset = (typeof KEYFRAME_INTERPOLATION_PRESETS)[number];

export interface KeyframeAuthoringKeyframe {
  readonly id: string;
  readonly tick: number;
  /** Editable scalar for number tracks; null when the track value is not a plain number. */
  readonly numberValue: number | null;
  /** Friendly interpolation preset for this keyframe's outgoing segment; null on the final keyframe. */
  readonly interpolation: KeyframeInterpolationPreset | null;
}

export interface KeyframeAuthoringTrack {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly KeyframeAuthoringKeyframe[];
}

export interface KeyframeAuthoringSequence {
  readonly id: string;
  readonly name: string;
  readonly durationTicks: number;
  readonly tracks: readonly KeyframeAuthoringTrack[];
}

export interface KeyframeAuthoringPanelProps {
  readonly sequences: readonly KeyframeAuthoringSequence[];
  readonly selectedSequenceId: string | null;
  readonly currentTick: number;
  /** Whether a schema-approved property track can be created for the current selection. */
  readonly canAddTrack: boolean;
  readonly onSelectSequence: (sequenceId: string) => void;
  readonly onAddSequence: () => void;
  readonly onRemoveSequence: (sequenceId: string) => void;
  readonly onSetDuration: (sequenceId: string, durationTicks: number) => void;
  readonly onAddOpacityTrack: (sequenceId: string) => void;
  readonly onAddKeyframe: (sequenceId: string, trackId: string) => void;
  readonly onUpdateKeyframeTick: (sequenceId: string, trackId: string, keyframeId: string, tick: number) => void;
  readonly onUpdateKeyframeValue: (sequenceId: string, trackId: string, keyframeId: string, value: number) => void;
  readonly onSetKeyframeInterpolation: (
    sequenceId: string,
    trackId: string,
    keyframeId: string,
    preset: KeyframeInterpolationPreset,
  ) => void;
  readonly onRemoveKeyframe: (sequenceId: string, trackId: string, keyframeId: string) => void;
}

const INTERPOLATION_PRESET_SET: ReadonlySet<string> = new Set(KEYFRAME_INTERPOLATION_PRESETS);

function isInterpolationPreset(value: string): value is KeyframeInterpolationPreset {
  return INTERPOLATION_PRESET_SET.has(value);
}

/**
 * Presentational v1 keyframe authoring surface. It renders the active sequence's tracks and keyframes
 * with add/delete/value/interpolation controls and emits stable-id callbacks the host binds to the
 * invariant-safe editor sequence commands. Visible length is driven only by `durationTicks`.
 */
export function KeyframeAuthoringPanel(props: KeyframeAuthoringPanelProps): JSX.Element {
  const selected = props.sequences.find((sequence) => sequence.id === props.selectedSequenceId) ?? props.sequences[0];

  return (
    <section
      aria-label="Keyframe authoring"
      data-testid="keyframe-authoring-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sp('sp-03'),
        padding: sp('sp-03'),
        font: font('body-compact'),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: sp('sp-03') }}>
        <span style={{ font: font('label') }}>Sequences</span>
        <Button
          aria-label="Add sequence"
          data-testid="add-sequence"
          size="sm"
          variant="secondary"
          onPress={props.onAddSequence}
        >
          <Plus size={14} />
          Sequence
        </Button>
      </div>

      {props.sequences.length === 0 || selected === undefined ?
        <div data-testid="no-sequences" style={{ color: color('muted') }}>
          No animation sequences yet. Add one to start authoring keyframes.
        </div>
      : <>
          <Select
            aria-label="Active sequence"
            value={selected.id}
            onChange={(key) => {
              if (key !== null) props.onSelectSequence(String(key));
            }}
          >
            <Select.Trigger data-testid="sequence-select">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {props.sequences.map((sequence) => (
                  <ListBox.Item id={sequence.id} key={sequence.id} textValue={sequence.name}>
                    {sequence.name}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: sp('sp-03') }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02'), color: color('muted') }}>
              Duration
              <Input
                aria-label="Duration ticks"
                data-testid="sequence-duration"
                type="number"
                value={String(selected.durationTicks)}
                onChange={(event) => {
                  const durationTicks = Number(event.currentTarget.value);

                  if (Number.isSafeInteger(durationTicks) && durationTicks >= 0) {
                    props.onSetDuration(selected.id, durationTicks);
                  }
                }}
              />
              {`ticks · ${String(selected.tracks.length)} tracks`}
            </label>
            <div style={{ display: 'flex', gap: sp('sp-02') }}>
              <Button
                aria-label="Add opacity track"
                data-testid="add-opacity-track"
                isDisabled={!props.canAddTrack}
                size="sm"
                variant="secondary"
                onPress={() => {
                  props.onAddOpacityTrack(selected.id);
                }}
              >
                <Plus size={14} />
                Opacity track
              </Button>
              <Button
                aria-label="Delete sequence"
                data-testid="remove-sequence"
                size="sm"
                variant="danger"
                onPress={() => {
                  props.onRemoveSequence(selected.id);
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          {selected.tracks.map((track) => (
            <section
              key={track.id}
              aria-label={`${track.name} track`}
              data-testid={`track-${track.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: sp('sp-02'),
                borderTop: `1px solid ${color('border')}`,
                paddingTop: sp('sp-02'),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ font: font('label') }}>{track.name}</span>
                <Button
                  aria-label={`Add ${track.name} keyframe`}
                  data-testid={`add-keyframe-${track.id}`}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    props.onAddKeyframe(selected.id, track.id);
                  }}
                >
                  <Plus size={14} />
                  {`Keyframe @ ${String(props.currentTick)}`}
                </Button>
              </div>

              {track.keyframes.map((keyframe, keyframeIndex) => (
                <div
                  key={keyframe.id}
                  data-testid={`keyframe-${keyframe.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02') }}
                >
                  <Input
                    aria-label={`${track.name} keyframe ${String(keyframeIndex + 1)} tick`}
                    data-testid={`keyframe-tick-${keyframe.id}`}
                    type="number"
                    value={String(keyframe.tick)}
                    onChange={(event) => {
                      const tick = Number(event.currentTarget.value);

                      if (Number.isSafeInteger(tick) && tick >= 0) {
                        props.onUpdateKeyframeTick(selected.id, track.id, keyframe.id, tick);
                      }
                    }}
                  />
                  {keyframe.numberValue === null ?
                    <span data-testid={`keyframe-value-${keyframe.id}`} style={{ color: color('muted') }}>
                      typed value
                    </span>
                  : <Input
                      aria-label={`${track.name} value at tick ${String(keyframe.tick)}`}
                      data-testid={`keyframe-value-${keyframe.id}`}
                      type="number"
                      value={String(keyframe.numberValue)}
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value);

                        if (Number.isFinite(value))
                          props.onUpdateKeyframeValue(selected.id, track.id, keyframe.id, value);
                      }}
                    />
                  }
                  {keyframe.interpolation === null ?
                    <span data-testid={`keyframe-interpolation-${keyframe.id}`} style={{ color: color('muted') }}>
                      final
                    </span>
                  : <Select
                      aria-label={`${track.name} interpolation at tick ${String(keyframe.tick)}`}
                      value={keyframe.interpolation}
                      onChange={(key) => {
                        const preset = key === null ? '' : String(key);

                        if (isInterpolationPreset(preset)) {
                          props.onSetKeyframeInterpolation(selected.id, track.id, keyframe.id, preset);
                        }
                      }}
                    >
                      <Select.Trigger data-testid={`keyframe-interpolation-trigger-${keyframe.id}`}>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {KEYFRAME_INTERPOLATION_PRESETS.map((preset) => (
                            <ListBox.Item id={preset} key={preset} textValue={preset}>
                              {preset}
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  }
                  <Button
                    aria-label={`Delete keyframe at tick ${String(keyframe.tick)}`}
                    data-testid={`remove-keyframe-${keyframe.id}`}
                    size="sm"
                    variant="danger"
                    onPress={() => {
                      props.onRemoveKeyframe(selected.id, track.id, keyframe.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </section>
          ))}
        </>
      }
    </section>
  );
}
