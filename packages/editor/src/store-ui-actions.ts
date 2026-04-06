import {
  type BroadsetDocument,
  type CanvasSettings,
  createDefaultCanvasSettings,
  createDefaultGridSettings,
  type EditorConfig,
  type GridSettings,
  type Guide,
  type Page,
} from '@broadset/model';

import type { EditingMode } from './store-actions';

const PALETTE_STORAGE_KEY = 'broadset:palette';

interface HostState {
  readonly document: BroadsetDocument;
  readonly activePageIndex: number;
  readonly activeElementIds: readonly string[];
  readonly editingMode: EditingMode;
  readonly pendingPlacementType: string | null;
  readonly pathEditingElementId: string | null;
  readonly pathDrawingElementId: string | null;
  readonly canvasSettings: CanvasSettings;
  readonly gridSettings: GridSettings;
  readonly savedPalette: readonly string[];
  readonly availableFonts: readonly string[];
  readonly mediaSource: EditorConfig['mediaSource'] | null;
  readonly editingGuideId: string | null;
}

export interface UIActionsState {
  readonly canvasSettings: CanvasSettings;
  readonly gridSettings: GridSettings;
  readonly savedPalette: readonly string[];
  readonly availableFonts: readonly string[];
  readonly mediaSource: EditorConfig['mediaSource'] | null;
  readonly editingGuideId: string | null;
  readonly switchPage: (index: number) => void;
  readonly addPage: () => void;
  readonly removePage: (index: number) => void;
  readonly updateCanvasSettings: (partial: Partial<CanvasSettings>) => void;
  readonly updateGridSettings: (partial: Partial<GridSettings>) => void;
  readonly addGuide: (guide: Omit<Guide, 'id'>) => void;
  readonly removeGuide: (id: string) => void;
  readonly updateGuide: (id: string, partial: Partial<Omit<Guide, 'id'>>) => void;
  readonly resetOrigin: () => void;
  readonly addPaletteColor: (color: string) => void;
  readonly removePaletteColor: (index: number) => void;
  readonly setAvailableFonts: (fonts: readonly string[]) => void;
  readonly setMediaSource: (source: EditorConfig['mediaSource'] | null) => void;
  readonly setEditingGuideId: (id: string | null) => void;
}

function loadPalette(): readonly string[] {
  try {
    if (typeof window === 'undefined') {
      return [];
    }

    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);

    if (stored === null) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;

    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function persistPalette(palette: readonly string[]): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
  } catch {
    // localStorage may be unavailable in some test or embedded environments.
  }
}

function createPage(name: string): Page {
  return {
    id: crypto.randomUUID(),
    name,
    overrides: [],
    locale: null,
    extensions: {},
  };
}

export function createUIActionsSlice(
  set: (updater: (state: HostState) => Partial<HostState>) => void,
  config?: Partial<EditorConfig>,
): UIActionsState {
  const defaultCanvasSettings = createDefaultCanvasSettings();
  const rawGridDefaults = config === undefined ? undefined : config.gridDefaults;
  const defaultGridSettings = {
    ...createDefaultGridSettings(),
    ...(typeof rawGridDefaults === 'object' && rawGridDefaults !== null ? rawGridDefaults : {}),
  };
  const fallbackFontFamilies = ['Arial', 'Courier New', 'Times New Roman', 'Georgia'];
  const availableFonts =
    config?.allowedFonts !== undefined && config.allowedFonts.length > 0 ?
      config.allowedFonts.map((font) => font.family)
    : fallbackFontFamilies;

  return {
    canvasSettings: {
      ...defaultCanvasSettings,
      grid: defaultGridSettings,
    },
    gridSettings: defaultGridSettings,
    savedPalette: loadPalette(),
    availableFonts,
    mediaSource: config?.mediaSource ?? null,
    editingGuideId: null,
    switchPage(index: number): void {
      set((state) => {
        if (index < 0 || index >= state.document.pages.length) {
          return {};
        }

        return {
          activePageIndex: index,
          activeElementIds: [],
          editingMode: { type: 'none' },
          pendingPlacementType: null,
          pathEditingElementId: null,
          pathDrawingElementId: null,
        };
      });
    },
    addPage(): void {
      set((state) => ({
        document: {
          ...state.document,
          pages: [...state.document.pages, createPage(`Scene ${String(state.document.pages.length + 1)}`)],
        },
      }));
    },
    removePage(index: number): void {
      set((state) => {
        if (state.document.pages.length <= 1 || index < 0 || index >= state.document.pages.length) {
          return {};
        }

        const nextPages = state.document.pages.filter((_, pageIndex) => pageIndex !== index);
        const nextActivePageIndex = Math.min(state.activePageIndex, nextPages.length - 1);

        return {
          document: {
            ...state.document,
            pages: nextPages,
          },
          activePageIndex: nextActivePageIndex,
          activeElementIds: [],
          editingMode: { type: 'none' },
          pendingPlacementType: null,
          pathEditingElementId: null,
          pathDrawingElementId: null,
        };
      });
    },
    updateCanvasSettings(partial: Partial<CanvasSettings>): void {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          ...partial,
        },
      }));
    },
    updateGridSettings(partial: Partial<GridSettings>): void {
      set((state) => {
        const nextGridSettings = {
          ...state.gridSettings,
          ...partial,
        };

        return {
          gridSettings: nextGridSettings,
          canvasSettings: {
            ...state.canvasSettings,
            grid: nextGridSettings,
          },
        };
      });
    },
    addGuide(guide: Omit<Guide, 'id'>): void {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: [...state.canvasSettings.guides, { ...guide, id: crypto.randomUUID() }],
        },
      }));
    },
    removeGuide(id: string): void {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: state.canvasSettings.guides.filter((guide) => guide.id !== id),
        },
      }));
    },
    updateGuide(id: string, partial: Partial<Omit<Guide, 'id'>>): void {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          guides: state.canvasSettings.guides.map((guide) => (guide.id === id ? { ...guide, ...partial } : guide)),
        },
      }));
    },
    resetOrigin(): void {
      set((state) => ({
        canvasSettings: {
          ...state.canvasSettings,
          originX: 0,
          originY: 0,
        },
      }));
    },
    addPaletteColor(color: string): void {
      set((state) => {
        const normalizedColor = color.trim();

        if (normalizedColor === '' || state.savedPalette.includes(normalizedColor)) {
          return {};
        }

        const nextPalette = [...state.savedPalette, normalizedColor];

        persistPalette(nextPalette);

        return { savedPalette: nextPalette };
      });
    },
    removePaletteColor(index: number): void {
      set((state) => {
        if (index < 0 || index >= state.savedPalette.length) {
          return {};
        }

        const nextPalette = state.savedPalette.filter((_, paletteIndex) => paletteIndex !== index);

        persistPalette(nextPalette);

        return { savedPalette: nextPalette };
      });
    },
    setAvailableFonts(fonts: readonly string[]): void {
      set(() => ({ availableFonts: [...fonts] }));
    },
    setMediaSource(source: EditorConfig['mediaSource'] | null): void {
      set(() => ({ mediaSource: source }));
    },
    setEditingGuideId(id: string | null): void {
      set(() => ({ editingGuideId: id }));
    },
  };
}
