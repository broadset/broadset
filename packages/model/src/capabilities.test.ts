import { describe, expect, it } from 'vitest';

import { CAPABILITY_FLAG_KEYS, getCapabilityProfile } from './capabilities';

type CapabilityFlag = (typeof CAPABILITY_FLAG_KEYS)[number];
type CapabilityProfile = ReturnType<typeof getCapabilityProfile>;

const ALL_FLAGS = CAPABILITY_FLAG_KEYS;

/** Helper: asserts that exactly the listed flags are true and all others false. */
function expectExactFlags(profile: CapabilityProfile, enabled: readonly CapabilityFlag[]): void {
  for (const flag of ALL_FLAGS) {
    if (enabled.includes(flag)) {
      expect(profile[flag]).toBe(true);
    } else {
      expect(profile[flag]).toBe(false);
    }
  }
}

/** @description Every element type must resolve to a profile with exactly ten boolean flags. */
describe('Capability profile shape', () => {
  /** @description The profile must contain all defined capability keys and every value must be boolean. */
  it('contains exactly 10 boolean flags', () => {
    const profile = getCapabilityProfile('text');
    const keys = Object.keys(profile);

    expect(keys).toHaveLength(10);

    for (const key of keys) {
      expect(typeof profile[key as keyof CapabilityProfile]).toBe('boolean');
    }
  });
});

/** @description Text elements expose text-editing and appearance controls. */
describe('Text element capabilities', () => {
  /** @description Text must enable border radius, typography, appearance, and box effects. */
  it('enables borderRadius, typography, appearance, boxEffects', () => {
    const profile = getCapabilityProfile('text');

    expectExactFlags(profile, ['borderRadius', 'typography', 'appearance', 'boxEffects']);
  });
});

/** @description Rectangle elements expose shape styling and clipping controls. */
describe('Rectangle element capabilities', () => {
  /** @description Rectangles must allow rounded corners, appearance, shadows, and clip paths. */
  it('enables borderRadius, appearance, boxEffects, clipPath', () => {
    const profile = getCapabilityProfile('rectangle');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath']);
  });
});

/** @description Ellipses are always rounded by shape, so border radius stays disabled. */
describe('Ellipse element capabilities', () => {
  /** @description Ellipses support appearance, box effects, and clip paths, but not editable border radius. */
  it('enables appearance, boxEffects, clipPath but not borderRadius', () => {
    const profile = getCapabilityProfile('ellipse');

    expectExactFlags(profile, ['appearance', 'boxEffects', 'clipPath']);
  });
});

/** @description Image-like media share the same fitting and visual controls. */
describe('Image and SVG element capabilities', () => {
  /** @description Images must support object-fit alongside appearance, clipping, and rounded corners. */
  it('enables image capabilities', () => {
    const profile = getCapabilityProfile('image');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath', 'objectFit']);
  });

  /** @description SVG elements intentionally mirror the image capability profile. */
  it('enables SVG capabilities', () => {
    const profile = getCapabilityProfile('svg');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath', 'objectFit']);
  });
});

/** @description Paths, QR codes, and groups each expose a narrow, type-specific capability set. */
describe('Specialized element capabilities', () => {
  /** @description Paths are edited through stroke/fill and geometry controls. */
  it('enables path editing controls for path elements', () => {
    const profile = getCapabilityProfile('path');

    expectExactFlags(profile, ['svgStrokeFill', 'pathEditing', 'instantPlace']);
  });

  /** @description QR codes stay square by definition and expose only the square constraint flag. */
  it('enables only squareConstrained for QR codes', () => {
    const profile = getCapabilityProfile('qrcode');

    expectExactFlags(profile, ['squareConstrained']);
  });

  /** @description Groups act as containers with appearance and clipping controls only. */
  it('enables appearance and clipPath for groups', () => {
    const profile = getCapabilityProfile('group');

    expectExactFlags(profile, ['appearance', 'clipPath']);
  });
});

/** @description Video, clock, and ticker use the specialized profiles defined by the spec. */
describe('Media and dynamic text element capabilities', () => {
  /** @description Video mirrors the image profile with object-fit and rounded-corner support. */
  it('enables video capabilities', () => {
    const profile = getCapabilityProfile('video');

    expectExactFlags(profile, ['borderRadius', 'appearance', 'boxEffects', 'clipPath', 'objectFit']);
  });

  /** @description Clock elements expose text styling and appearance controls only. */
  it('enables clock capabilities', () => {
    const profile = getCapabilityProfile('clock');

    expectExactFlags(profile, ['typography', 'appearance', 'boxEffects']);
  });

  /** @description Ticker elements match the clock profile because they are text-driven dynamic overlays. */
  it('enables ticker capabilities', () => {
    const profile = getCapabilityProfile('ticker');

    expectExactFlags(profile, ['typography', 'appearance', 'boxEffects']);
  });
});

/** @description Unknown types should degrade safely by exposing no editable capabilities. */
describe('Unknown type fallback', () => {
  /** @description An unrecognized plugin or custom type must resolve to all flags disabled. */
  it.each(['countdown', 'custom-widget'])('returns all flags false for %s', (typeName) => {
    const profile = getCapabilityProfile(typeName);

    expectExactFlags(profile, []);
  });
});
