export interface ElementCapabilityProfile {
  readonly appearance: boolean;
  readonly boxEffects: boolean;
  readonly clipPath: boolean;
  readonly objectFit: boolean;
  readonly pathEditing: boolean;
  readonly svgStrokeFill: boolean;
  readonly typography: boolean;
}

const DISABLED_PROFILE: ElementCapabilityProfile = {
  appearance: false,
  boxEffects: false,
  clipPath: false,
  objectFit: false,
  pathEditing: false,
  svgStrokeFill: false,
  typography: false,
};

const PROFILES: Readonly<Record<string, ElementCapabilityProfile>> = {
  clock: { ...DISABLED_PROFILE, appearance: true, boxEffects: true, typography: true },
  ellipse: { ...DISABLED_PROFILE, appearance: true, boxEffects: true, clipPath: true },
  group: { ...DISABLED_PROFILE, appearance: true, clipPath: true },
  image: {
    ...DISABLED_PROFILE,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  path: { ...DISABLED_PROFILE, pathEditing: true, svgStrokeFill: true },
  rectangle: { ...DISABLED_PROFILE, appearance: true, boxEffects: true, clipPath: true },
  svg: {
    ...DISABLED_PROFILE,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
  text: { ...DISABLED_PROFILE, appearance: true, boxEffects: true, typography: true },
  ticker: { ...DISABLED_PROFILE, appearance: true, boxEffects: true, typography: true },
  video: {
    ...DISABLED_PROFILE,
    appearance: true,
    boxEffects: true,
    clipPath: true,
    objectFit: true,
  },
};

export function getElementCapabilityProfile(type: string): ElementCapabilityProfile {
  return PROFILES[type] ?? DISABLED_PROFILE;
}
