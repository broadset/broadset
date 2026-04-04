import type { EditorConfig, ElementPosition } from '@broadset/model';
import { createDefaultElement, editorConfigSchema } from '@broadset/model';

import type { EditorStore } from './store-actions';

// ---------------------------------------------------------------------------
// Element Factory Defaults
// ---------------------------------------------------------------------------

export interface ElementDefaults {
  readonly width: number;
  readonly height: number;
  readonly content: string;
}

const BUILT_IN_DEFAULTS: Readonly<Record<string, ElementDefaults>> = {
  text: { width: 80, height: 20, content: 'New Text' },
  image: { width: 60, height: 60, content: '' },
  svg: { width: 60, height: 60, content: '' },
  path: { width: 80, height: 50, content: '' },
  rectangle: { width: 80, height: 50, content: '' },
  ellipse: { width: 50, height: 50, content: '' },
  qrcode: { width: 40, height: 40, content: 'https://example.com' },
  group: { width: 120, height: 80, content: '' },
};

const SYSTEM_FALLBACK: ElementDefaults = {
  width: 80,
  height: 50,
  content: '',
};

export interface PluginDefaults {
  readonly type: string;
  readonly defaults?: {
    readonly width?: number;
    readonly height?: number;
    readonly content?: string;
  };
}

export function getElementDefaults(type: string, plugins?: readonly PluginDefaults[]): ElementDefaults {
  if (plugins) {
    const plugin = plugins.find((p) => p.type === type);

    if (plugin?.defaults) {
      return {
        width: plugin.defaults.width ?? SYSTEM_FALLBACK.width,
        height: plugin.defaults.height ?? SYSTEM_FALLBACK.height,
        content: plugin.defaults.content ?? SYSTEM_FALLBACK.content,
      };
    }

    if (plugin) {
      return SYSTEM_FALLBACK;
    }
  }

  return BUILT_IN_DEFAULTS[type] ?? SYSTEM_FALLBACK;
}

// ---------------------------------------------------------------------------
// Placement Mode
// ---------------------------------------------------------------------------

export function startPlacement(store: EditorStore, elementType: string): void {
  store.setState({
    editingMode: { type: 'placement' as const, elementType },
  });
}

export function cancelPlacement(store: EditorStore): void {
  store.setState({
    editingMode: { type: 'none' as const },
  });
}

export function placeElement(
  store: EditorStore,
  x: number,
  y: number,
  width?: number,
  height?: number,
  plugins?: readonly PluginDefaults[],
): string | null {
  const state = store.getState();

  if (state.editingMode.type !== 'placement') return null;

  const elementType = state.editingMode.elementType;
  const defaults = getElementDefaults(elementType, plugins);
  const w = width ?? defaults.width;
  const h = height ?? defaults.height;

  const position: ElementPosition = {
    x: x - w / 2,
    y: y - h / 2,
  };

  const newElement = createDefaultElement(elementType, {
    position,
    width: w,
    height: h,
    content: defaults.content,
  });

  const page = state.document.pages[state.activePageIndex];

  if (!page) return null;

  const isPath = elementType === 'path';

  store.setState({
    document: {
      ...state.document,
      pages: state.document.pages.map((p, i) =>
        i === state.activePageIndex ? { ...p, elements: [...p.elements, newElement] } : p,
      ),
    },
    activeElementIds: [newElement.id],
    editingMode: isPath ? { type: 'path-drawing' as const, elementId: newElement.id } : { type: 'none' as const },
  });

  return newElement.id;
}

// ---------------------------------------------------------------------------
// Path Editing Mode
// ---------------------------------------------------------------------------

export function startPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    editingMode: { type: 'path-editing' as const, elementId },
    activeElementIds: [elementId],
  });
}

export function stopPathEditing(store: EditorStore): void {
  store.setState({
    editingMode: { type: 'none' as const },
  });
}

// ---------------------------------------------------------------------------
// Path Drawing Mode
// ---------------------------------------------------------------------------

export function startPathDrawing(store: EditorStore, elementId: string): void {
  store.setState({
    editingMode: { type: 'path-drawing' as const, elementId },
    activeElementIds: [elementId],
  });
}

export function stopPathDrawing(store: EditorStore): void {
  store.setState({
    editingMode: { type: 'none' as const },
  });
}

// ---------------------------------------------------------------------------
// Path Point Appending
// ---------------------------------------------------------------------------

const COORD_PRECISION = 2;

function roundCoord(n: number): number {
  const factor = 10 ** COORD_PRECISION;

  return Math.round(n * factor) / factor;
}

export function appendPathPoint(store: EditorStore, canvasX: number, canvasY: number): void {
  const state = store.getState();

  if (state.editingMode.type !== 'path-drawing') return;

  const elementId = state.editingMode.elementId;
  const page = state.document.pages[state.activePageIndex];

  if (!page) return;

  const elementIndex = page.elements.findIndex((e) => e.id === elementId);

  if (elementIndex === -1) return;

  const element = page.elements[elementIndex];

  if (!element) return;

  const existingContent = element.content;
  const strokeWidth = element.style.strokeWidth ?? 1;
  const padding = strokeWidth / 2;

  // Parse existing points to compute bounding box
  const pointRe = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  const existingPoints: Array<{ x: number; y: number }> = [];

  for (const m of existingContent.matchAll(pointRe)) {
    const px = parseFloat(m[2] ?? '0');
    const py = parseFloat(m[3] ?? '0');

    existingPoints.push({
      x: element.position.x + px,
      y: element.position.y + py,
    });
  }

  // Add the new point in canvas coordinates
  const allPoints = [...existingPoints, { x: canvasX, y: canvasY }];

  // Compute bounding box with stroke padding
  const minX = Math.min(...allPoints.map((p) => p.x)) - padding;
  const minY = Math.min(...allPoints.map((p) => p.y)) - padding;
  const maxX = Math.max(...allPoints.map((p) => p.x)) + padding;
  const maxY = Math.max(...allPoints.map((p) => p.y)) + padding;

  const newWidth = roundCoord(maxX - minX);
  const newHeight = roundCoord(maxY - minY);

  // Build path data with coordinates relative to the new bounding box origin
  const pathCommands = allPoints.map((p, i) => {
    const relX = roundCoord(p.x - minX);
    const relY = roundCoord(p.y - minY);

    return i === 0 ? `M${String(relX)},${String(relY)}` : `L${String(relX)},${String(relY)}`;
  });

  const newContent = pathCommands.join(' ');

  const updatedElement = {
    ...element,
    position: { x: roundCoord(minX), y: roundCoord(minY) },
    width: newWidth,
    height: newHeight,
    content: newContent,
  };

  const updatedElements = page.elements.map((e, idx) => (idx === elementIndex ? updatedElement : e));

  store.setState({
    document: {
      ...state.document,
      pages: state.document.pages.map((p, i) =>
        i === state.activePageIndex ? { ...p, elements: updatedElements } : p,
      ),
    },
  });
}

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------

export function validateEditorConfig(config: unknown): EditorConfig {
  return editorConfigSchema.parse(config);
}
