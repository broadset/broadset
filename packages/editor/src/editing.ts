import { createDefaultElement, type EditorConfig, editorConfigSchema, getCapabilityProfile } from '@broadset/model';

import { type ElementDefaults, getElementDefaults, type PluginDefaults } from './element-defaults';
import type { EditorStore } from './store-actions';

const COORDINATE_PRECISION = 2;

function roundCoordinate(value: number): number {
  const precisionFactor = 10 ** COORDINATE_PRECISION;

  return Math.round(value * precisionFactor) / precisionFactor;
}

export { getElementDefaults };
export type { ElementDefaults, PluginDefaults };

export function startPlacement(store: EditorStore, elementType: string): void {
  store.setState({
    pendingPlacementType: elementType,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'placement', elementType },
  });
}

export function cancelPlacement(store: EditorStore): void {
  store.setState({
    pendingPlacementType: null,
    editingMode: { type: 'none' },
  });
}

export function placeElement(
  store: EditorStore,
  x: number,
  y: number,
  width?: number,
  height?: number,
  plugins: readonly PluginDefaults[] = [],
): string | null {
  const state = store.getState();
  const elementType = state.pendingPlacementType;

  if (elementType === null) {
    return null;
  }

  const defaults = getElementDefaults(elementType, plugins);
  const resolvedWidth = width ?? defaults.width;
  const resolvedHeight = height ?? defaults.height;
  const isCenterPlacement = width === undefined && height === undefined;
  const position =
    isCenterPlacement ?
      {
        x: roundCoordinate(x - resolvedWidth / 2),
        y: roundCoordinate(y - resolvedHeight / 2),
      }
    : {
        x: roundCoordinate(x),
        y: roundCoordinate(y),
      };

  const newElement = createDefaultElement(elementType, {
    position,
    width: resolvedWidth,
    height: resolvedHeight,
    content: defaults.content,
  });
  const entersPathDrawing = elementType === 'path';

  store.setState({
    document: {
      ...state.document,
      elements: [...state.document.elements, newElement],
    },
    activeElementIds: [newElement.id],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: entersPathDrawing ? newElement.id : null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: entersPathDrawing ? { type: 'path-drawing', elementId: newElement.id } : { type: 'none' },
  });

  return newElement.id;
}

export function startPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: elementId,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-editing', elementId },
  });
}

export function stopPathEditing(store: EditorStore): void {
  const state = store.getState();

  store.setState({
    pathEditingElementId: null,
    editingMode:
      state.pendingPlacementType !== null ? { type: 'placement', elementType: state.pendingPlacementType }
      : state.pathDrawingElementId !== null ? { type: 'path-drawing', elementId: state.pathDrawingElementId }
      : { type: 'none' },
  });
}

export function startPathDrawing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: elementId,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-drawing', elementId },
  });
}

export function stopPathDrawing(store: EditorStore): void {
  const state = store.getState();

  store.setState({
    pathDrawingElementId: null,
    editingMode:
      state.pendingPlacementType !== null ? { type: 'placement', elementType: state.pendingPlacementType }
      : state.pathEditingElementId !== null ? { type: 'path-editing', elementId: state.pathEditingElementId }
      : { type: 'none' },
  });
}

/**
 * Close the drawing path by appending Z and exit drawing mode (Enter behavior).
 */
export function closeAndStopPathDrawing(store: EditorStore): void {
  const state = store.getState();
  const drawingElementId = state.pathDrawingElementId;

  if (drawingElementId !== null) {
    const element = state.document.elements.find((candidate) => candidate.id === drawingElementId);

    if (element !== undefined && element.content.length > 0) {
      store.setState({
        document: {
          ...state.document,
          elements: state.document.elements.map((candidate) =>
            candidate.id === drawingElementId ? { ...candidate, content: `${candidate.content} Z` } : candidate,
          ),
        },
      });
    }
  }

  stopPathDrawing(store);
}

/**
 * Commit the current drawing path as-is and exit drawing mode (Escape behavior).
 */
export function commitAndStopPathDrawing(store: EditorStore): void {
  stopPathDrawing(store);
}

/* ================================================================== */
/*  Clip-path editing                                                 */
/* ================================================================== */

const DEFAULT_CLIP_PATH = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
const MIN_CLIP_PATH_POINTS = 3;

/** Regex that extracts individual points from a CSS `polygon(...)` value. */
const POLYGON_POINT_PATTERN = /(-?\d+(?:\.\d+)?%?)\s+(-?\d+(?:\.\d+)?%?)/g;

/**
 * Parse a CSS polygon() value into an array of `{ x, y }` numeric percentage values.
 * Returns null if the value is not a polygon.
 */
function parsePolygonPoints(clipPath: string): { readonly x: number; readonly y: number }[] | null {
  const polygonMatch = /^polygon\(([^)]*)\)$/i.exec(clipPath.trim());

  if (polygonMatch === null || polygonMatch[1] === undefined) {
    return null;
  }

  const body = polygonMatch[1];
  const points: { readonly x: number; readonly y: number }[] = [];

  for (const match of body.matchAll(POLYGON_POINT_PATTERN)) {
    const xStr = match[1];
    const yStr = match[2];

    if (xStr !== undefined && yStr !== undefined) {
      points.push({
        x: Number.parseFloat(xStr.replace('%', '')),
        y: Number.parseFloat(yStr.replace('%', '')),
      });
    }
  }

  return points;
}

/** Serialize an array of point objects back into a CSS polygon() string. */
function serializePolygon(points: ReadonlyArray<{ readonly x: number; readonly y: number }>): string {
  const pointStrings = points.map((point) => `${String(point.x)}% ${String(point.y)}%`);

  return `polygon(${pointStrings.join(', ')})`;
}

/**
 * Enter clip-path editing mode for the given element.
 * Seeds a default rectangular polygon if customClipPath is empty.
 * No-op if the element lacks the clipPath capability.
 */
export function startClipPathEditing(store: EditorStore, elementId: string): void {
  const state = store.getState();
  const element = state.document.elements.find((candidate) => candidate.id === elementId);

  if (element === undefined) {
    return;
  }

  const capabilities = getCapabilityProfile(element.type);

  if (!capabilities.clipPath) {
    return;
  }

  const needsSeeding = (element.style.customClipPath ?? '') === '';
  const nextDocument =
    needsSeeding ?
      {
        ...state.document,
        elements: state.document.elements.map((candidate) =>
          candidate.id === elementId ?
            {
              ...candidate,
              style: {
                ...candidate.style,
                customClipPath: DEFAULT_CLIP_PATH,
                maskType: 'custom' as const,
              },
            }
          : candidate,
        ),
      }
    : state.document;

  store.setState({
    document: nextDocument,
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: elementId,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'clip-path-editing', elementId },
  });
}

/**
 * Exit clip-path editing mode and clear the tracking ID.
 */
export function stopClipPathEditing(store: EditorStore): void {
  store.setState({
    clipPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}

/**
 * Update the coordinates of a clip-path control point at the given index.
 * Coordinates are element-relative percentages.
 * No-op when not in clip-path editing mode.
 */
export function updateClipPathPoint(store: EditorStore, index: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.map((point, idx) => (idx === index ? { x, y } : point));

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

/**
 * Insert a new point after the given index in the clip-path polygon.
 * No-op when not in clip-path editing mode.
 */
export function insertClipPathPoint(store: EditorStore, afterIndex: number, x: number, y: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || afterIndex < 0 || afterIndex >= points.length) {
    return;
  }

  const updated = [...points.slice(0, afterIndex + 1), { x, y }, ...points.slice(afterIndex + 1)];

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

/**
 * Remove the point at the given index from the clip-path polygon.
 * Rejected if the polygon has 3 or fewer points (minimum enforced).
 * No-op when not in clip-path editing mode.
 */
export function deleteClipPathPoint(store: EditorStore, index: number): void {
  const state = store.getState();
  const editingElementId = state.clipPathEditingElementId;

  if (editingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === editingElementId);

  if (element === undefined) {
    return;
  }

  const points = parsePolygonPoints(element.style.customClipPath ?? '');

  if (points === null || points.length <= MIN_CLIP_PATH_POINTS || index < 0 || index >= points.length) {
    return;
  }

  const updated = points.filter((_, idx) => idx !== index);

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === editingElementId ?
          {
            ...candidate,
            style: {
              ...candidate.style,
              customClipPath: serializePolygon(updated),
            },
          }
        : candidate,
      ),
    },
  });
}

export function appendPathPoint(store: EditorStore, canvasX: number, canvasY: number): void {
  const state = store.getState();
  const drawingElementId = state.pathDrawingElementId;

  if (drawingElementId === null) {
    return;
  }

  const element = state.document.elements.find((candidate) => candidate.id === drawingElementId);

  if (element === undefined) {
    return;
  }

  const strokeWidth = element.style.strokeWidth ?? 1;
  const padding = strokeWidth / 2;
  const pointExpression = /([ML])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  const existingPoints = Array.from(element.content.matchAll(pointExpression), (match) => ({
    x: element.position.x + Number.parseFloat(match[2] ?? '0'),
    y: element.position.y + Number.parseFloat(match[3] ?? '0'),
  }));
  const nextPoints = [...existingPoints, { x: canvasX, y: canvasY }];

  const minX = Math.min(...nextPoints.map((point) => point.x)) - padding;
  const minY = Math.min(...nextPoints.map((point) => point.y)) - padding;
  const maxX = Math.max(...nextPoints.map((point) => point.x)) + padding;
  const maxY = Math.max(...nextPoints.map((point) => point.y)) + padding;

  const nextContent = nextPoints
    .map((point, index) => {
      const relativeX = roundCoordinate(point.x - minX);
      const relativeY = roundCoordinate(point.y - minY);

      return `${index === 0 ? 'M' : 'L'}${String(relativeX)},${String(relativeY)}`;
    })
    .join(' ');

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === drawingElementId ?
          {
            ...candidate,
            position: {
              x: roundCoordinate(minX),
              y: roundCoordinate(minY),
            },
            width: roundCoordinate(maxX - minX),
            height: roundCoordinate(maxY - minY),
            content: nextContent,
          }
        : candidate,
      ),
    },
  });
}

export function validateEditorConfig(config: unknown): EditorConfig {
  return editorConfigSchema.parse(config);
}

/**
 * Enter motion path editing mode for the given element.
 * Selects the element and clears all other overlay modes.
 */
export function startMotionPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    pendingPlacementType: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: elementId,
    inlineTextEditingElementId: null,
    editingMode: { type: 'motion-path-editing', elementId },
  });
}

/**
 * Exit motion path editing mode and clear the tracking ID.
 */
export function stopMotionPathEditing(store: EditorStore): void {
  store.setState({
    motionPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}
