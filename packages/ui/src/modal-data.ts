import { COMMON_CANVAS_SIZES } from '@broadset/model';

// ---------------------------------------------------------------------------
// Export format mapping
// ---------------------------------------------------------------------------

interface ExportFormat {
  readonly key: string;
  readonly label: string;
  readonly featureFlag: string;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { key: 'html', label: 'HTML', featureFlag: 'exportHtml' },
  { key: 'svg', label: 'SVG', featureFlag: 'exportSvg' },
  { key: 'pdf', label: 'PDF', featureFlag: 'exportPdf' },
  { key: 'psd', label: 'PSD', featureFlag: 'exportPsd' },
  { key: 'pptx', label: 'PPTX', featureFlag: 'exportPptx' },
  { key: 'png', label: 'PNG', featureFlag: 'exportPng' },
  { key: 'jpeg', label: 'JPEG', featureFlag: 'exportJpeg' },
  { key: 'svgEmbedded', label: 'SVG Embedded', featureFlag: 'exportSvgEmbedded' },
  { key: 'ograf', label: 'OGRAF', featureFlag: 'exportOgraf' },
  { key: 'mp4', label: 'MP4', featureFlag: 'exportMp4' },
  { key: 'webm', label: 'WebM', featureFlag: 'exportWebm' },
];

// ---------------------------------------------------------------------------
// Shortcut data
// ---------------------------------------------------------------------------

interface ShortcutEntry {
  readonly keys: string;
  readonly description: string;
}

export interface ShortcutGroup {
  readonly name: string;
  readonly shortcuts: readonly ShortcutEntry[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    name: 'General',
    shortcuts: [
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Y', description: 'Redo' },
      { keys: 'Ctrl+A', description: 'Select all' },
      { keys: 'Delete', description: 'Delete selected' },
      { keys: 'Ctrl+C', description: 'Copy' },
      { keys: 'Ctrl+V', description: 'Paste' },
      { keys: 'Ctrl+D', description: 'Duplicate' },
    ],
  },
  {
    name: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl+=', description: 'Zoom in' },
      { keys: 'Ctrl+-', description: 'Zoom out' },
      { keys: 'Ctrl+0', description: 'Reset zoom' },
      { keys: 'Ctrl+1', description: 'Fit to screen' },
    ],
  },
  {
    name: 'Transform',
    shortcuts: [
      { keys: '↑ / ↓ / ← / →', description: 'Nudge 1 mm' },
      { keys: 'Shift + ↑ / ↓ / ← / →', description: 'Nudge 10 mm' },
    ],
  },
  {
    name: 'Element',
    shortcuts: [
      { keys: 'Ctrl+G', description: 'Group' },
      { keys: 'Ctrl+Shift+G', description: 'Ungroup' },
      { keys: 'Ctrl+L', description: 'Lock/unlock' },
      { keys: 'Ctrl+]', description: 'Bring forward' },
      { keys: 'Ctrl+[', description: 'Send backward' },
      { keys: 'Ctrl+Shift+]', description: 'Bring to front' },
      { keys: 'Ctrl+Shift+[', description: 'Send to back' },
    ],
  },
  {
    name: 'Path Editing',
    shortcuts: [
      { keys: 'Escape', description: 'Exit path mode' },
      { keys: 'Enter', description: 'Close path' },
      { keys: 'Delete', description: 'Delete point' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Document presets
// ---------------------------------------------------------------------------

export interface DocumentPreset {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly mode: 'print' | 'screen';
}

export interface PresetCategory {
  readonly category: string;
  readonly presets: readonly DocumentPreset[];
}

export const BUILT_IN_CATEGORIES: readonly PresetCategory[] = [
  {
    category: 'Screen',
    presets: COMMON_CANVAS_SIZES.filter((s) => !s.label.startsWith('A4')).map((s) => ({
      ...s,
      mode: 'screen' as const,
    })),
  },
  {
    category: 'Print',
    presets: COMMON_CANVAS_SIZES.filter((s) => s.label.startsWith('A4')).map((s) => ({ ...s, mode: 'print' as const })),
  },
];
