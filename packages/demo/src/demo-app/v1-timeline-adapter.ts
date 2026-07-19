import type { projectFormatV1 } from '@broadset/model';
import type { MarkerCategory, TimelineViewKeyframe, TimelineViewSequence, TimelineViewTrack } from '@broadset/ui';

import { interpolationToPreset } from './keyframe-interpolation-presets';

const NUMERIC_VALUE_TYPES: ReadonlySet<projectFormatV1.ValueType> = new Set([
  'number',
  'integer',
  'length',
  'angle',
  'point2d',
  'point3d',
]);

const FALLBACK_TICKS_PER_SECOND = 1000;

/** timeline.md marker colors: numeric/tuple → accent, color → focus, hold/step or discrete values → danger. */
export function markerCategoryForKeyframe(
  valueType: projectFormatV1.ValueType,
  interpolation: projectFormatV1.Interpolation | undefined,
): MarkerCategory {
  if (interpolation?.kind === 'hold' || interpolation?.kind === 'step') return 'danger';
  if (NUMERIC_VALUE_TYPES.has(valueType)) return 'accent';
  if (valueType === 'color') return 'focus';

  return 'danger';
}

function keyframeValueLabel(value: projectFormatV1.TypedValue): string {
  switch (value.type) {
    case 'number':
    case 'integer':
    case 'length':
    case 'angle':
      return String(value.value);
    case 'string':
      return value.value;
    case 'boolean':
      return value.value ? 'true' : 'false';
    default:
      return value.type;
  }
}

function pointerTail(pointer: string): string {
  const segments = pointer.split('/');

  return segments[segments.length - 1] ?? pointer;
}

function toViewTrack(
  track: projectFormatV1.Track,
  elementNames: ReadonlyMap<projectFormatV1.Id, string>,
  selectedElementIds: ReadonlySet<string>,
): TimelineViewTrack {
  const entityId = track.target.entity.entityId;
  const elementName = elementNames.get(entityId) ?? entityId;
  const keyframes: readonly TimelineViewKeyframe[] = track.keyframes.map((keyframe) => ({
    id: keyframe.id,
    tick: keyframe.tick,
    category: markerCategoryForKeyframe(track.valueType, keyframe.interpolation),
    valueLabel: keyframeValueLabel(keyframe.value),
    interpolationLabel:
      keyframe.interpolation === undefined ? null : (interpolationToPreset(keyframe.interpolation) ?? null),
  }));

  return {
    id: track.id,
    label: `${elementName} · ${pointerTail(track.target.pointer)}`,
    sortKey: `${entityId} ${track.target.pointer}`,
    targetsSelection: selectedElementIds.has(entityId),
    keyframes,
  };
}

export function buildTimelineViewSequence(options: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly sequence: projectFormatV1.Sequence;
  readonly selectedElementIds: ReadonlySet<string>;
}): TimelineViewSequence {
  const elementNames = new Map(options.document.elements.map((element) => [element.id, element.name]));

  return {
    id: options.sequence.id,
    name: options.sequence.name,
    durationTicks: options.sequence.durationTicks,
    ticksPerSecond: options.document.timebase?.ticksPerSecond ?? FALLBACK_TICKS_PER_SECOND,
    tracks: options.sequence.tracks.map((track) => toViewTrack(track, elementNames, options.selectedElementIds)),
  };
}
