import type { CSSProperties } from 'react';

import type { ShortcutMap } from './types';

export const VIEW_MODES = ['broadcast', 'none', 'print'] as const;

export const EXPORTER_CATEGORIES = [
  { category: 'Web', formats: ['html', 'svg'] },
  { category: 'Image', formats: ['png', 'jpeg', 'svg-embedded'] },
  { category: 'Document', formats: ['pdf', 'psd', 'pptx'] },
  { category: 'Video', formats: ['mp4', 'webm'] },
  { category: 'Broadcast', formats: ['ograf'] },
] as const;

export const VISUALLY_HIDDEN_HEADING_STYLE: Readonly<CSSProperties> = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
};

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  'Clipboard & Selection': [
    { action: 'Copy', keys: ['Ctrl', 'C'] },
    { action: 'Cut', keys: ['Ctrl', 'X'] },
    { action: 'Paste', keys: ['Ctrl', 'V'] },
    { action: 'Select all', keys: ['Ctrl', 'A'] },
    { action: 'Deselect', keys: ['Escape'] },
    { action: 'Duplicate', keys: ['Ctrl', 'D'] },
    { action: 'Delete', keys: ['Delete'] },
  ],
  Nudge: [
    { action: 'Nudge 1px', keys: ['Arrow'] },
    { action: 'Nudge 10px', keys: ['Shift', 'Arrow'] },
  ],
  'Layer Order': [
    { action: 'Bring forward', keys: ['Ctrl', ']'] },
    { action: 'Send backward', keys: ['Ctrl', '['] },
    { action: 'Bring to front', keys: ['Ctrl', 'Shift', ']'] },
    { action: 'Send to back', keys: ['Ctrl', 'Shift', '['] },
  ],
  'Grouping & Lock': [
    { action: 'Group', keys: ['Ctrl', 'G'] },
    { action: 'Ungroup', keys: ['Ctrl', 'Shift', 'G'] },
    { action: 'Lock / Unlock', keys: ['Ctrl', 'L'] },
  ],
  'Zoom & History': [
    { action: 'Zoom in', keys: ['Ctrl', '+'] },
    { action: 'Zoom out', keys: ['Ctrl', '-'] },
    { action: 'Fit to screen', keys: ['Ctrl', '0'] },
    { action: 'Undo', keys: ['Ctrl', 'Z'] },
    { action: 'Redo', keys: ['Ctrl', 'Shift', 'Z'] },
  ],
};

export const LEFT_COLUMN_GROUPS = ['Clipboard & Selection', 'Nudge'] as const;
export const RIGHT_COLUMN_GROUPS = ['Layer Order', 'Grouping & Lock', 'Zoom & History'] as const;
