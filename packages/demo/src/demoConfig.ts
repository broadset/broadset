import type { ComponentPlugin, EditorConfig, FontDefinition, GridSettings, MediaSourceConfig } from '@broadset/model';
import type { DocumentPreset } from '@broadset/ui';

/**
 * Deeply converts readonly arrays to mutable for Zod-inferred EditorConfig compatibility.
 * The EditorConfig type is Zod-inferred and uses mutable arrays, while our interfaces
 * correctly use readonly. This helper bridges the gap at the config boundary.
 */
function toMutableConfig(config: {
  readonly allowedFonts: readonly FontDefinition[];
  readonly defaultPalette: readonly string[];
  readonly allowedDocumentSizes: readonly { readonly label: string; readonly width: number; readonly height: number }[];
  readonly requiredElements: readonly string[];
  readonly mediaSource: MediaSourceConfig;
  readonly gridDefaults: GridSettings;
  readonly maxUndoSteps: number;
  readonly components: readonly ComponentPlugin[];
  readonly onChanges: (...args: readonly unknown[]) => void;
}): Partial<EditorConfig> {
  return {
    allowedFonts: config.allowedFonts.map((f) => ({
      family: f.family,
      ...(f.variants !== undefined ? { variants: [...f.variants] } : {}),
      ...(f.source !== undefined ? { source: f.source } : {}),
    })),
    defaultPalette: [...config.defaultPalette],
    allowedDocumentSizes: config.allowedDocumentSizes.map((s) => ({ ...s })),
    requiredElements: [...config.requiredElements],
    mediaSource: {
      assets: [...config.mediaSource.assets],
      ...(config.mediaSource.categories !== undefined ? { categories: [...config.mediaSource.categories] } : {}),
    },
    gridDefaults: config.gridDefaults,
    maxUndoSteps: config.maxUndoSteps,
    components: config.components.map((c) => ({
      type: c.type,
      label: c.label,
      rendererFactory: c.rendererFactory,
      ...(c.icon !== undefined ? { icon: c.icon } : {}),
      ...(c.defaults !== undefined ? { defaults: { ...c.defaults } } : {}),
      ...(c.propertyPanel !== undefined ? { propertyPanel: c.propertyPanel } : {}),
      ...(c.capabilities !== undefined ? { capabilities: { ...c.capabilities } } : {}),
    })),
    onChanges: config.onChanges,
  };
}

/* ── Font Configuration ─────────────────────────────────────────── */

/** At least 5 web fonts covering sans-serif and serif typefaces. */
export const DEMO_FONTS: readonly FontDefinition[] = [
  {
    family: 'Inter',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap' },
  },
  {
    family: 'Roboto',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap' },
  },
  {
    family: 'Open Sans',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap' },
  },
  {
    family: 'Merriweather',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap' },
  },
  {
    family: 'Playfair Display',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap' },
  },
  {
    family: 'Source Code Pro',
    source: { kind: 'url', url: 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;700&display=swap' },
  },
] as const;

/* ── Default Palette ────────────────────────────────────────────── */

/** At least 8 CSS color strings including black and white. */
export const DEMO_PALETTE: readonly string[] = [
  '#000000',
  '#ffffff',
  '#e63946',
  '#457b9d',
  '#1d3557',
  '#f1faee',
  '#a8dadc',
  '#2a9d8f',
  '#e9c46a',
  '#f4a261',
] as const;

/* ── Required Elements ──────────────────────────────────────────── */

/** Element IDs that cannot be deleted by the user. */
export const DEMO_REQUIRED_ELEMENTS: readonly string[] = ['el-stage-bg'] as const;

/* ── Media Source ───────────────────────────────────────────────── */

/** Sample media assets for the media library modal. */
export const DEMO_MEDIA_SOURCE: MediaSourceConfig = {
  assets: [
    { id: 'placeholder-1', name: 'Placeholder 800×600', url: 'https://placehold.co/800x600' },
    { id: 'placeholder-2', name: 'Placeholder 1920×1080', url: 'https://placehold.co/1920x1080' },
    { id: 'placeholder-3', name: 'Logo Placeholder', url: 'https://placehold.co/200x200' },
    { id: 'placeholder-4', name: 'Icon Placeholder', url: 'https://placehold.co/100x100' },
  ],
  categories: [
    { id: 'backgrounds', name: 'Backgrounds' },
    { id: 'logos', name: 'Logos' },
    { id: 'icons', name: 'Icons' },
  ],
};

/* ── Custom Component Plugin (Countdown) ────────────────────────── */

const COUNTDOWN_DEFAULT_WIDTH = 200;
const COUNTDOWN_DEFAULT_HEIGHT = 100;

/**
 * Factory that returns a simple renderer descriptor for the countdown plugin.
 * The actual rendering happens in the renderer package; this just provides
 * the configuration entry point.
 */
function countdownRendererFactory(): Readonly<Record<string, unknown>> {
  return { type: 'countdown', render: 'countdown-widget' };
}

/** Countdown custom component plugin with all required fields. */
export const COUNTDOWN_PLUGIN: ComponentPlugin = {
  type: 'countdown',
  label: 'Countdown',
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  rendererFactory: countdownRendererFactory,
  defaults: {
    width: COUNTDOWN_DEFAULT_WIDTH,
    height: COUNTDOWN_DEFAULT_HEIGHT,
    content: '00:10:00',
  },
  propertyPanel: {
    fields: [
      { key: 'duration', label: 'Duration', type: 'text' },
      { key: 'format', label: 'Format', type: 'select', options: ['HH:MM:SS', 'MM:SS', 'SS'] },
      { key: 'autoStart', label: 'Auto Start', type: 'boolean' },
      { key: 'direction', label: 'Direction', type: 'select', options: ['down', 'up'] },
    ],
  },
  capabilities: {
    resizable: true,
    rotatable: true,
    flippable: false,
    hasAnimation: true,
    hasDataBinding: true,
  },
};

/* ── Grid and Undo Defaults ─────────────────────────────────────── */

export const DEMO_GRID_DEFAULTS: GridSettings = {
  gridSize: 10,
  showGrid: false,
  snapToGrid: true,
  snapThreshold: 5,
};

export const DEMO_MAX_UNDO_STEPS = 50;

/* ── Document Size Presets ──────────────────────────────────────── */

/** Document presets covering 5 categories: Broadcast, Print, Social Media, Commercial, Large Format. */
export const DEMO_DOCUMENT_PRESETS: readonly DocumentPreset[] = [
  { name: 'HD 1080p', width: 1920, height: 1080, unit: 'px', mode: 'broadcast', category: 'Broadcast' },
  { name: 'HD 720p', width: 1280, height: 720, unit: 'px', mode: 'broadcast', category: 'Broadcast' },
  { name: '4K UHD', width: 3840, height: 2160, unit: 'px', mode: 'broadcast', category: 'Broadcast' },
  { name: 'Lower Third', width: 1920, height: 200, unit: 'px', mode: 'broadcast', category: 'Broadcast' },
  { name: 'A4 Portrait', width: 210, height: 297, unit: 'mm', mode: 'print', category: 'Print' },
  { name: 'A4 Landscape', width: 297, height: 210, unit: 'mm', mode: 'print', category: 'Print' },
  { name: 'US Letter', width: 216, height: 279, unit: 'mm', mode: 'print', category: 'Print' },
  { name: 'A3', width: 297, height: 420, unit: 'mm', mode: 'print', category: 'Print' },
  { name: 'Instagram Post', width: 1080, height: 1080, unit: 'px', mode: 'none', category: 'Social Media' },
  { name: 'Instagram Story', width: 1080, height: 1920, unit: 'px', mode: 'none', category: 'Social Media' },
  { name: 'Facebook Cover', width: 820, height: 312, unit: 'px', mode: 'none', category: 'Social Media' },
  { name: 'YouTube Thumbnail', width: 1280, height: 720, unit: 'px', mode: 'none', category: 'Social Media' },
  { name: 'Banner 728×90', width: 728, height: 90, unit: 'px', mode: 'none', category: 'Commercial' },
  { name: 'MPU 300×250', width: 300, height: 250, unit: 'px', mode: 'none', category: 'Commercial' },
  { name: 'Leaderboard 970×250', width: 970, height: 250, unit: 'px', mode: 'none', category: 'Commercial' },
  { name: 'Billboard', width: 3048, height: 1524, unit: 'mm', mode: 'print', category: 'Large Format' },
  { name: 'A0 Poster', width: 841, height: 1189, unit: 'mm', mode: 'print', category: 'Large Format' },
] as const;

/* ── Change Stream Callback ─────────────────────────────────────── */

let cumulativeChangeCount = 0;

/**
 * Logs each batch of document changes to the browser console with a cumulative count.
 * This callback is wired into EditorConfig.onChanges.
 */
export function demoOnChanges(...args: readonly unknown[]): void {
  cumulativeChangeCount += 1;
  console.info(`[Broadset] Change batch #${String(cumulativeChangeCount)}:`, ...args);
}

/** Resets the cumulative counter (for testing). */
export function resetChangeCount(): void {
  cumulativeChangeCount = 0;
}

/* ── Composite Editor Config ────────────────────────────────────── */

/** Full EditorConfig passed to createEditorStore. */
export const DEMO_EDITOR_CONFIG: Partial<EditorConfig> = toMutableConfig({
  allowedFonts: DEMO_FONTS,
  defaultPalette: DEMO_PALETTE,
  allowedDocumentSizes: DEMO_DOCUMENT_PRESETS.map((p) => ({ label: p.name, width: p.width, height: p.height })),
  requiredElements: DEMO_REQUIRED_ELEMENTS,
  mediaSource: DEMO_MEDIA_SOURCE,
  gridDefaults: DEMO_GRID_DEFAULTS,
  maxUndoSteps: DEMO_MAX_UNDO_STEPS,
  components: [COUNTDOWN_PLUGIN],
  onChanges: demoOnChanges,
});
