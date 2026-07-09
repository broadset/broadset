import { clampUnitInterval, EPSILON } from './number';

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const SPRING_RE = /^spring\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;
const MAX_NEWTON_ITERATIONS = 8;
const MAX_BINARY_SEARCH_ITERATIONS = 20;
const SPRING_SETTLING_MULTIPLIER = 2.6;

const CUBIC_PRESETS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const SPRING_PRESETS: Readonly<
  Record<string, { readonly stiffness: number; readonly damping: number; readonly mass: number }>
> = {
  'spring-gentle': { stiffness: 100, damping: 20, mass: 1 },
  'spring-bouncy': { stiffness: 400, damping: 10, mass: 1 },
  'spring-stiff': { stiffness: 500, damping: 30, mass: 1 },
};

function sampleCubicBezier(t: number, a1: number, a2: number): number {
  const inverse = 1 - t;

  return 3 * inverse * inverse * t * a1 + 3 * inverse * t * t * a2 + t * t * t;
}

function sampleCubicBezierDerivative(t: number, a1: number, a2: number): number {
  return 3 * a1 * ((1 - t) * (1 - t)) + 6 * (a2 - a1) * (1 - t) * t + 3 * (1 - a2) * t * t;
}

function solveCubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number): number {
  let parameter = progress;

  for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS; iteration += 1) {
    const x = sampleCubicBezier(parameter, x1, x2) - progress;

    if (Math.abs(x) <= EPSILON) {
      return clampUnitInterval(sampleCubicBezier(parameter, y1, y2));
    }

    const derivative = sampleCubicBezierDerivative(parameter, x1, x2);

    if (Math.abs(derivative) <= EPSILON) {
      break;
    }

    parameter = clampUnitInterval(parameter - x / derivative);
  }

  let lower = 0;
  let upper = 1;

  for (let iteration = 0; iteration < MAX_BINARY_SEARCH_ITERATIONS; iteration += 1) {
    parameter = (lower + upper) / 2;

    const sample = sampleCubicBezier(parameter, x1, x2);

    if (Math.abs(sample - progress) <= EPSILON) {
      break;
    }

    if (sample < progress) {
      lower = parameter;
    } else {
      upper = parameter;
    }
  }

  return clampUnitInterval(sampleCubicBezier(parameter, y1, y2));
}

function parseCubicBezier(mode: string): readonly [number, number, number, number] | null {
  const match = CUBIC_BEZIER_RE.exec(mode);

  if (match === null) {
    return null;
  }

  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);

  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return null;
  }

  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    return null;
  }

  return [x1, y1, x2, y2];
}

function parseSpring(
  mode: string,
): { readonly stiffness: number; readonly damping: number; readonly mass: number } | null {
  const preset = SPRING_PRESETS[mode];

  if (preset !== undefined) {
    return preset;
  }

  const match = SPRING_RE.exec(mode);

  if (match === null) {
    return null;
  }

  const stiffness = Number(match[1]);
  const damping = Number(match[2]);
  const mass = Number(match[3]);

  if (!Number.isFinite(stiffness) || !Number.isFinite(damping) || !Number.isFinite(mass)) {
    return null;
  }

  if (stiffness <= 0 || damping <= 0 || mass <= 0) {
    return null;
  }

  return { stiffness, damping, mass };
}

function evaluateSpring(progress: number, stiffness: number, damping: number, mass: number): number {
  if (progress <= 0) {
    return 0;
  }

  if (progress >= 1) {
    return 1;
  }

  const normalizedTime = clampUnitInterval(progress);
  const decayRate = damping / (2 * mass);
  const settlingTime = SPRING_SETTLING_MULTIPLIER / Math.max(decayRate, EPSILON);
  const physicalTime = normalizedTime * settlingTime;
  const angularFrequencySquared = stiffness / mass - decayRate ** 2;

  if (angularFrequencySquared <= EPSILON) {
    return 1 - Math.exp(-(decayRate * physicalTime)) * (1 + decayRate * physicalTime);
  }

  const omega = Math.sqrt(angularFrequencySquared);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const oscillationScale = dampingRatio / Math.sqrt(Math.max(1 - dampingRatio ** 2, EPSILON));
  const envelope = Math.exp(-(decayRate * physicalTime));

  return 1 - envelope * (Math.cos(omega * physicalTime) + oscillationScale * Math.sin(omega * physicalTime));
}

export function applyEasing(mode: string, progress: number): number {
  const clampedProgress = clampUnitInterval(progress);

  if (mode === 'linear' || mode === 'counting') {
    return clampedProgress;
  }

  if (mode === 'step') {
    return clampedProgress >= 1 ? 1 : 0;
  }

  const preset = CUBIC_PRESETS[mode];

  if (preset !== undefined) {
    return solveCubicBezier(clampedProgress, preset[0], preset[1], preset[2], preset[3]);
  }

  const cubicBezier = parseCubicBezier(mode);

  if (cubicBezier !== null) {
    return solveCubicBezier(clampedProgress, cubicBezier[0], cubicBezier[1], cubicBezier[2], cubicBezier[3]);
  }

  const spring = parseSpring(mode);

  if (spring !== null) {
    return evaluateSpring(clampedProgress, spring.stiffness, spring.damping, spring.mass);
  }

  return clampedProgress;
}
