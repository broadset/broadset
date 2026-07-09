import { type CapabilityProfile, getCapabilityProfile } from '@broadset/model';

export interface RendererCapabilityOverride {
  readonly type: string;
  readonly capabilities?: Partial<CapabilityProfile>;
}

export const ALL_DISABLED_CAPABILITIES: CapabilityProfile = {
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

export function getRendererCapabilities(
  type: string,
  plugins: readonly RendererCapabilityOverride[] = [],
): CapabilityProfile {
  const baseCapabilities = { ...getCapabilityProfile(type) };
  const plugin = plugins.find((candidate) => candidate.type === type);

  if (plugin?.capabilities === undefined) {
    return baseCapabilities;
  }

  return {
    ...baseCapabilities,
    ...plugin.capabilities,
  };
}
