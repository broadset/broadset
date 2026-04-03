import { describe, expect, it } from '@jest/globals';

import type { CapabilityProfile } from './capabilities';
import { CAPABILITY_FLAG_KEYS, getCapabilityProfile } from './capabilities';

/** All 10 capability flag keys that must exist on every profile. */
const ALL_FLAGS: readonly (keyof CapabilityProfile)[] = CAPABILITY_FLAG_KEYS;

/** Helper: asserts that exactly the listed flags are true and all others false. */
function expectExactFlags(profile: CapabilityProfile, enabled: readonly (keyof CapabilityProfile)[]): void {
  for (const flag of ALL_FLAGS) {
    if (enabled.includes(flag)) {
      expect(profile[flag]).toBe(true);
    } else {
      expect(profile[flag]).toBe(false);
    }
  }
}

/** @description Every element type must resolve to a profile with exactly 10 boolean flags */
describe('Capability profile shape', () => {
  /** @description The profile must contain all 10 defined flags, no more, no less */
  it('contains exactly 10 boolean flags', () => {
    const profile = getCapabilityProfile('text');

    const keys = Object.keys(profile);

    expect(keys).toHaveLength(10);

    for (const key of keys) {
      expect(typeof profile[key as keyof CapabilityProfile]).toBe('boolean');
    }
  });
});

/** @description Text elements enable borderRadius, typography, appearance, boxEffects */
describe('Text element capabilities', () => {
  /** @description Text must have the correct 4 flags enabled */
  it('enables borderRadius, typography, appearance, boxEffects', () => {
    const profile = getCapabilityProfile('text');

    expectExactFlags(profile, ['borderRadius', 'typography', 'appearance', 'boxEffects']);
  });
});

/** @description Rectangle elements enable borderRadius, appearance, boxEffects, clipPath */
describe('Rectangle element capabilities', () => {
  /** @description Rectangle must have the correct 4 flags enabled */
  it('enables borderRadius, appearance, boxEffects, clipPath', () => {
    const profile = getCapabilityProfile('rectangle');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath']);
  });
});

/** @description Ellipse elements enable appearance, boxEffects, clipPath; borderRadius is disabled */
describe('Ellipse element capabilities', () => {
  /** @description Ellipses always render 50% radius, so borderRadius is not editable */
  it('enables appearance, boxEffects, clipPath but not borderRadius', () => {
    const profile = getCapabilityProfile('ellipse');

    expectExactFlags(profile, ['appearance', 'boxEffects', 'clipPath']);
  });
});

/** @description Image elements enable borderRadius, appearance, boxEffects, clipPath, objectFit */
describe('Image element capabilities', () => {
  /** @description Images need objectFit to control aspect ratio inside bounds */
  it('enables borderRadius, appearance, boxEffects, clipPath, objectFit', () => {
    const profile = getCapabilityProfile('image');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath', 'objectFit']);
  });
});

/** @description SVG elements enable borderRadius, appearance, boxEffects, clipPath, objectFit */
describe('SVG element capabilities', () => {
  /** @description SVG elements share the same profile as images */
  it('enables borderRadius, appearance, boxEffects, clipPath, objectFit', () => {
    const profile = getCapabilityProfile('svg');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath', 'objectFit']);
  });
});

/** @description Path elements enable svgStrokeFill, pathEditing, instantPlace */
describe('Path element capabilities', () => {
  /** @description Paths are drawn with SVG stroke/fill and support path editing */
  it('enables svgStrokeFill, pathEditing, instantPlace', () => {
    const profile = getCapabilityProfile('path');

    expectExactFlags(profile, ['svgStrokeFill', 'pathEditing', 'instantPlace']);
  });
});

/** @description QR code elements only enable squareConstrained */
describe('QR code element capabilities', () => {
  /** @description QR codes are always square — only squareConstrained is enabled */
  it('enables only squareConstrained', () => {
    const profile = getCapabilityProfile('qrcode');

    expectExactFlags(profile, ['squareConstrained']);
  });
});

/** @description Group elements enable appearance and clipPath only */
describe('Group element capabilities', () => {
  /** @description Groups are containers with appearance and clip; nothing else */
  it('enables appearance and clipPath', () => {
    const profile = getCapabilityProfile('group');

    expectExactFlags(profile, ['appearance', 'clipPath']);
  });
});

/** @description Unknown types resolve to all flags disabled as a safe fallback */
describe('Unknown type fallback', () => {
  /** @description A completely unknown type (no plugin) must have all flags disabled */
  it('returns all flags false for unknown type', () => {
    const profile = getCapabilityProfile('countdown');

    expectExactFlags(profile, []);
  });

  /** @description Another unknown type to confirm consistency */
  it('returns all flags false for another unknown type', () => {
    const profile = getCapabilityProfile('custom-widget');

    expectExactFlags(profile, []);
  });
});
