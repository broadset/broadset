export type MarkerCategory = 'accent' | 'focus' | 'danger';

export interface TimelineViewKeyframe {
  readonly id: string;
  readonly tick: number;
  readonly category: MarkerCategory;
  readonly valueLabel: string;
  readonly interpolationLabel: string | null;
}

export interface TimelineViewTrack {
  readonly id: string;
  readonly label: string;
  readonly sortKey: string;
  readonly targetsSelection: boolean;
  readonly keyframes: readonly TimelineViewKeyframe[];
}

export interface TimelineViewSequence {
  readonly id: string;
  readonly name: string;
  readonly durationTicks: number;
  readonly ticksPerSecond: number;
  readonly tracks: readonly TimelineViewTrack[];
}

/** Deterministic lane order: tracks targeting the current selection first, then stable target identity. */
export function sortTimelineLanes(tracks: readonly TimelineViewTrack[]): readonly TimelineViewTrack[] {
  return [...tracks].sort((left, right) => {
    if (left.targetsSelection !== right.targetsSelection) return left.targetsSelection ? -1 : 1;

    return left.sortKey.localeCompare(right.sortKey);
  });
}
