import type { KeyframeInterpolationPreset } from '@broadset/ui';
import { describe, expect, it } from 'vitest';

import { interpolationToPreset, presetToInterpolation } from './keyframe-interpolation-presets';

const PRESETS: readonly KeyframeInterpolationPreset[] = [
  'hold',
  'step',
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'spring',
];

describe('keyframe interpolation presets', () => {
  it('round-trips every preset through the typed interpolation record', () => {
    for (const preset of PRESETS) {
      expect(interpolationToPreset(presetToInterpolation(preset))).toBe(preset);
    }
  });

  it('maps a missing interpolation to null (final keyframe)', () => {
    expect(interpolationToPreset(undefined)).toBeNull();
  });

  it('maps cubic-bezier presets to the exact control points', () => {
    expect(presetToInterpolation('ease-in-out')).toEqual({ kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] });
    expect(presetToInterpolation('linear')).toEqual({ kind: 'cubic-bezier', controlPoints: [0, 0, 1, 1] });
  });
});
