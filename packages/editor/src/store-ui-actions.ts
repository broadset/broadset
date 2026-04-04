import type { CanvasSettings, EditorConfig, GridSettings, Guide } from '@broadset/model';
import { createDefaultCanvasSettings, createDefaultGridSettings } from '@broadset/model';

import type { EditingMode, EditorDocument, EditorPage } from './store-actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PALETTE_STORAGE_KEY = 'broadset:palette';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UIActionsState {
  readonly canvasSettings: CanvasSettings;
  readonly gridSettings: GridSettings;
  readonly savedPalette: readonly string[];
  readonly availableFonts: readonly string[];
  readonly mediaSource: unknown;
  readonly editingGuideId: string | null;

  switchPage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  updateCanvasSettings: (partial: Partial<CanvasSettings>) => void;
  updateGridSettings: (partial: Partial<GridSettings>) => void;
  addGuide: (guide: Omit<Guide, 'id'>) => void;
  removeGuide: (id: string) => void;
  updateGuide: (id: string, partial: Partial<Omit<Guide, 'id'>>) => void;
  resetOrigin: () => void;
  addPaletteColor: (color: string) => void;
  removePaletteColor: (index: number) => void;
  setAvailableFonts: (fonts: readonly string[]) => void;
  setMediaSource: (source: unknown) => void;
  setEditingGuideId: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Internal: minimal view of the combined store state
// ---------------------------------------------------------------------------

interface HostState {
  readonly document: EditorDocument;
  readonly activePageIndex: number;
  readonly activeElementIds: readonly string[];
  readonly editingMode: EditingMode;
  readonly canvasSettings: CanvasSettings;
  readonly gridSettings: GridSettings;
  readonly savedPalette: readonly string[];
  readonly availableFonts: readonly string[];
  readonly mediaSource: unknown;
  readonly editingGuideId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPalette(): readonly string[] {
  try {
    const stored = localStorage.getItem(PALETTE_STORAGE_KEY);

    if (stored === null) return [];

    const parsed: unknown = JSON.parse(stored);

    if (Array.isArray(parsed) && parsed.every((v): v is string => typeof v === 'string')) {
      return parsed;
    }

    return [];
  } catch {
    return [];
  }
}

function persistPalette(palette: readonly string[]): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
  } catch {
    // localStorage may be full or unavailable; silently ignore
  }
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function parseGridDefaults(raw: unknown): Partial<GridSettings> {
  if (!isRecord(raw)) return {};

  return {
    ...(typeof raw['gridSize'] === 'number' ? { gridSize: raw['gridSize'] } : {}),
    ...(typeof raw['showGrid'] === 'boolean' ? { showGrid: raw['showGrid'] } : {}),
    ...(typeof raw['snapToGrid'] === 'boolean' ? { snapToGrid: raw['snapToGrid'] } : {}),
    ...(typeof raw['snapThreshold'] === 'number' ? { snapThreshold: raw['snapThreshold'] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Slice factory
// ---------------------------------------------------------------------------

/**
 * Creates the UI-actions slice of the editor store. These actions manage
 * workspace-level state (pages, canvas settings, guides, palette) rather
 * than document content.
 */
export function createUIActionsSlice(
  set: (updater: (state: HostState) => Partial<HostState>) => void,
  config?: Partial<EditorConfig>,
): UIActionsState {
  const gridOverrides = parseGridDefaults(config?.gridDefaults);

  return {
    // --- Initial state -------------------------------------------------------
    canvasSettings: createDefaultCanvasSettings(),
    gridSettings: { ...createDefaultGridSettings(), ...gridOverrides },
    savedPalette: loadPalette(),
    availableFonts: [],
    mediaSource: null,
    editingGuideId: null,

    // --- Page navigation -----------------------------------------------------

    switchPage: (index: number): void => {
      set((state) => {
        if (index < 0 || index >= state.document.pages.length) return {};

        return {
          activePageIndex: index,
          activeElementIds: [],
          editingMode: { type: 'none' as const },
        };
      });
    },

    // --- Page add / remove ---------------------------------------------------

    addPage: (): void => {
      set((state) => {
        const newPage: EditorPage = {
          id: crypto.randomUUID(),
          elements: [],
        };

        return {
          document: {
            ...state.document,
            pages: [...state.document.pages, newPage],
          },
        };
      });
    },

    removePage: (index: number): void => {
      set((state) => {
        if (state.document.pages.length <= 1) return {};
        if (index < 0 || index >= state.document.pages.length) return {};

        const newPages = state.document.pages.filter((_, i) => i !== index);

        let newActiveIndex: number;

        if (index < state.activePageIndex) {
          // Removed a page before the active one — shift index down to keep
          // the same page in view.
          newActiveIndex = state.activePageIndex - 1;
        } else if (index === state.activePageIndex) {
          // Removed the active page — clamp to new bounds.
          newActiveIndex = Math.min(state.activePageIndex, newPages.length - 1);
        } else {
          // Removed a page after the active one — no change needed.
          newActiveIndex = state.activePageIndex;
        }

        return {
          document: { ...state.document, pages: newPages },
          activePageIndex: newActiveIndex,
        };
      });
    },

    // --- Canvas settings (NOT tracked by undo) -------------------------------

    updateCanvasSettings: (partial: Partial<CanvasSettings>): void => {
      set((state) => ({
        canvasSettings: { ...state.canvasSettings, ...partial },
      }));
    },

    updateGridSettings: (partial: Partial<GridSettings>): void => {
      set((state) => ({
        gridSettings: { ...state.gridSettings, ...partial },
      }));
    },

    // --- Guides --------------------------------------------------------------

    addGuide: (guide: Omit<Guide, 'id'>): void => {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: [...state.canvasSettings.guides, { ...guide, id: crypto.randomUUID() }],
        },
      }));
    },

    removeGuide: (id: string): void => {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: state.canvasSettings.guides.filter((g) => g.id !== id),
        },
      }));
    },

    updateGuide: (id: string, partial: Partial<Omit<Guide, 'id'>>): void => {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: state.canvasSettings.guides.map((g) => (g.id === id ? { ...g, ...partial } : g)),
        },
      }));
    },

    // --- Origin --------------------------------------------------------------

    resetOrigin: (): void => {
      set((state) => ({
        canvasSettings: { ...state.canvasSettings, originX: 0, originY: 0 },
      }));
    },

    // --- Palette -------------------------------------------------------------

    addPaletteColor: (color: string): void => {
      set((state) => {
        if (state.savedPalette.includes(color)) return {};

        const updated = [...state.savedPalette, color];

        persistPalette(updated);

        return { savedPalette: updated };
      });
    },

    removePaletteColor: (index: number): void => {
      set((state) => {
        if (index < 0 || index >= state.savedPalette.length) return {};

        const updated = state.savedPalette.filter((_, i) => i !== index);

        persistPalette(updated);

        return { savedPalette: updated };
      });
    },

    // --- Fonts ---------------------------------------------------------------

    setAvailableFonts: (fonts: readonly string[]): void => {
      set(() => ({ availableFonts: fonts }));
    },

    // --- Media source --------------------------------------------------------

    setMediaSource: (source: unknown): void => {
      set(() => ({ mediaSource: source }));
    },

    // --- Guide editing modal -------------------------------------------------

    setEditingGuideId: (id: string | null): void => {
      set(() => ({ editingGuideId: id }));
    },
  };
}
