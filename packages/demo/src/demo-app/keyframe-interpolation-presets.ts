import type { projectFormatV1 } from '@broadset/model';
import type { KeyframeInterpolationPreset } from '@broadset/ui';

type CubicControlPoints = readonly [number, number, number, number];

const CUBIC_PRESETS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;

const PRESET_CONTROL_POINTS: Readonly<Record<(typeof CUBIC_PRESETS)[number], CubicControlPoints>> = {
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const SPRING_DEFAULT = { mass: 1, stiffness: 100, damping: 10, initialVelocity: 0, settleThreshold: 0.001 } as const;

/** Map a friendly authoring preset to the closed typed interpolation record the model stores. */
export function presetToInterpolation(preset: KeyframeInterpolationPreset): projectFormatV1.Interpolation {
  switch (preset) {
    case 'hold':
      return { kind: 'hold' };
    case 'step':
      return { kind: 'step', position: 'end' };
    case 'spring':
      return { kind: 'spring', ...SPRING_DEFAULT };
    case 'linear':
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out':
      return { kind: 'cubic-bezier', controlPoints: PRESET_CONTROL_POINTS[preset] };
  }
}

function matchCubicPreset(controlPoints: CubicControlPoints): KeyframeInterpolationPreset {
  for (const preset of CUBIC_PRESETS) {
    if (PRESET_CONTROL_POINTS[preset].every((value, index) => value === controlPoints[index])) {
      return preset;
    }
  }

  return 'ease-in-out';
}

/** Derive the display preset for a keyframe's interpolation; null marks a final keyframe with none. */
export function interpolationToPreset(
  interpolation: projectFormatV1.Interpolation | undefined,
): KeyframeInterpolationPreset | null {
  if (interpolation === undefined) return null;

  switch (interpolation.kind) {
    case 'hold':
      return 'hold';
    case 'step':
      return 'step';
    case 'spring':
      return 'spring';
    case 'cubic-bezier':
      return matchCubicPreset(interpolation.controlPoints);
    default:
      return 'hold';
  }
}
