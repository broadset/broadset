import { describe, expect, it } from 'vitest';

import { SAMPLE_PROJECT_V1 } from '../sample-project-v1';
import { buildTimelineViewSequence, markerCategoryForKeyframe } from './v1-timeline-adapter';

describe('markerCategoryForKeyframe', () => {
  it('maps hold/step to danger regardless of value type (spec: timeline.md marker colors)', () => {
    expect(markerCategoryForKeyframe('number', { kind: 'hold' })).toBe('danger');
    expect(markerCategoryForKeyframe('color', { kind: 'step', position: 'end' })).toBe('danger');
  });

  it('maps numeric and tuple values to accent, color to focus, and the rest to danger', () => {
    const bezier = { kind: 'cubic-bezier', controlPoints: [0, 0, 1, 1] } as const;

    expect(markerCategoryForKeyframe('number', bezier)).toBe('accent');
    expect(markerCategoryForKeyframe('length', bezier)).toBe('accent');
    expect(markerCategoryForKeyframe('point2d', bezier)).toBe('accent');
    expect(markerCategoryForKeyframe('color', { kind: 'color', space: 'oklab' })).toBe('focus');
    expect(markerCategoryForKeyframe('string', undefined)).toBe('danger');
    expect(markerCategoryForKeyframe('asset', undefined)).toBe('danger');
  });
});

describe('buildTimelineViewSequence', () => {
  it('builds sorted, labelled lanes from the sample project with selection-first ordering', () => {
    const document = SAMPLE_PROJECT_V1.documents[0];
    const sequence = document?.sequences[0];

    if (document === undefined || sequence === undefined) throw new Error('Expected sample sequence');

    const targetElementId = sequence.tracks[0]?.target.entity.entityId;

    if (targetElementId === undefined) throw new Error('Expected a track target');

    const view = buildTimelineViewSequence({
      document,
      sequence,
      selectedElementIds: new Set([targetElementId]),
    });

    expect(view.id).toBe(sequence.id);
    expect(view.durationTicks).toBe(sequence.durationTicks);
    expect(view.ticksPerSecond).toBe(document.timebase?.ticksPerSecond ?? 1000);
    expect(view.tracks[0]?.targetsSelection).toBe(true);
    expect(view.tracks[0]?.label).toContain('opacity');
    expect(view.tracks[0]?.keyframes.map(({ tick }) => tick)).toEqual(
      sequence.tracks[0]?.keyframes.map(({ tick }) => tick),
    );

    const lastKeyframe = view.tracks[0]?.keyframes.at(-1);

    expect(lastKeyframe?.interpolationLabel).toBeNull();
  });
});
