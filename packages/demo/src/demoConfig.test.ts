import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  createDemoConfig,
  DEMO_COMPONENTS,
  DEMO_DOCUMENT_SIZES,
  DEMO_FONTS,
  DEMO_MEDIA_SOURCE,
  DEMO_PALETTE,
  DEMO_REQUIRED_ELEMENTS,
  loadSavedDocument,
  SAVE_STORAGE_KEY,
} from './demoConfig';

// ---------------------------------------------------------------------------
// Font Configuration
// ---------------------------------------------------------------------------

describe('Demo Config — Font Configuration', () => {
  /**
   * @description The demo must configure at least 5 web fonts with family names.
   * This ensures a rich typography experience in the editor.
   */
  it('configures at least 5 web fonts with family', () => {
    expect(DEMO_FONTS.length).toBeGreaterThanOrEqual(5);

    for (const font of DEMO_FONTS) {
      expect(font.family).toBeTruthy();
    }
  });

  /**
   * @description Font families must include both sans-serif and serif typefaces
   * to provide variety for different document types.
   */
  it('includes both sans-serif and serif typefaces', () => {
    const families = DEMO_FONTS.map((f) => f.family);
    // Known sans-serif fonts in the list
    const hasSans = families.some((f) => ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Raleway'].includes(f));
    // Known serif fonts in the list
    const hasSerif = families.some((f) =>
      ['Merriweather', 'Playfair Display', 'Georgia', 'Times New Roman'].includes(f),
    );

    expect(hasSans).toBe(true);
    expect(hasSerif).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Default Color Palette
// ---------------------------------------------------------------------------

describe('Demo Config — Default Color Palette', () => {
  /**
   * @description The default palette must have at least 8 colors for a
   * reasonable design experience.
   */
  it('has at least 8 colors', () => {
    expect(DEMO_PALETTE.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * @description The palette must include black and white as fundamental colors.
   */
  it('includes black and white', () => {
    expect(DEMO_PALETTE).toContain('#000000');
    expect(DEMO_PALETTE).toContain('#ffffff');
  });
});

// ---------------------------------------------------------------------------
// Document Size Presets
// ---------------------------------------------------------------------------

describe('Demo Config — Document Size Presets', () => {
  const REQUIRED_CATEGORIES = ['Broadcast', 'Print', 'Social Media', 'Commercial', 'Large Format'];

  /**
   * @description At least one preset must exist per required category to
   * cover the most common design workflows.
   */
  it('has at least one preset per required category', () => {
    for (const category of REQUIRED_CATEGORIES) {
      const matching = DEMO_DOCUMENT_SIZES.filter((p) => p.category === category);

      expect(matching.length).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * @description Each preset must specify all required fields: name, category,
   * width, height, units, and viewMode.
   */
  it('each preset specifies name, category, width, height, units, viewMode', () => {
    for (const preset of DEMO_DOCUMENT_SIZES) {
      expect(preset.name).toBeTruthy();
      expect(preset.category).toBeTruthy();
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(['px', 'mm']).toContain(preset.units);
      expect(['broadcast', 'print']).toContain(preset.viewMode);
    }
  });
});

// ---------------------------------------------------------------------------
// Required Elements
// ---------------------------------------------------------------------------

describe('Demo Config — Required Elements', () => {
  /**
   * @description At least one required element must be configured with type and id
   * to prevent accidental deletion of essential graphics elements.
   */
  it('has at least one required element with type and id', () => {
    expect(DEMO_REQUIRED_ELEMENTS.length).toBeGreaterThanOrEqual(1);

    for (const el of DEMO_REQUIRED_ELEMENTS) {
      expect(el.type).toBeTruthy();
      expect(el.id).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Media Source Configuration
// ---------------------------------------------------------------------------

describe('Demo Config — Media Source', () => {
  /**
   * @description A media source must be configured with sample assets for the
   * media library modal.
   */
  it('has a media source with sample assets', () => {
    expect(DEMO_MEDIA_SOURCE.assets.length).toBeGreaterThan(0);
    expect(DEMO_MEDIA_SOURCE.categories.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Custom Component Plugin
// ---------------------------------------------------------------------------

describe('Demo Config — Custom Component Plugin', () => {
  /**
   * @description At least one custom component plugin must be registered.
   */
  it('has at least one custom component plugin', () => {
    expect(DEMO_COMPONENTS).toBeDefined();
    expect((DEMO_COMPONENTS ?? []).length).toBeGreaterThanOrEqual(1);
  });

  /**
   * @description The plugin must provide type, label, icon, rendererFactory,
   * propertyPanel, defaults, and capabilities.
   */
  it('plugin provides all required fields', () => {
    const plugin = (DEMO_COMPONENTS ?? [])[0];

    expect(plugin).toBeDefined();

    if (plugin === undefined) return;

    expect(plugin.type).toBeTruthy();
    expect(plugin.label).toBeTruthy();
    expect(plugin.icon).toBeTruthy();
    expect(typeof plugin.rendererFactory).toBe('function');
    expect(plugin.propertyPanel).toBeDefined();
    expect(plugin.defaults).toBeDefined();
    expect(plugin.capabilities).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Change Stream Logging
// ---------------------------------------------------------------------------

describe('Demo Config — Change Stream Logging', () => {
  /**
   * @description The onChanges callback must be configured so that document
   * changes are logged with cumulative count.
   */
  it('configures onChanges callback', () => {
    const config = createDemoConfig();

    expect(config.onChanges).toBeDefined();
    expect(typeof config.onChanges).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Grid and Undo Defaults
// ---------------------------------------------------------------------------

describe('Demo Config — Grid and Undo Defaults', () => {
  /**
   * @description Grid defaults must be gridSize=10, snapToGrid=true.
   */
  it('grid defaults: gridSize=10, snapToGrid=true', () => {
    const config = createDemoConfig();
    const grid = config.gridDefaults as Record<string, unknown>;

    expect(grid['gridSize']).toBe(10);
    expect(grid['snapToGrid']).toBe(true);
  });

  /**
   * @description maxUndoSteps must be 50.
   */
  it('maxUndoSteps is 50', () => {
    const config = createDemoConfig();

    expect(config.maxUndoSteps).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Save / Load
// ---------------------------------------------------------------------------

describe('Demo Config — Save via Host Callback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * @description The onSave callback must serialize the document to localStorage.
   */
  it('onSave writes document to localStorage', () => {
    const config = createDemoConfig();
    const doc = { id: 'test-doc', pages: [] };

    expect(config.onSave).toBeDefined();

    // Call onSave — typed as z.function() which is (...args: unknown[]) => unknown
    const saveFn: (doc: unknown) => void = config.onSave as never;

    saveFn(doc);

    const stored = localStorage.getItem(SAVE_STORAGE_KEY);

    expect(stored).toBeTruthy();
    expect(JSON.parse(stored ?? '{}')).toEqual(doc);
  });

  /**
   * @description loadSavedDocument returns the saved document when present.
   */
  it('loadSavedDocument returns saved document', () => {
    const doc = { id: 'saved-doc', pages: [{ id: 'p1', elements: [] }] };

    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(doc));

    const result = loadSavedDocument();

    expect(result).toEqual(doc);
  });

  /**
   * @description loadSavedDocument returns null when no saved document exists.
   */
  it('loadSavedDocument returns null when empty', () => {
    const result = loadSavedDocument();

    expect(result).toBeNull();
  });

  /**
   * @description loadSavedDocument returns null on corrupt data without throwing.
   */
  it('loadSavedDocument handles corrupt data gracefully', () => {
    localStorage.setItem(SAVE_STORAGE_KEY, '{invalid json!!!');

    const result = loadSavedDocument();

    expect(result).toBeNull();
  });
});
