import { describe, expect, it } from 'vitest';

import {
  createDefaultCanvasSettings,
  createDefaultFeatureConfig,
  createDefaultGridSettings,
  editorConfigSchema,
  FALLBACK_SYSTEM_FONTS,
  featureConfigSchema,
  resolveFonts,
} from './index';

/** @description Editor config accepts both minimal and fully configured host setups. */
describe('EditorConfig shape', () => {
  /** @description A host can provide just the allowed font list and still produce a valid config. */
  it('accepts minimal config with allowedFonts', () => {
    const result = editorConfigSchema.safeParse({
      allowedFonts: [{ family: 'Arial' }],
    });

    expect(result.success).toBe(true);
  });

  /** @description A fully populated config with palette, sizes, required elements, and components must validate. */
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
          rendererFactory: () => null,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

/** @description Feature config exposes a strict set of boolean gates for editor capabilities. */
describe('Feature configuration gating', () => {
  /** @description The generated default feature config must satisfy the runtime schema. */
  it('accepts feature config with all flags', () => {
    const config = createDefaultFeatureConfig('screen');
    const result = featureConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
  });

  /** @description Every feature gate is intentionally represented as a boolean switch. */
  it('has boolean values for all flags', () => {
    const config = createDefaultFeatureConfig('screen');

    for (const [, value] of Object.entries(config)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

/** @description Screen and print modes derive different default capability sets. */
describe('Document mode feature defaults', () => {
  /** @description Screen documents enable animation and 3D affordances by default. */
  it('screen mode enables animations and transforms3d', () => {
    const config = createDefaultFeatureConfig('screen');

    expect(config.animations).toBe(true);
    expect(config.transforms3d).toBe(true);
    expect(config.broadcastPreview).toBe(true);
  });

  /** @description Print documents disable runtime-only behavior like animation and 3D transforms. */
  it('print mode disables animations and transforms3d', () => {
    const config = createDefaultFeatureConfig('print');

    expect(config.animations).toBe(false);
    expect(config.transforms3d).toBe(false);
  });

  /** @description Host overrides should merge on top of mode-derived defaults without mutating unrelated flags. */
  it('host override merges with mode defaults', () => {
    const base = createDefaultFeatureConfig('screen');
    const merged = { ...base, animations: false };

    expect(merged.animations).toBe(false);
    expect(merged.transforms3d).toBe(true);
  });
});

/** @description Canvas settings start from deterministic defaults so new documents behave predictably. */
describe('Default canvas settings', () => {
  /** @description The default canvas config must include the documented baseline view, zoom, and ruler values. */
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

/** @description Grid settings also start from stable defaults for snap behavior. */
describe('Default grid settings', () => {
  /** @description The grid baseline is 5px with snapping and visibility both disabled. */
  it('has correct defaults', () => {
    const grid = createDefaultGridSettings();

    expect(grid.gridSize).toBe(5);
    expect(grid.showGrid).toBe(false);
    expect(grid.snapToGrid).toBe(false);
    expect(grid.snapThreshold).toBe(5);
  });
});

/** @description Hosts always have a usable fallback font set even when no custom fonts are configured. */
describe('Fallback system fonts', () => {
  /** @description Empty font lists must resolve to the baked-in fallback family set. */
  it('provides fallback fonts when allowedFonts is empty', () => {
    const fonts = resolveFonts([]);

    expect(fonts.map((font: { family: string }) => font.family)).toEqual(
      expect.arrayContaining(['Arial', 'Courier New', 'Times New Roman', 'Georgia']),
    );
  });

  /** @description The repository defines exactly four fallback system fonts. */
  it('has exactly 4 fallback system fonts', () => {
    expect(FALLBACK_SYSTEM_FONTS).toHaveLength(4);
  });

  /** @description Provided fonts should override the fallback list instead of being merged with it. */
  it('uses provided fonts instead of fallbacks', () => {
    const fonts = resolveFonts([{ family: 'Roboto' }]);

    expect(fonts).toHaveLength(1);
    expect(fonts[0]?.family).toBe('Roboto');
  });
});
