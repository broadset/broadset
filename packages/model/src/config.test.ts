import { describe, expect, it } from '@jest/globals';

import {
  createDefaultCanvasSettings,
  createDefaultFeatureConfig,
  createDefaultGridSettings,
  editorConfigSchema,
  FALLBACK_SYSTEM_FONTS,
  featureConfigSchema,
  mmToPx,
  normalizeColor,
  pxToMm,
  resolveFonts,
} from './config';

/** @description EditorConfig shape accepts minimal and full configurations */
describe('EditorConfig shape', () => {
  /** @description Minimal config with only allowedFonts must be accepted */
  it('accepts minimal config with allowedFonts', () => {
    const result = editorConfigSchema.safeParse({
      allowedFonts: [{ family: 'Arial' }],
    });

    expect(result.success).toBe(true);
  });

  /** @description Full config with all optional fields must be accepted */
  it('accepts full config with all fields', () => {
    const result = editorConfigSchema.safeParse({
      allowedFonts: [{ family: 'Arial' }],
      defaultPalette: ['#ff0000', '#00ff00'],
      allowedDocumentSizes: [{ label: 'HD', width: 1920, height: 1080 }],
      requiredElements: ['logo-element'],
      maxUndoSteps: 50,
      components: [
        {
          type: 'countdown',
          label: 'Countdown Timer',
          rendererFactory: (): null => null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

/** @description Feature config has boolean flags gating editor features */
describe('Feature configuration gating', () => {
  /** @description All feature flags must be present as booleans */
  it('accepts feature config with all flags', () => {
    const config = createDefaultFeatureConfig('screen');

    const result = featureConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description Each flag must be a boolean */
  it('has boolean values for all flags', () => {
    const config = createDefaultFeatureConfig('screen');

    for (const [, value] of Object.entries(config)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

/** @description Document mode determines default feature configuration */
describe('Document mode feature defaults', () => {
  /** @description Screen mode enables animations and transforms3d by default */
  it('screen mode enables animations and transforms3d', () => {
    const config = createDefaultFeatureConfig('screen');

    expect(config.animations).toBe(true);
    expect(config.transforms3d).toBe(true);
    expect(config.broadcastPreview).toBe(true);
  });

  /** @description Print mode disables animations and transforms3d by default */
  it('print mode disables animations and transforms3d', () => {
    const config = createDefaultFeatureConfig('print');

    expect(config.animations).toBe(false);
    expect(config.transforms3d).toBe(false);
  });

  /** @description Host override merges on top of mode-derived defaults */
  it('host override merges with mode defaults', () => {
    const base = createDefaultFeatureConfig('screen');

    const merged = { ...base, animations: false };

    expect(merged.animations).toBe(false);
    expect(merged.transforms3d).toBe(true); // untouched
  });
});

/** @description Default canvas settings have deterministic values */
describe('Default canvas settings', () => {
  /** @description All fields must be present with documented defaults */
  it('has correct default values', () => {
    const settings = createDefaultCanvasSettings();

    expect(settings.units).toBe('px');
    expect(settings.viewMode).toBe('none');
    expect(settings.showRulers).toBe(true);
    expect(settings.originX).toBe(0);
    expect(settings.originY).toBe(0);
    expect(settings.perspective).toBe(1000);
    expect(settings.zoom).toBe(1);
    expect(settings.panX).toBe(0);
    expect(settings.panY).toBe(0);
    expect(settings.guides).toEqual([]);
  });
});

/** @description Default grid settings have documented defaults */
describe('Default grid settings', () => {
  /** @description Grid defaults: gridSize=5, showGrid=false, snapToGrid=false, snapThreshold=5 */
  it('has correct defaults', () => {
    const grid = createDefaultGridSettings();

    expect(grid.gridSize).toBe(5);
    expect(grid.showGrid).toBe(false);
    expect(grid.snapToGrid).toBe(false);
    expect(grid.snapThreshold).toBe(5);
  });
});

/** @description Unit conversion between px and mm at 96 DPI */
describe('Unit conversion', () => {
  /** @description 96 pixels equals 25.4 millimeters at standard web DPI */
  it('converts 96 pixels to 25.4 mm', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 10);
  });

  /** @description 25.4 millimeters equals 96 pixels at standard web DPI */
  it('converts 25.4 mm to 96 pixels', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 10);
  });

  /** @description 0 converts bidirectionally */
  it('converts 0 correctly', () => {
    expect(pxToMm(0)).toBe(0);
    expect(mmToPx(0)).toBe(0);
  });
});

/** @description Fallback fonts are provided when no fonts are configured */
describe('Fallback system fonts', () => {
  /** @description When no fonts are configured, fallback system fonts are used */
  it('provides fallback fonts when allowedFonts is empty', () => {
    const fonts = resolveFonts([]);

    expect(fonts.map((f) => f.family)).toEqual(
      expect.arrayContaining(['Arial', 'Courier New', 'Times New Roman', 'Georgia']),
    );
  });

  /** @description FALLBACK_SYSTEM_FONTS contains the required 4 fonts */
  it('has exactly 4 fallback system fonts', () => {
    expect(FALLBACK_SYSTEM_FONTS).toHaveLength(4);
  });

  /** @description When fonts are provided, they are used instead of fallbacks */
  it('uses provided fonts instead of fallbacks', () => {
    const fonts = resolveFonts([{ family: 'Roboto' }]);

    expect(fonts).toHaveLength(1);
    expect(fonts[0]?.family).toBe('Roboto');
  });
});

/** @description All color inputs are normalized to 6- or 8-digit hex at the model boundary */
describe('Color normalization', () => {
  /** @description CSS named color "red" normalizes to #ff0000 */
  it('normalizes CSS named color to hex', () => {
    expect(normalizeColor('red')).toBe('#ff0000');
  });

  /** @description rgb(255, 128, 0) normalizes to #ff8000 */
  it('normalizes rgb() to hex', () => {
    expect(normalizeColor('rgb(255, 128, 0)')).toBe('#ff8000');
  });

  /** @description hsl(120, 100%, 50%) normalizes to #00ff00 */
  it('normalizes hsl() to hex', () => {
    expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
  });

  /** @description 3-digit hex #abc expands to #aabbcc */
  it('expands 3-digit hex to 6-digit', () => {
    expect(normalizeColor('#abc')).toBe('#aabbcc');
  });

  /** @description 4-digit hex #abcd expands to #aabbccdd */
  it('expands 4-digit hex to 8-digit', () => {
    expect(normalizeColor('#abcd')).toBe('#aabbccdd');
  });

  /** @description 6-digit hex is stored unchanged */
  it('keeps 6-digit hex unchanged', () => {
    expect(normalizeColor('#aabbcc')).toBe('#aabbcc');
  });

  /** @description 8-digit hex is stored unchanged */
  it('keeps 8-digit hex unchanged', () => {
    expect(normalizeColor('#aabbccdd')).toBe('#aabbccdd');
  });

  /** @description rgba(255, 128, 0, 0.5) normalizes to 8-digit hex */
  it('normalizes rgba() to 8-digit hex', () => {
    const result = normalizeColor('rgba(255, 128, 0, 0.5)');

    expect(result).toBe('#ff800080');
  });
});
