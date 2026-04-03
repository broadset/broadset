import { describe, expect, it } from '@jest/globals';

import {
  createDefaultCanvasSettings,
  createDefaultFeatureConfig,
  createDefaultGridSettings,
  editorConfigSchema,
  FALLBACK_SYSTEM_FONTS,
  featureConfigSchema,
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
