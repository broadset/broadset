import { describe, expect, it } from '@jest/globals';

import { createDefaultScreenProps, isValidCustomClipPath, screenPropsSchema } from './screen';

/** @description Verifies every screen property is present and correctly typed on a full object */
describe('Screen property vocabulary', () => {
  /** @description A fully populated screen props object must pass schema validation */
  it('accepts a full screen property set', () => {
    const result = screenPropsSchema.safeParse({
      name: 'Hero Image',
      anchorX: 'right',
      anchorY: 'bottom',
      visibility: 'offscreen',
      activeState: 'highlighted',
      modifiers: ['pulse', 'glow'],
      locked: true,
      maskType: 'circle',
      rotateX: 30,
      rotateY: 45,
      rotateZ: 0,
      translateZ: 50,
      clipChildren: true,
      customClipPath: '',
    });

    expect(result.success).toBe(true);
  });

  /** @description Default screen properties must match the spec-documented values exactly */
  it('produces correct defaults for new elements', () => {
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
  });

  /** @description Default screen properties must pass schema validation */
  it('defaults pass schema validation', () => {
    const result = screenPropsSchema.safeParse(createDefaultScreenProps());

    expect(result.success).toBe(true);
  });
});

/** @description anchorX and anchorY accept exactly their allowed enum values */
describe('Anchor semantics', () => {
  /** @description anchorX 'left' is a valid positioning reference */
  it('accepts anchorX left', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorX: 'left',
    });

    expect(result.success).toBe(true);
  });

  /** @description anchorX 'right' is a valid positioning reference */
  it('accepts anchorX right', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorX: 'right',
    });

    expect(result.success).toBe(true);
  });

  /** @description anchorY 'top' is a valid positioning reference */
  it('accepts anchorY top', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorY: 'top',
    });

    expect(result.success).toBe(true);
  });

  /** @description anchorY 'bottom' is a valid positioning reference */
  it('accepts anchorY bottom', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorY: 'bottom',
    });

    expect(result.success).toBe(true);
  });

  /** @description Invalid anchorX values must be rejected */
  it('rejects invalid anchorX', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorX: 'center',
    });

    expect(result.success).toBe(false);
  });

  /** @description Invalid anchorY values must be rejected */
  it('rejects invalid anchorY', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      anchorY: 'middle',
    });

    expect(result.success).toBe(false);
  });
});

/** @description visibility enum accepts only 'onscreen' and 'offscreen' */
describe('Visibility semantics', () => {
  /** @description 'onscreen' means the element is visible */
  it('accepts onscreen visibility', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      visibility: 'onscreen',
    });

    expect(result.success).toBe(true);
  });

  /** @description 'offscreen' means the element is hidden */
  it('accepts offscreen visibility', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      visibility: 'offscreen',
    });

    expect(result.success).toBe(true);
  });

  /** @description Invalid visibility values must be rejected */
  it('rejects invalid visibility', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      visibility: 'hidden',
    });

    expect(result.success).toBe(false);
  });
});

/** @description Mask type enum accepts exactly its 6 valid values */
describe('Mask type semantics', () => {
  /** @description Each valid mask type must be accepted by the schema */
  it.each(['none', 'circle', 'squircle', 'triangle', 'star', 'custom'] as const)(
    'accepts maskType "%s"',
    (maskType) => {
      const props = createDefaultScreenProps();

      const result = screenPropsSchema.safeParse({
        ...props,
        maskType,
      });

      expect(result.success).toBe(true);
    },
  );

  /** @description Invalid mask types must be rejected */
  it('rejects invalid maskType', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      maskType: 'hexagon',
    });

    expect(result.success).toBe(false);
  });
});

/** @description 3D transform properties accept finite numbers; NaN/Infinity are rejected */
describe('3D transform properties', () => {
  /** @description Non-zero 3D values must be accepted */
  it('accepts non-zero 3D rotation and translation', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      rotateX: 30,
      rotateY: 45,
      rotateZ: 15,
      translateZ: 50,
    });

    expect(result.success).toBe(true);
  });

  /** @description All-zero 3D values represent "no 3D transform" */
  it('accepts all-zero 3D values', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse(props);

    expect(props.rotateX).toBe(0);
    expect(props.rotateY).toBe(0);
    expect(props.rotateZ).toBe(0);
    expect(props.translateZ).toBe(0);
    expect(result.success).toBe(true);
  });

  /** @description NaN rotation values must be rejected */
  it('rejects NaN rotateX', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      rotateX: NaN,
    });

    expect(result.success).toBe(false);
  });

  /** @description Infinity translateZ must be rejected */
  it('rejects Infinity translateZ', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      translateZ: Infinity,
    });

    expect(result.success).toBe(false);
  });
});

/** @description activeState is exclusive (one or null); modifiers is an additive array */
describe('State and modifier classes', () => {
  /** @description A single activeState is accepted */
  it('accepts a non-null activeState', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      activeState: 'highlighted',
    });

    expect(result.success).toBe(true);
  });

  /** @description null activeState means no state is active */
  it('accepts null activeState', () => {
    const props = createDefaultScreenProps();

    expect(props.activeState).toBeNull();

    const result = screenPropsSchema.safeParse(props);

    expect(result.success).toBe(true);
  });

  /** @description Multiple modifiers can be active simultaneously */
  it('accepts multiple modifiers', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      modifiers: ['pulse', 'glow'],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.modifiers).toEqual(['pulse', 'glow']);
    }
  });

  /** @description Empty modifiers array is valid (no modifiers active) */
  it('accepts empty modifiers array', () => {
    const props = createDefaultScreenProps();

    expect(props.modifiers).toEqual([]);
  });
});

/** @description locked:true prevents UI interactions; model-level property is just a boolean flag */
describe('Element locking', () => {
  /** @description locked true must be accepted */
  it('accepts locked true', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      locked: true,
    });

    expect(result.success).toBe(true);
  });

  /** @description locked false must be accepted */
  it('accepts locked false', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      locked: false,
    });

    expect(result.success).toBe(true);
  });
});

/** @description clipChildren controls overflow behavior of child elements */
describe('Clip children', () => {
  /** @description clipChildren true clips child overflow */
  it('accepts clipChildren true', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      clipChildren: true,
    });

    expect(result.success).toBe(true);
  });

  /** @description Default clipChildren is false */
  it('defaults clipChildren to false', () => {
    const props = createDefaultScreenProps();

    expect(props.clipChildren).toBe(false);
  });
});

/** @description customClipPath is validated when maskType is 'custom' */
describe('Custom clip-path validation', () => {
  /** @description Valid polygon clip-path must be accepted */
  it('accepts valid polygon clip-path', () => {
    expect(isValidCustomClipPath('polygon(50% 0%, 100% 100%, 0% 100%)')).toBe(true);
  });

  /** @description Valid circle clip-path must be accepted */
  it('accepts valid circle clip-path', () => {
    expect(isValidCustomClipPath('circle(50% at 50% 50%)')).toBe(true);
  });

  /** @description Valid ellipse clip-path must be accepted */
  it('accepts valid ellipse clip-path', () => {
    expect(isValidCustomClipPath('ellipse(50% 30% at 50% 50%)')).toBe(true);
  });

  /** @description Valid inset clip-path must be accepted */
  it('accepts valid inset clip-path', () => {
    expect(isValidCustomClipPath('inset(10% 20% 30% 40%)')).toBe(true);
  });

  /** @description Valid path clip-path must be accepted */
  it('accepts valid path clip-path', () => {
    expect(isValidCustomClipPath("path('M 0 0 L 100 0 L 100 100 Z')")).toBe(true);
  });

  /** @description Malformed strings must be rejected */
  it('rejects malformed clip-path', () => {
    expect(isValidCustomClipPath('not-valid-css')).toBe(false);
  });

  /** @description Empty string means no clip-path — treated as valid */
  it('accepts empty string as no clip-path', () => {
    expect(isValidCustomClipPath('')).toBe(true);
  });

  /** @description Schema rejects invalid customClipPath when maskType is custom */
  it('schema rejects invalid clip-path with maskType custom', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      maskType: 'custom',
      customClipPath: 'not-valid-css',
    });

    expect(result.success).toBe(false);
  });

  /** @description Schema accepts valid clip-path with maskType custom */
  it('schema accepts valid clip-path with maskType custom', () => {
    const props = createDefaultScreenProps();

    const result = screenPropsSchema.safeParse({
      ...props,
      maskType: 'custom',
      customClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
    });

    expect(result.success).toBe(true);
  });
});
