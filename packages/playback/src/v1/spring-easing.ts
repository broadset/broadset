export function springProgressV1(options: {
  readonly progress: number;
  readonly mass: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly initialVelocity: number;
  readonly settleThreshold: number;
}): number {
  if (options.progress <= 0) return 0;
  if (options.progress >= 1) return 1;

  const omega0 = Math.sqrt(options.stiffness / options.mass);
  const zeta = options.damping / (2 * Math.sqrt(options.stiffness * options.mass));
  const duration = Math.max(1, -Math.log(options.settleThreshold) / Math.max(omega0 * Math.max(zeta, 0.1), 0.001));
  const time = options.progress * duration;

  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const coefficient = (zeta * omega0 - options.initialVelocity) / omegaD;

    return 1 - Math.exp(-zeta * omega0 * time) * (Math.cos(omegaD * time) + coefficient * Math.sin(omegaD * time));
  }

  return 1 - Math.exp(-omega0 * time) * (1 + (omega0 - options.initialVelocity) * time);
}
