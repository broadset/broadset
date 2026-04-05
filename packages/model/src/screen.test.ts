import { describe, expect, it } from '@jest/globals';

import { createDefaultScreenProps, isValidCustomClipPath, screenPropsSchema } from './screen';

/** @description The legacy runtime screen helper still validates playback-only state and transform metadata. */
describe('Screen helper vocabulary', () => {
  /** @description A fully populated helper object must pass schema validation. */
  it('accepts a full runtime screen property set', () => {
    const result = screenPropsSchema.safeParse({
      name: 'Hero Image',
      anchorX: 'right',
      anchorY: 'bottom',
      visibility: 'offscreen',
      activeState: 'highlighted',
      modifiers: ['pulse', 'glow'],
      locked: true,
      maskType: 'custom',
      rotateX: 30,
      rotateY: 45,
      rotateZ: 0,
      translateZ: 50,
      clipChildren: true,
      customClipPath: 'M 0 0 L 100 0 L 100 100 Z',
    });

    expect(result.success).toBe(true);
  });

  /** @description The helper defaults must remain deterministic for runtime consumers. */
  it('produces correct runtime defaults', () => {
    const defaults = createDefaultScreenProps();

    expect(defaults.name).toBe('');
    expect(defaults.anchorX).toBe('left');
    expect(defaults.anchorY).toBe('top');
    expect(defaults.visibility).toBe('onscreen');
    expect(defaults.activeState).toBeNull();
    expect(defaults.modifiers).toEqual([]);
    expect(defaults.locked).toBe(false);
    expect(defaults.maskType).toBe('none');
    expect(defaults.rotateX).toBe(0);
    expect(defaults.rotateY).toBe(0);
    expect(defaults.rotateZ).toBe(0);
    expect(defaults.translateZ).toBe(0);
    expect(defaults.clipChildren).toBe(false);
    expect(defaults.customClipPath).toBe('');
    expect(screenPropsSchema.safeParse(defaults).success).toBe(true);
  });
});

/** @description Runtime anchors and visibility only support the documented helper states. */
describe('Anchor and visibility semantics', () => {
  /** @description Horizontal and vertical anchor values must be limited to their two allowed options. */
  it('accepts the supported anchor values and rejects invalid ones', () => {
    const props = createDefaultScreenProps();

    expect(screenPropsSchema.safeParse({ ...props, anchorX: 'left', anchorY: 'top' }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, anchorX: 'right', anchorY: 'bottom' }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, anchorX: 'center' }).success).toBe(false);
    expect(screenPropsSchema.safeParse({ ...props, anchorY: 'middle' }).success).toBe(false);
  });

  /** @description Visibility must stay within the onscreen/offscreen vocabulary. */
  it('accepts onscreen and offscreen visibility only', () => {
    const props = createDefaultScreenProps();

    expect(screenPropsSchema.safeParse({ ...props, visibility: 'onscreen' }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, visibility: 'offscreen' }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, visibility: 'hidden' }).success).toBe(false);
  });
});

/** @description Masking, transforms, and state lists remain finite and explicitly typed. */
describe('Masking and state semantics', () => {
  /** @description Only the spec-approved mask types may be used. */
  it.each(['none', 'alpha', 'luminance', 'custom'] as const)('accepts maskType %s', (maskType) => {
    const props = createDefaultScreenProps();
    const result = screenPropsSchema.safeParse({
      ...props,
      maskType,
      customClipPath: maskType === 'custom' ? 'M 0 0 L 100 0 L 100 100 Z' : '',
    });

    expect(result.success).toBe(true);
  });

  /** @description Unsupported mask types must be rejected. */
  it('rejects invalid maskType', () => {
    const props = createDefaultScreenProps();
    const result = screenPropsSchema.safeParse({
      ...props,
      maskType: 'hexagon',
    });

    expect(result.success).toBe(false);
  });

  /** @description Non-zero finite 3D transform values and state markers must validate, while non-finite input is rejected. */
  it('validates transforms, activeState, and modifiers', () => {
    const props = createDefaultScreenProps();
    const validResult = screenPropsSchema.safeParse({
      ...props,
      rotateX: 30,
      rotateY: 45,
      rotateZ: 15,
      translateZ: 50,
      activeState: 'highlighted',
      modifiers: ['pulse', 'glow'],
    });

    expect(validResult.success).toBe(true);

    if (validResult.success) {
      expect(validResult.data.modifiers).toEqual(['pulse', 'glow']);
    }

    expect(screenPropsSchema.safeParse({ ...props, rotateX: Number.NaN }).success).toBe(false);
    expect(screenPropsSchema.safeParse({ ...props, translateZ: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  /** @description Locking and clipChildren remain explicit boolean flags in the runtime helper. */
  it('accepts locking and clipChildren booleans', () => {
    const props = createDefaultScreenProps();

    expect(screenPropsSchema.safeParse({ ...props, locked: true }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, locked: false }).success).toBe(true);
    expect(screenPropsSchema.safeParse({ ...props, clipChildren: true }).success).toBe(true);
  });
});

/** @description Custom clip paths must be syntactically valid SVG path `d` strings. */
describe('Custom clip-path validation', () => {
  /** @description Valid SVG path data and the empty string must be accepted by the standalone validator. */
  it.each(['M 0 0 L 100 0 L 100 100 Z', 'm 0 0 l 10 10 z', ''])(
    'accepts valid custom clip-path value %s',
    (clipPath) => {
      expect(isValidCustomClipPath(clipPath)).toBe(true);
    },
  );

  /** @description Malformed path strings must be rejected by both the helper and schema. */
  it('rejects malformed custom clip paths', () => {
    const props = createDefaultScreenProps();

    expect(isValidCustomClipPath('not-valid-path')).toBe(false);
    expect(
      screenPropsSchema.safeParse({
        ...props,
        maskType: 'custom',
        customClipPath: 'not-valid-path',
      }).success,
    ).toBe(false);
  });
});
