export interface CapabilityProfile {
  readonly borderRadius: boolean;
  readonly typography: boolean;
  readonly appearance: boolean;
  readonly boxEffects: boolean;
  readonly clipPath: boolean;
  readonly objectFit: boolean;
  readonly svgStrokeFill: boolean;
  readonly pathEditing: boolean;
  readonly squareConstrained: boolean;
  readonly instantPlace: boolean;
}

/** The stable ordered list of capability flags present on every profile. */
export const CAPABILITY_FLAG_KEYS = [
  'borderRadius',
  'typography',
  'appearance',
  'boxEffects',
  'clipPath',
  'objectFit',
  'svgStrokeFill',
  'pathEditing',
  'squareConstrained',
  'instantPlace',
] as const satisfies ReadonlyArray<keyof CapabilityProfile>;

const DISABLED_CAPABILITY_PROFILE: CapabilityProfile = {
  borderRadius: false,
  typography: false,
  appearance: false,
  boxEffects: false,
  clipPath: false,
  objectFit: false,
  svgStrokeFill: false,
  pathEditing: false,
  squareConstrained: false,
  instantPlace: false,
};

const CAPABILITY_PROFILES: Readonly<Record<string, CapabilityProfile>> = {
  text: {
    ...DISABLED_CAPABILITY_PROFILE,
    borderRadius: true,
    typography: true,
    appearance: true,
    boxEffects: true,
  },
  rectangle: {
    ...DISABLED_CAPABILITY_PROFILE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
  },
  ellipse: {
    ...DISABLED_CAPABILITY_PROFILE,
    appearance: true,
    boxEffects: true,
    clipPath: true,
  },
  image: {
    ...DISABLED_CAPABILITY_PROFILE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  svg: {
    ...DISABLED_CAPABILITY_PROFILE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  path: {
    ...DISABLED_CAPABILITY_PROFILE,
    svgStrokeFill: true,
    pathEditing: true,
    instantPlace: true,
  },
  qrcode: {
    ...DISABLED_CAPABILITY_PROFILE,
    squareConstrained: true,
  },
  group: {
    ...DISABLED_CAPABILITY_PROFILE,
    appearance: true,
    clipPath: true,
  },
  video: {
    ...DISABLED_CAPABILITY_PROFILE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  clock: {
    ...DISABLED_CAPABILITY_PROFILE,
    typography: true,
    appearance: true,
    boxEffects: true,
  },
  ticker: {
    ...DISABLED_CAPABILITY_PROFILE,
    typography: true,
    appearance: true,
    boxEffects: true,
  },
};

/**
 * Returns the deterministic capability profile for the given element type.
 * Unknown element kinds fall back to a fully disabled profile.
 */
export function getCapabilityProfile(type: string): CapabilityProfile {
  return CAPABILITY_PROFILES[type] ?? DISABLED_CAPABILITY_PROFILE;
}
