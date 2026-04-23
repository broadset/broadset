import {
  type BroadsetElement,
  type BroadsetElementStyleInput,
  createDefaultElement,
  type EditorConfig,
  editorConfigSchema,
  type PageElementInstance,
} from '@broadset/model';

import { getElementDefaults, type PluginDefaults } from '../element-defaults';
import type { EditingMode, EditorStore, PlacementPoint, PlacementState } from '../store-actions';
import {
  isSamePlacementPoint,
  resolveCornerBounds,
  resolveEllipseBounds,
  resolvePlacementMode,
  resolvePluginSingleClickBounds,
} from './placement-bounds';

const COORDINATE_PRECISION = 2;

function roundCoordinate(value: number): number {
  const precisionFactor = 10 ** COORDINATE_PRECISION;

  return Math.round(value * precisionFactor) / precisionFactor;
}

function clearEditingModeState(placement: PlacementState | null): {
  readonly placement: PlacementState | null;
  readonly placementPreview: { readonly x: number; readonly y: number } | null;
  readonly pathEditingElementId: null;
  readonly pathDrawingElementId: null;
  readonly clipPathEditingElementId: null;
  readonly motionPathEditingElementId: null;
  readonly inlineTextEditingElementId: null;
  readonly editingMode: EditingMode;
} {
  return {
    placement,
    placementPreview: null,
    pathEditingElementId: null,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: placement ?? { type: 'none' },
  };
}

export function beginPlacement(store: EditorStore, elementType: string): void {
  const placement: PlacementState = { type: 'placement-anchor', elementType };

  store.setState(clearEditingModeState(placement));
}

export function cancelPlacement(store: EditorStore): void {
  store.setState(clearEditingModeState(null));
}

export function updatePlacementPreview(store: EditorStore, x: number, y: number): void {
  const state = store.getState();

  if (state.placement === null && state.pathDrawingElementId === null) {
    return;
  }

  store.setState({
    placementPreview: { x: roundCoordinate(x), y: roundCoordinate(y) },
  });
}

function createRootPageInstance(element: BroadsetElement): PageElementInstance {
  return {
    elementId: element.id,
    transform: {
      position: { x: element.position.x, y: element.position.y, z: 0 },
      rotation: { x: 0, y: 0, z: element.rotation },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

interface CreateElementOptions {
  readonly elementType: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly name?: string;
  readonly content?: string;
  readonly style?: Partial<BroadsetElementStyleInput>;
}

function insertElement(store: EditorStore, options: CreateElementOptions): { readonly elementId: string } {
  const state = store.getState();
  const newElement = createDefaultElement(options.elementType, {
    position: options.position,
    width: options.width,
    height: options.height,
    rotation: options.rotation ?? 0,
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.content === undefined ? {} : { content: options.content }),
    ...(options.style === undefined ? {} : { style: options.style }),
  });
  const newInstance = createRootPageInstance(newElement);

  store.setState({
    document: {
      ...state.document,
      elements: [...state.document.elements, newElement],
      pages: state.document.pages.map((page, pageIndex) =>
        pageIndex === state.activePageIndex ? { ...page, elements: [...page.elements, newInstance] } : page,
      ),
    },
  });

  return { elementId: newElement.id };
}

export function setPlacementAnchor(
  store: EditorStore,
  x: number,
  y: number,
  plugins: readonly PluginDefaults[] = [],
): string | null {
  const placement = store.getState().placement;

  if (placement?.type !== 'placement-anchor') {
    return null;
  }

  const anchor: PlacementPoint = { x: roundCoordinate(x), y: roundCoordinate(y) };
  const mode = resolvePlacementMode(placement.elementType, plugins);

  if (mode === 'path') {
    const pathDefaults = getElementDefaults('path', plugins);
    const { elementId } = insertElement(store, {
      elementType: 'path',
      position: anchor,
      width: 0,
      height: 0,
      content: 'M0,0',
      name: pathDefaults.name,
      style: pathDefaults.style,
    });

    store.setState({
      placement: null,
      placementPreview: null,
      activeElementIds: [elementId],
      pathEditingElementId: null,
      pathDrawingElementId: elementId,
      clipPathEditingElementId: null,
      motionPathEditingElementId: null,
      inlineTextEditingElementId: null,
      editingMode: { type: 'path-drawing', elementId },
    });

    return elementId;
  }

  if (mode === 'plugin-single-click') {
    const defaults = getElementDefaults(placement.elementType, plugins);
    const bounds = resolvePluginSingleClickBounds(anchor, defaults.width, defaults.height);
    const { elementId } = insertElement(store, {
      elementType: placement.elementType,
      position: bounds.position,
      width: bounds.width,
      height: bounds.height,
      name: defaults.name,
      content: defaults.content,
      style: defaults.style,
    });

    store.setState({
      ...clearEditingModeState(null),
      activeElementIds: [elementId],
    });

    return elementId;
  }

  if (mode === 'ellipse') {
    store.setState({
      placement: { type: 'placement-ellipse-radius', anchor },
      editingMode: { type: 'placement-ellipse-radius', anchor },
    });

    return null;
  }

  store.setState({
    placement: { type: 'placement-extent', elementType: placement.elementType, anchor },
    editingMode: { type: 'placement-extent', elementType: placement.elementType, anchor },
  });

  return null;
}

export function commitPlacementExtent(store: EditorStore, x: number, y: number): string | null {
  const placement = store.getState().placement;

  if (placement?.type !== 'placement-extent') {
    return null;
  }

  const extent: PlacementPoint = { x: roundCoordinate(x), y: roundCoordinate(y) };

  if (isSamePlacementPoint(placement.anchor, extent)) {
    return null;
  }

  const bounds = resolveCornerBounds(placement.anchor, extent);
  const defaults = getElementDefaults(placement.elementType);
  const { elementId } = insertElement(store, {
    elementType: placement.elementType,
    position: bounds.position,
    width: bounds.width,
    height: bounds.height,
    name: defaults.name,
    content: defaults.content,
    style: defaults.style,
  });

  store.setState({
    ...clearEditingModeState(null),
    activeElementIds: [elementId],
  });

  return elementId;
}

export function setEllipseRadius(store: EditorStore, x: number, y: number): boolean {
  const placement = store.getState().placement;

  if (placement?.type !== 'placement-ellipse-radius') {
    return false;
  }

  const radiusPoint: PlacementPoint = { x: roundCoordinate(x), y: roundCoordinate(y) };

  if (isSamePlacementPoint(placement.anchor, radiusPoint)) {
    return false;
  }

  const rx = Math.abs(radiusPoint.x - placement.anchor.x);
  const ry = Math.abs(radiusPoint.y - placement.anchor.y);

  store.setState({
    placement: {
      type: 'placement-ellipse-rotation',
      anchor: placement.anchor,
      radius: { rx, ry },
    },
    editingMode: {
      type: 'placement-ellipse-rotation',
      anchor: placement.anchor,
      radius: { rx, ry },
    },
  });

  return true;
}

export function commitEllipseRotation(store: EditorStore, x: number, y: number): string | null {
  const placement = store.getState().placement;

  if (placement?.type !== 'placement-ellipse-rotation') {
    return null;
  }

  const rotationPoint: PlacementPoint = { x: roundCoordinate(x), y: roundCoordinate(y) };

  if (isSamePlacementPoint(placement.anchor, rotationPoint)) {
    return null;
  }

  const extentPoint: PlacementPoint = {
    x: placement.anchor.x + placement.radius.rx,
    y: placement.anchor.y + placement.radius.ry,
  };
  const bounds = resolveEllipseBounds(placement.anchor, extentPoint, rotationPoint);
  const defaults = getElementDefaults('ellipse');
  const { elementId } = insertElement(store, {
    elementType: 'ellipse',
    position: bounds.position,
    width: bounds.width,
    height: bounds.height,
    rotation: bounds.rotation,
    name: defaults.name,
    content: defaults.content,
    style: defaults.style,
  });

  store.setState({
    ...clearEditingModeState(null),
    activeElementIds: [elementId],
  });

  return elementId;
}

export function startPathEditing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    placement: null,
    placementPreview: null,
    pathEditingElementId: elementId,
    pathDrawingElementId: null,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-editing', elementId },
  });
}

function resolveEditingMode(
  state: ReturnType<EditorStore['getState']>,
  options: { readonly excludeDrawing?: boolean; readonly excludeEditing?: boolean },
): EditingMode {
  if (state.placement !== null) return state.placement;
  if (!options.excludeDrawing && state.pathDrawingElementId !== null)
    return { type: 'path-drawing', elementId: state.pathDrawingElementId };
  if (!options.excludeEditing && state.pathEditingElementId !== null)
    return { type: 'path-editing', elementId: state.pathEditingElementId };

  return { type: 'none' };
}

export function stopPathEditing(store: EditorStore): void {
  store.setState({
    pathEditingElementId: null,
    editingMode: resolveEditingMode(store.getState(), { excludeEditing: true }),
  });
}

export function startPathDrawing(store: EditorStore, elementId: string): void {
  store.setState({
    activeElementIds: [elementId],
    placement: null,
    placementPreview: null,
    pathEditingElementId: null,
    pathDrawingElementId: elementId,
    clipPathEditingElementId: null,
    motionPathEditingElementId: null,
    inlineTextEditingElementId: null,
    editingMode: { type: 'path-drawing', elementId },
  });
}

export function stopPathDrawing(store: EditorStore): void {
  store.setState({
    pathDrawingElementId: null,
    placementPreview: null,
    editingMode: resolveEditingMode(store.getState(), { excludeDrawing: true }),
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

  // Clicking the last-placed vertex again commits the path and exits drawing
  // mode. The user is signalling "done" — any click within a few doc units of
  // the last vertex counts (mouse jitter / anti-aliased pixels would otherwise
  // prevent the commit).
  const lastPoint = existingPoints.at(-1);
  const commitDistanceDoc = 3;

  if (lastPoint !== undefined) {
    const deltaX = lastPoint.x - canvasX;
    const deltaY = lastPoint.y - canvasY;

    if (Math.hypot(deltaX, deltaY) <= commitDistanceDoc) {
      commitAndStopPathDrawing(store);

      return;
    }
  }

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

  const nextPositionX = roundCoordinate(minX);
  const nextPositionY = roundCoordinate(minY);

  store.setState({
    document: {
      ...state.document,
      elements: state.document.elements.map((candidate) =>
        candidate.id === drawingElementId ?
          {
            ...candidate,
            position: { x: nextPositionX, y: nextPositionY },
            width: roundCoordinate(maxX - minX),
            height: roundCoordinate(maxY - minY),
            content: nextContent,
          }
        : candidate,
      ),
      // The renderer reads each element's rendered position from the active
      // page instance's transform, NOT from `element.position`. Updating the
      // element alone leaves the page instance pinned at its original click
      // coord, so the re-anchored bbox never moves on screen and subsequent
      // points drift by the element's position delta. Keep the instance in
      // sync with the element.
      pages: state.document.pages.map((page, pageIndex) =>
        pageIndex !== state.activePageIndex ? page : (
          {
            ...page,
            elements: page.elements.map((instance) =>
              instance.elementId !== drawingElementId ? instance : (
                {
                  ...instance,
                  transform: {
                    ...instance.transform,
                    position: {
                      x: nextPositionX,
                      y: nextPositionY,
                      z: instance.transform.position.z,
                    },
                  },
                }
              ),
            ),
          }
        ),
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
    placement: null,
    placementPreview: null,
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
