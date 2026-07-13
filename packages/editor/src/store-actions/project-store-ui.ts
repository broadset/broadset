import {
  type CanvasSettings,
  createDefaultCanvasSettings,
  createDefaultGridSettings,
  type EditorConfig,
  type GridSettings,
  type Guide,
} from '@broadset/model';

const PALETTE_STORAGE_KEY = 'broadset:palette';

export interface ProjectEditorUiState {
  readonly canvasSettings: CanvasSettings;
  readonly gridSettings: GridSettings;
  readonly savedPalette: readonly string[];
  readonly availableFonts: readonly string[];
  readonly mediaSource: EditorConfig['mediaSource'] | null;
  readonly editingGuideId: string | null;
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
    if (typeof window === 'undefined') return [];

    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);

    if (stored === null) return [];

    const parsed: unknown = JSON.parse(stored);

    return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function persistPalette(palette: readonly string[]): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
  } catch {
    // Palette persistence is optional in restricted or embedded hosts.
  }
}

export function createProjectEditorUiState(
  set: (updater: (state: ProjectEditorUiState) => Partial<ProjectEditorUiState>) => void,
  config?: Partial<EditorConfig>,
): ProjectEditorUiState {
  const gridSettings: GridSettings = {
    ...createDefaultGridSettings(),
    ...(config?.gridDefaults ?? {}),
  };
  const fallbackFontFamilies = ['Arial', 'Courier New', 'Times New Roman', 'Georgia'];
  const availableFonts =
    config?.allowedFonts !== undefined && config.allowedFonts.length > 0
      ? config.allowedFonts.map((font) => font.family)
      : fallbackFontFamilies;

  return {
    canvasSettings: { ...createDefaultCanvasSettings(), grid: gridSettings },
    gridSettings,
    savedPalette: loadPalette(),
    availableFonts,
    mediaSource: config?.mediaSource ?? null,
    editingGuideId: null,
    updateCanvasSettings(partial: Partial<CanvasSettings>): void {
      set((state) => ({ canvasSettings: { ...state.canvasSettings, ...partial } }));
    },
    updateGridSettings(partial: Partial<GridSettings>): void {
      set((state) => {
        const nextGridSettings = { ...state.gridSettings, ...partial };

        return {
          gridSettings: nextGridSettings,
          canvasSettings: { ...state.canvasSettings, grid: nextGridSettings },
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
      set((state) => ({ canvasSettings: { ...state.canvasSettings, originX: 0, originY: 0 } }));
    },
    addPaletteColor(color: string): void {
      set((state) => {
        const normalized = color.trim();

        if (normalized === '' || state.savedPalette.includes(normalized)) return {};

        const savedPalette = [...state.savedPalette, normalized];

        persistPalette(savedPalette);

        return { savedPalette };
      });
    },
    removePaletteColor(index: number): void {
      set((state) => {
        if (index < 0 || index >= state.savedPalette.length) return {};

        const savedPalette = state.savedPalette.filter((_, paletteIndex) => paletteIndex !== index);

        persistPalette(savedPalette);

        return { savedPalette };
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
