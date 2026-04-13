import { createDefaultElement, type EditorConfig, editorConfigSchema } from '@broadset/model';

import { getElementDefaults, type PluginDefaults } from '../element-defaults';
import type { EditorStore } from '../store-actions';

const COORDINATE_PRECISION = 2;

function roundCoordinate(value: number): number {
  const precisionFactor = 10 ** COORDINATE_PRECISION;

  return Math.round(value * precisionFactor) / precisionFactor;
}

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

export function commitAndStopPathDrawing(store: EditorStore): void {
  stopPathDrawing(store);
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

export function stopMotionPathEditing(store: EditorStore): void {
  store.setState({
    motionPathEditingElementId: null,
    editingMode: { type: 'none' },
  });
}
