const NEWTON_ITERATIONS = 8;
const BISECTION_ITERATIONS = 20;
const SOLUTION_EPSILON = 1e-9;
const MINIMUM_SLOPE = 1e-6;
const CUBIC_COEFFICIENT = 3;

function clampProgress(progress: number): number {
  if (Number.isNaN(progress) || progress <= 0) return 0;
  if (progress >= 1) return 1;

  return progress;
}

function sampleCurve(firstControlPoint: number, secondControlPoint: number, parameter: number): number {
  const coefficientA = 1 - CUBIC_COEFFICIENT * secondControlPoint + CUBIC_COEFFICIENT * firstControlPoint;
  const coefficientB = CUBIC_COEFFICIENT * secondControlPoint - 2 * CUBIC_COEFFICIENT * firstControlPoint;
  const coefficientC = CUBIC_COEFFICIENT * firstControlPoint;

  return ((coefficientA * parameter + coefficientB) * parameter + coefficientC) * parameter;
}

function sampleCurveSlope(firstControlPoint: number, secondControlPoint: number, parameter: number): number {
  const coefficientA = 1 - CUBIC_COEFFICIENT * secondControlPoint + CUBIC_COEFFICIENT * firstControlPoint;
  const coefficientB = CUBIC_COEFFICIENT * secondControlPoint - 2 * CUBIC_COEFFICIENT * firstControlPoint;
  const coefficientC = CUBIC_COEFFICIENT * firstControlPoint;

  return (CUBIC_COEFFICIENT * coefficientA * parameter + 2 * coefficientB) * parameter + coefficientC;
}

function solveCurveParameter(firstControlPoint: number, secondControlPoint: number, progress: number): number {
  let parameter = progress;

  for (let iteration = 0; iteration < NEWTON_ITERATIONS; iteration += 1) {
    const error = sampleCurve(firstControlPoint, secondControlPoint, parameter) - progress;

    if (Math.abs(error) <= SOLUTION_EPSILON) return parameter;

    const slope = sampleCurveSlope(firstControlPoint, secondControlPoint, parameter);

    if (Math.abs(slope) < MINIMUM_SLOPE) break;

    parameter -= error / slope;
  }

  let lowerBound = 0;
  let upperBound = 1;

  parameter = progress;

  for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration += 1) {
    const error = sampleCurve(firstControlPoint, secondControlPoint, parameter) - progress;

    if (Math.abs(error) <= SOLUTION_EPSILON) return parameter;

    if (error < 0) lowerBound = parameter;
    else upperBound = parameter;

    parameter = (lowerBound + upperBound) / 2;
  }

  return parameter;
}

/** Evaluates a CSS cubic-bezier timing curve at the supplied input progress. */
export function cubicBezierEase(
  controlPoints: readonly [number, number, number, number],
  progress: number,
): number {
  const clampedProgress = clampProgress(progress);

  if (clampedProgress === 0 || clampedProgress === 1) return clampedProgress;

  const parameter = solveCurveParameter(controlPoints[0], controlPoints[2], clampedProgress);
  const output = sampleCurve(controlPoints[1], controlPoints[3], parameter);

  return Number.isFinite(output) ? output : clampedProgress;
}
