import type {
  BlurToken,
  ColorToken,
  FontToken,
  PlaneLevel,
  RadiusToken,
  ShadowToken,
  SpacingToken,
  ZLayerToken,
} from './tokens';
import {
  blur,
  color,
  font,
  glassPanelStyle,
  mattePanelStyle,
  overlayPanelStyle,
  planeColor,
  radius,
  shadow,
  sp,
  zLayer,
} from './tokens';

describe('tokens', () => {
  describe('sp()', () => {
    /** @description Spacing helpers must return CSS variable references with fallback defaults */
    it('returns CSS variable reference with fallback', () => {
      const result = sp('sp-03');

      expect(result).toContain('var(--sp-03');
      expect(result).toContain('0.5rem');
    });

    /** @description All spacing presets must be defined and return valid CSS custom properties */
    it.each([
      'sp-01',
      'sp-02',
      'sp-03',
      'sp-04',
      'sp-05',
      'sp-06',
      'sp-07',
      'sp-08',
      'sp-09',
    ] as readonly SpacingToken[])('defines spacing preset "%s"', (token) => {
      const result = sp(token);

      expect(result).toMatch(/^var\(--sp-\d{2}, /);
    });
  });

  describe('color()', () => {
    /** @description Color helpers must return CSS variable references for all semantic tokens */
    it('returns CSS variable reference with fallback', () => {
      const result = color('accent');

      expect(result).toContain('var(--accent');
    });

    /** @description All color presets must be defined and return valid CSS custom properties */
    it.each([
      'foreground',
      'muted',
      'surface',
      'surface-secondary',
      'surface-tertiary',
      'border',
      'accent',
      'danger',
      'success',
      'field-background',
      'focus',
      'glass-bg',
    ] as readonly ColorToken[])('defines color token "%s"', (token) => {
      const result = color(token);

      expect(result).toMatch(/^var\(--/);
    });
  });

  describe('font()', () => {
    /** @description Font helpers must return CSS variable references for typography scale */
    it('returns CSS variable reference with fallback', () => {
      const result = font('body-compact');

      expect(result).toContain('var(--font-body-compact');
      expect(result).toContain('0.875rem');
    });

    /** @description All font presets must be defined and return valid CSS custom properties */
    it.each(['label', 'body-compact', 'heading-sm', 'heading-md'] as readonly FontToken[])(
      'defines font token "%s"',
      (token) => {
        const result = font(token);

        expect(result).toMatch(/^var\(--font-/);
      },
    );
  });

  describe('radius()', () => {
    /** @description Radius token helper must expose preset border-radius values via CSS variables */
    it('returns CSS variable reference for small radius', () => {
      const result = radius('sm');

      expect(result).toContain('var(--radius-sm');
    });

    /** @description All radius presets must be defined: sm, md, lg, xl, full */
    it.each(['sm', 'md', 'lg', 'xl', 'full'] as readonly RadiusToken[])('defines radius preset "%s"', (token) => {
      const result = radius(token);

      expect(result).toMatch(/^var\(--radius-/);
    });
  });

  describe('shadow()', () => {
    /** @description Shadow token helper must expose preset box-shadow values via CSS variables */
    it('returns CSS variable reference for overlay shadow', () => {
      const result = shadow('overlay');

      expect(result).toContain('var(--shadow-overlay');
    });

    /** @description All shadow presets must be defined: sm, md, overlay */
    it.each(['sm', 'md', 'overlay'] as readonly ShadowToken[])('defines shadow preset "%s"', (token) => {
      const result = shadow(token);

      expect(result).toMatch(/^var\(--shadow-/);
    });
  });

  describe('blur()', () => {
    /** @description Blur token helper must expose preset backdrop-filter blur values via CSS variables */
    it('returns CSS variable reference for medium blur', () => {
      const result = blur('md');

      expect(result).toContain('var(--blur-md');
      expect(result).toContain('8px');
    });

    /** @description All blur presets must be defined: sm, md, lg */
    it.each(['sm', 'md', 'lg'] as readonly BlurToken[])('defines blur preset "%s"', (token) => {
      const result = blur(token);

      expect(result).toMatch(/^var\(--blur-/);
    });
  });

  describe('zLayer()', () => {
    /** @description Z-layer token helper must expose z-index values for consistent layering */
    it('returns a numeric z-index for chrome layer', () => {
      const result = zLayer('chrome');

      expect(typeof result).toBe('number');
    });

    /** @description Z-layer hierarchy must enforce correct stacking: base < chrome < panel < overlay < modal */
    it('enforces stacking order: base < chrome < panel < overlay < modal', () => {
      expect(zLayer('base')).toBeLessThan(zLayer('chrome'));
      expect(zLayer('chrome')).toBeLessThan(zLayer('panel'));
      expect(zLayer('panel')).toBeLessThan(zLayer('overlay'));
      expect(zLayer('overlay')).toBeLessThan(zLayer('modal'));
    });

    /** @description All z-layer tokens must be defined */
    it.each(['base', 'chrome', 'panel', 'overlay', 'modal'] as readonly ZLayerToken[])(
      'defines z-layer "%s"',
      (token) => {
        const result = zLayer(token);

        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
      },
    );
  });

  describe('planeColor()', () => {
    /** @description Plane color helper must map semantic plane levels to color token references */
    it('returns a CSS variable reference for base plane', () => {
      const result = planeColor('base');

      expect(result).toContain('var(--');
    });

    /** @description All plane levels must be defined: base, raised, active, overlay */
    it.each(['base', 'raised', 'active', 'overlay'] as readonly PlaneLevel[])('defines plane "%s"', (level) => {
      const result = planeColor(level);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    /** @description Plane tokens provide distinct visual separation between hierarchy levels */
    it('provides distinct values for each plane level', () => {
      const base = planeColor('base');
      const raised = planeColor('raised');
      const active = planeColor('active');
      const overlay = planeColor('overlay');

      const unique = new Set([base, raised, active, overlay]);

      expect(unique.size).toBe(4);
    });
  });

  describe('glassPanelStyle()', () => {
    /** @description Glass panel helper must produce consistent CSSProperties for floating chrome */
    it('returns CSSProperties with glass-morphism properties', () => {
      const style = glassPanelStyle();

      expect(style.backgroundColor).toBeDefined();
      expect(style.backdropFilter).toBeDefined();
      expect(style.border).toBeDefined();
      expect(style.boxShadow).toBeDefined();
      expect(style.borderRadius).toBeDefined();
    });

    /** @description Glass panel shadow must use shadow token, not inline value */
    it('uses shadow token reference for boxShadow', () => {
      const style = glassPanelStyle();

      expect(style.boxShadow).toContain('var(--shadow-');
    });

    /** @description Glass panel radius must use radius token, not inline value */
    it('uses radius token reference for borderRadius', () => {
      const style = glassPanelStyle();

      expect(style.borderRadius).toBeDefined();
      expect(style.borderRadius).toContain('var(--radius-');
    });

    /** @description Glass panel blur must use blur token, not hardcoded value */
    it('uses blur token reference for backdropFilter', () => {
      const style = glassPanelStyle();

      expect(style.backdropFilter).toContain('var(--blur-');
    });
  });

  describe('mattePanelStyle()', () => {
    /** @description Matte panel helper must produce opaque surface style for sidebar/drawer panels */
    it('returns CSSProperties with opaque surface styling', () => {
      const style = mattePanelStyle();

      expect(style.backgroundColor).toBeDefined();
      expect(style.border).toBeDefined();
      expect(style.borderRadius).toBeDefined();
    });

    /** @description Matte panels must NOT use backdrop blur (opaque surface) */
    it('does not apply backdrop blur', () => {
      const style = mattePanelStyle();

      expect(style.backdropFilter).toBeUndefined();
    });

    /** @description Matte panels use the base plane surface color */
    it('uses surface color for background', () => {
      const style = mattePanelStyle();

      expect(style.backgroundColor).toContain('var(--surface');
    });
  });

  describe('overlayPanelStyle()', () => {
    /** @description Overlay panel helper must produce elevated panel style for modals/popovers */
    it('returns CSSProperties with elevated styling', () => {
      const style = overlayPanelStyle();

      expect(style.backgroundColor).toBeDefined();
      expect(style.boxShadow).toBeDefined();
      expect(style.borderRadius).toBeDefined();
    });

    /** @description Overlay panels use the overlay shadow for stronger elevation */
    it('uses overlay shadow', () => {
      const style = overlayPanelStyle();

      expect(style.boxShadow).toContain('var(--shadow-overlay');
    });

    /** @description Overlay panel blur must use blur token */
    it('uses blur token reference for backdropFilter', () => {
      const style = overlayPanelStyle();

      expect(style.backdropFilter).toContain('var(--blur-');
    });
  });

  describe('type exports', () => {
    /** @description All token types must be importable for consumer type safety */
    it('exports all required token types', () => {
      const spacingToken: SpacingToken = 'sp-01';
      const colorToken: ColorToken = 'accent';
      const fontToken: FontToken = 'label';
      const radiusToken: RadiusToken = 'sm';
      const shadowToken: ShadowToken = 'overlay';
      const blurToken: BlurToken = 'md';
      const zLayerToken: ZLayerToken = 'chrome';
      const planeLevel: PlaneLevel = 'base';

      expect(spacingToken).toBe('sp-01');
      expect(colorToken).toBe('accent');
      expect(fontToken).toBe('label');
      expect(radiusToken).toBe('sm');
      expect(shadowToken).toBe('overlay');
      expect(blurToken).toBe('md');
      expect(zLayerToken).toBe('chrome');
      expect(planeLevel).toBe('base');
    });
  });
});
