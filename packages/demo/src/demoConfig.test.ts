/** @jest-environment node */

import type { ComponentPlugin, FontDefinition, GridSettings, MediaSourceConfig } from '@broadset/model';

import {
  COUNTDOWN_PLUGIN,
  DEMO_DOCUMENT_PRESETS,
  DEMO_EDITOR_CONFIG,
  DEMO_FONTS,
  DEMO_GRID_DEFAULTS,
  DEMO_MAX_UNDO_STEPS,
  DEMO_MEDIA_SOURCE,
  DEMO_PALETTE,
  DEMO_REQUIRED_ELEMENTS,
  demoOnChanges,
  resetChangeCount,
} from './demoConfig';

describe('Demo Editor Configuration (9-G)', () => {
  describe('Font Configuration', () => {
    /** @description At least 5 web fonts must be configured with family and URL source. */
    it('configures at least 5 web fonts with family and URL', () => {
      expect(DEMO_FONTS.length).toBeGreaterThanOrEqual(5);

      for (const font of DEMO_FONTS) {
        expect(font.family).toBeTruthy();
        expect(font.source).toBeDefined();

        if (font.source?.kind === 'url') {
          expect(font.source.url).toContain('http');
        } else {
          // All demo fonts must be URL-sourced
          expect(font.source).toEqual(expect.objectContaining({ kind: 'url' }));
        }
      }
    });

    /** @description The font list must include both sans-serif and serif typefaces. */
    it('includes both sans-serif and serif typefaces', () => {
      const families = DEMO_FONTS.map((f: FontDefinition) => f.family);
      const KNOWN_SANS = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Nunito', 'Poppins'];
      const KNOWN_SERIF = ['Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Source Serif Pro', 'Noto Serif'];

      const hasSans = families.some((f) => KNOWN_SANS.includes(f));
      const hasSerif = families.some((f) => KNOWN_SERIF.includes(f));

      expect(hasSans).toBe(true);
      expect(hasSerif).toBe(true);
    });
  });

  describe('Default Color Palette', () => {
    /** @description The palette must have at least 8 colors. */
    it('has at least 8 colors', () => {
      expect(DEMO_PALETTE.length).toBeGreaterThanOrEqual(8);
    });

    /** @description Black and white must be included in the palette. */
    it('includes black and white', () => {
      const lowerPalette = DEMO_PALETTE.map((c: string) => c.toLowerCase());

      expect(lowerPalette).toContain('#000000');
      expect(lowerPalette).toContain('#ffffff');
    });
  });

  describe('Document Size Presets', () => {
    const REQUIRED_CATEGORIES = ['Broadcast', 'Print', 'Social Media', 'Commercial', 'Large Format'];

    /** @description At least one preset must exist per category. */
    it('has at least one preset per required category', () => {
      for (const category of REQUIRED_CATEGORIES) {
        const found = DEMO_DOCUMENT_PRESETS.filter((p) => p.category === category);

        expect(found.length).toBeGreaterThanOrEqual(1);
      }
    });

    /** @description Each preset must specify name, category, width, height, unit, and mode. */
    it('each preset specifies name, category, width, height, unit, and mode', () => {
      for (const preset of DEMO_DOCUMENT_PRESETS) {
        expect(preset.name).toBeTruthy();
        expect(preset.category).toBeTruthy();
        expect(preset.width).toBeGreaterThan(0);
        expect(preset.height).toBeGreaterThan(0);
        expect(['px', 'mm']).toContain(preset.unit);
        expect(['broadcast', 'print', 'none']).toContain(preset.mode);
      }
    });
  });

  describe('Required Elements', () => {
    /** @description At least one required element must be configured. */
    it('configures at least one required element', () => {
      expect(DEMO_REQUIRED_ELEMENTS.length).toBeGreaterThanOrEqual(1);

      for (const id of DEMO_REQUIRED_ELEMENTS) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Media Source Configuration', () => {
    /** @description A media source must be configured with sample assets. */
    it('provides a media source with sample assets', () => {
      const ms: MediaSourceConfig = DEMO_MEDIA_SOURCE;

      expect(ms.assets.length).toBeGreaterThan(0);

      for (const asset of ms.assets) {
        expect(asset.id).toBeTruthy();
        expect(asset.name).toBeTruthy();
        expect(asset.url).toBeTruthy();
      }
    });

    /** @description Media source categories are configured. */
    it('includes media categories', () => {
      const categories = DEMO_MEDIA_SOURCE.categories ?? [];

      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Component Plugin', () => {
    /** @description At least one custom component plugin must be registered with all required fields. */
    it('registers a plugin with type, label, icon, rendererFactory, propertyPanel, defaults, and capabilities', () => {
      const plugin: ComponentPlugin = COUNTDOWN_PLUGIN;

      expect(plugin.type).toBeTruthy();
      expect(plugin.label).toBeTruthy();
      expect(plugin.icon).toBeTruthy();
      expect(typeof plugin.rendererFactory).toBe('function');
      expect(plugin.propertyPanel).toBeDefined();

      const defaults = plugin.defaults ?? { width: undefined, height: undefined, content: undefined };

      expect(defaults.width).toBeDefined();
      expect(defaults.width).toBeGreaterThan(0);
      expect(defaults.height).toBeDefined();
      expect(defaults.height).toBeGreaterThan(0);
      expect(defaults.content).toBeDefined();
      expect(plugin.capabilities).toBeDefined();
    });
  });

  describe('Change Stream Logging', () => {
    beforeEach(() => {
      resetChangeCount();
    });

    /** @description Each batch of changes must be logged with a cumulative count. */
    it('logs batches with a cumulative count', () => {
      const spy = jest.spyOn(console, 'info').mockImplementation(() => {});

      demoOnChanges([{ type: 'add' }]);
      demoOnChanges([{ type: 'update' }]);
      demoOnChanges([{ type: 'remove' }]);

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock.calls[0]?.[0]).toContain('#1');
      expect(spy.mock.calls[1]?.[0]).toContain('#2');
      expect(spy.mock.calls[2]?.[0]).toContain('#3');

      spy.mockRestore();
    });
  });

  describe('Grid and Undo Defaults', () => {
    /** @description Grid defaults must be gridSize=10, snapToGrid=true. */
    it('sets gridSize=10 and snapToGrid=true', () => {
      const grid: GridSettings = DEMO_GRID_DEFAULTS;

      expect(grid.gridSize).toBe(10);
      expect(grid.snapToGrid).toBe(true);
    });

    /** @description maxUndoSteps must be 50. */
    it('sets maxUndoSteps to 50', () => {
      expect(DEMO_MAX_UNDO_STEPS).toBe(50);
    });
  });

  describe('Composite EditorConfig', () => {
    /** @description The full DEMO_EDITOR_CONFIG must contain all required fields wired together. */
    it('has all config fields wired', () => {
      const config = DEMO_EDITOR_CONFIG;

      expect(config.allowedFonts).toHaveLength(DEMO_FONTS.length);
      expect(config.defaultPalette).toEqual([...DEMO_PALETTE]);
      expect(config.requiredElements).toEqual([...DEMO_REQUIRED_ELEMENTS]);
      expect(config.allowedDocumentSizes).toBeDefined();

      const configMediaAssets = config.mediaSource?.assets ?? [];

      expect(configMediaAssets.length).toBeGreaterThan(0);
      expect(config.gridDefaults).toEqual(DEMO_GRID_DEFAULTS);
      expect(config.maxUndoSteps).toBe(DEMO_MAX_UNDO_STEPS);
      expect(config.onChanges).toBeDefined();

      const components = config.components ?? [];

      expect(components.length).toBeGreaterThanOrEqual(1);
    });
  });
});
