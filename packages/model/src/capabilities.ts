// ---------------------------------------------------------------------------
// Capability profile
// ---------------------------------------------------------------------------

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

/** The 10 capability flag keys, exported for consumers that need the key list. */
export const CAPABILITY_FLAG_KEYS: readonly (keyof CapabilityProfile)[] = [
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
] as const;

// ---------------------------------------------------------------------------
// Per-type profiles
// ---------------------------------------------------------------------------

const ALL_FALSE: CapabilityProfile = {
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

const PROFILES: Readonly<Record<string, CapabilityProfile>> = {
  text: {
    ...ALL_FALSE,
    borderRadius: true,
    typography: true,
    appearance: true,
    boxEffects: true,
  },
  rectangle: {
    ...ALL_FALSE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
  },
  ellipse: {
    ...ALL_FALSE,
    appearance: true,
    boxEffects: true,
    clipPath: true,
  },
  image: {
    ...ALL_FALSE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  svg: {
    ...ALL_FALSE,
    borderRadius: true,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  path: {
    ...ALL_FALSE,
    svgStrokeFill: true,
    pathEditing: true,
    instantPlace: true,
  },
  qrcode: {
    ...ALL_FALSE,
    squareConstrained: true,
  },
  group: {
    ...ALL_FALSE,
    appearance: true,
    clipPath: true,
  },
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Returns the capability profile for the given element type.
 * Unknown types resolve to all flags disabled.
 */
export function getCapabilityProfile(type: string): CapabilityProfile {
  return PROFILES[type] ?? ALL_FALSE;
}
