import type { EditorConfig } from '@broadset/model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 10;
const SNAP_THRESHOLD = 5;
const MAX_UNDO_STEPS = 50;

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const DEMO_FONTS: EditorConfig['allowedFonts'] = [
  { family: 'Inter' },
  { family: 'Roboto' },
  { family: 'Open Sans' },
  { family: 'Montserrat' },
  { family: 'Raleway' },
  { family: 'Merriweather' },
  { family: 'Playfair Display' },
];

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const DEMO_PALETTE = [
  '#000000',
  '#ffffff',
  '#f44336',
  '#2196f3',
  '#4caf50',
  '#ff9800',
  '#9c27b0',
  '#00bcd4',
  '#ffeb3b',
  '#795548',
];

// ---------------------------------------------------------------------------
// Document size presets
// ---------------------------------------------------------------------------

interface DocumentSizePreset {
  readonly name: string;
  readonly category: string;
  readonly width: number;
  readonly height: number;
  readonly units: 'px' | 'mm';
  readonly viewMode: 'broadcast' | 'print';
}

const DEMO_DOCUMENT_SIZES: readonly DocumentSizePreset[] = [
  // Broadcast
  { name: '1080p (1920×1080)', category: 'Broadcast', width: 1920, height: 1080, units: 'px', viewMode: 'broadcast' },
  { name: '720p (1280×720)', category: 'Broadcast', width: 1280, height: 720, units: 'px', viewMode: 'broadcast' },
  { name: '4K UHD (3840×2160)', category: 'Broadcast', width: 3840, height: 2160, units: 'px', viewMode: 'broadcast' },
  // Print
  { name: 'A4', category: 'Print', width: 210, height: 297, units: 'mm', viewMode: 'print' },
  { name: 'A3', category: 'Print', width: 297, height: 420, units: 'mm', viewMode: 'print' },
  { name: 'Letter', category: 'Print', width: 215.9, height: 279.4, units: 'mm', viewMode: 'print' },
  // Social Media
  {
    name: 'Instagram Post (1080×1080)',
    category: 'Social Media',
    width: 1080,
    height: 1080,
    units: 'px',
    viewMode: 'broadcast',
  },
  {
    name: 'Facebook Cover (820×312)',
    category: 'Social Media',
    width: 820,
    height: 312,
    units: 'px',
    viewMode: 'broadcast',
  },
  {
    name: 'Twitter/X Header (1500×500)',
    category: 'Social Media',
    width: 1500,
    height: 500,
    units: 'px',
    viewMode: 'broadcast',
  },
  // Commercial
  {
    name: 'Billboard (4000×2000)',
    category: 'Commercial',
    width: 4000,
    height: 2000,
    units: 'px',
    viewMode: 'broadcast',
  },
  { name: 'Banner Ad (728×90)', category: 'Commercial', width: 728, height: 90, units: 'px', viewMode: 'broadcast' },
  {
    name: 'Leaderboard (970×250)',
    category: 'Commercial',
    width: 970,
    height: 250,
    units: 'px',
    viewMode: 'broadcast',
  },
  // Large Format
  { name: 'Poster (594×841)', category: 'Large Format', width: 594, height: 841, units: 'mm', viewMode: 'print' },
  { name: 'Roll-up (850×2000)', category: 'Large Format', width: 850, height: 2000, units: 'mm', viewMode: 'print' },
  {
    name: 'Exhibition Panel (900×2400)',
    category: 'Large Format',
    width: 900,
    height: 2400,
    units: 'mm',
    viewMode: 'print',
  },
];

// ---------------------------------------------------------------------------
// Required elements
// ---------------------------------------------------------------------------

interface RequiredElement {
  readonly type: string;
  readonly id: string;
}

const DEMO_REQUIRED_ELEMENTS: readonly RequiredElement[] = [
  { type: 'text', id: 'el-home-score' },
  { type: 'text', id: 'el-away-score' },
];

// ---------------------------------------------------------------------------
// Media source
// ---------------------------------------------------------------------------

interface MediaAsset {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly categoryId: string;
}

interface MediaCategory {
  readonly id: string;
  readonly name: string;
}

interface MediaSource {
  readonly assets: readonly MediaAsset[];
  readonly categories: readonly MediaCategory[];
}

const DEMO_MEDIA_SOURCE: MediaSource = {
  assets: [
    { id: 'a1', name: 'Company Logo', url: '/assets/logo.png', categoryId: 'logos' },
    { id: 'a2', name: 'Event Banner', url: '/assets/banner.jpg', categoryId: 'graphics' },
    { id: 'a3', name: 'Score Bug', url: '/assets/bug.svg', categoryId: 'graphics' },
    { id: 'a4', name: 'Sponsor Logo', url: '/assets/sponsor.png', categoryId: 'logos' },
  ],
  categories: [
    { id: 'logos', name: 'Logos' },
    { id: 'graphics', name: 'Graphics' },
  ],
};

// ---------------------------------------------------------------------------
// Custom component plugin (countdown timer)
// ---------------------------------------------------------------------------

function countdownRendererFactory(): (element: Record<string, unknown>, host: HTMLElement) => void {
  return (_element: Record<string, unknown>, host: HTMLElement): void => {
    host.textContent = '00:00';
  };
}

function CountdownPropertyPanel(): null {
  return null;
}

const DEMO_COMPONENTS: EditorConfig['components'] = [
  {
    type: 'countdown',
    label: 'Countdown Timer',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor"/></svg>',
    rendererFactory: countdownRendererFactory,
    propertyPanel: CountdownPropertyPanel,
    defaults: { width: 200, height: 60, content: '00:00' },
    capabilities: { animations: true },
  },
];

// ---------------------------------------------------------------------------
// Change stream logging
// ---------------------------------------------------------------------------

let cumulativeChangeCount = 0;

function onChanges(changes: readonly unknown[]): void {
  cumulativeChangeCount += changes.length;

  console.log(
    `[broadset] Change batch (${String(changes.length)} changes, ${String(cumulativeChangeCount)} total)`,
    changes,
  );
}

// ---------------------------------------------------------------------------
// Save callback
// ---------------------------------------------------------------------------

const SAVE_STORAGE_KEY = 'broadset-saved-document';

function onSave(document: unknown): void {
  try {
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // localStorage may be unavailable or full
  }
}

/**
 * Reads the saved document from localStorage.
 * Returns null if no valid document is stored.
 */
export function loadSavedDocument(): unknown {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);

    if (raw === null) return null;

    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Assembled config
// ---------------------------------------------------------------------------

export function createDemoConfig(): EditorConfig {
  return {
    allowedFonts: DEMO_FONTS,
    defaultPalette: DEMO_PALETTE,
    allowedDocumentSizes: DEMO_DOCUMENT_SIZES as unknown as EditorConfig['allowedDocumentSizes'],
    requiredElements: DEMO_REQUIRED_ELEMENTS.map((e) => e.id),
    mediaSource: DEMO_MEDIA_SOURCE,
    gridDefaults: {
      gridSize: GRID_SIZE,
      showGrid: false,
      snapToGrid: true,
      snapThreshold: SNAP_THRESHOLD,
    },
    maxUndoSteps: MAX_UNDO_STEPS,
    components: DEMO_COMPONENTS,
    onChanges: onChanges as unknown as EditorConfig['onChanges'],
    onSave: onSave as unknown as EditorConfig['onSave'],
  };
}

// Re-export for tests
export {
  DEMO_COMPONENTS,
  DEMO_DOCUMENT_SIZES,
  DEMO_FONTS,
  DEMO_MEDIA_SOURCE,
  DEMO_PALETTE,
  DEMO_REQUIRED_ELEMENTS,
  SAVE_STORAGE_KEY,
};
export type { DocumentSizePreset, MediaAsset, MediaCategory, MediaSource, RequiredElement };
