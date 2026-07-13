import { getEditorElementRectV1, type ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';

export interface PlacementAnchorV1 {
  readonly x: number;
  readonly y: number;
}

function placementName(elementType: string): string {
  if (elementType === 'ellipse') return 'Ellipse';
  if (elementType === 'group') return 'Group';

  return 'Rectangle';
}

function createPlacedElement(options: {
  readonly elementType: string;
  readonly start: PlacementAnchorV1;
  readonly end: PlacementAnchorV1;
}): projectFormatV1.Element {
  const x = Math.min(options.start.x, options.end.x);
  const y = Math.min(options.start.y, options.end.y);
  const width = Math.max(1, Math.abs(options.end.x - options.start.x));
  const height = Math.max(1, Math.abs(options.end.y - options.start.y));
  const geometry = projectFormatV1.createElementGeometry({
    width,
    height,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, x, y] },
  });
  const id = projectFormatV1.idSchema.parse(crypto.randomUUID());
  const name = placementName(options.elementType);

  if (options.elementType === 'ellipse') {
    return projectFormatV1.createElementV1({
      id,
      geometry,
      kind: 'vector',
      name,
      geometryData: projectFormatV1.createEllipseGeometry(),
    });
  }

  if (options.elementType === 'group') return projectFormatV1.createElementV1({ id, geometry, kind: 'group', name });

  // Tools without an authoring payload start as a schema-valid editable vector placeholder.
  return projectFormatV1.createElementV1({
    id,
    geometry,
    kind: 'vector',
    name,
    geometryData: projectFormatV1.createRectangleGeometry(),
  });
}

function createPlacedPath(point: PlacementAnchorV1): projectFormatV1.Element {
  const elementId = projectFormatV1.idSchema.parse(crypto.randomUUID());
  const pointId = projectFormatV1.idSchema.parse(crypto.randomUUID());

  return projectFormatV1.createElementV1({
    id: elementId,
    name: 'Path',
    geometry: projectFormatV1.createElementGeometry({
      width: 1,
      height: 1,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, point.x, point.y] },
    }),
    kind: 'vector',
    geometryData: {
      kind: 'path',
      fillRule: 'nonzero',
      path: {
        points: [{ id: pointId, x: 0, y: 0 }],
        segments: [{ id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'move', pointId }],
        closed: false,
      },
    },
  });
}

function appendPathPoint(element: projectFormatV1.Element, point: PlacementAnchorV1): projectFormatV1.Element {
  if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return element;

  const rect = getEditorElementRectV1(element);
  const absolutePoints = element.geometryData.path.points.map((candidate) => ({
    id: candidate.id,
    x: rect.x + candidate.x,
    y: rect.y + candidate.y,
  }));
  const minX = Math.min(point.x, ...absolutePoints.map((candidate) => candidate.x));
  const minY = Math.min(point.y, ...absolutePoints.map((candidate) => candidate.y));
  const maxX = Math.max(point.x, ...absolutePoints.map((candidate) => candidate.x));
  const maxY = Math.max(point.y, ...absolutePoints.map((candidate) => candidate.y));
  const pointId = projectFormatV1.idSchema.parse(crypto.randomUUID());

  return {
    ...element,
    geometry: {
      ...element.geometry,
      bounds: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, minX, minY] },
    },
    geometryData: {
      ...element.geometryData,
      path: {
        ...element.geometryData.path,
        points: [
          ...absolutePoints.map((candidate) => ({ id: candidate.id, x: candidate.x - minX, y: candidate.y - minY })),
          { id: pointId, x: point.x - minX, y: point.y - minY },
        ],
        segments: [
          ...element.geometryData.path.segments,
          { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'line', pointId },
        ],
      },
    },
  };
}

export function lastPathPoint(element: projectFormatV1.Element | undefined): PlacementAnchorV1 | undefined {
  if (element?.kind !== 'vector' || element.geometryData.kind !== 'path') return undefined;

  const last = element.geometryData.path.points.at(-1);

  if (last === undefined) return undefined;

  const rect = getEditorElementRectV1(element);

  return { x: rect.x + last.x, y: rect.y + last.y };
}

export function handlePlacementPoint(options: {
  readonly editorStore: ProjectEditorStore;
  readonly placement: NonNullable<ReturnType<ProjectEditorStore['getState']>['placement']>;
  readonly point: PlacementAnchorV1;
  readonly setPathPreview: (point: PlacementAnchorV1 | null) => void;
}): void {
  const { editorStore, placement, point, setPathPreview } = options;

  if (placement.type === 'placement-anchor' && placement.elementType === 'path') {
    const added = editorStore.getState().addElement(createPlacedPath(point));

    if (added !== null) {
      editorStore.getState().startPathDrawing(added);
      setPathPreview(point);
    }

    return;
  }

  if (placement.type === 'placement-anchor' && placement.elementType === 'countdown') {
    editorStore.getState().addElement(
      createPlacedElement({
        elementType: placement.elementType,
        start: point,
        end: { x: point.x + 160, y: point.y + 90 },
      }),
    );
    editorStore.getState().cancelPlacement();

    return;
  }

  if (placement.type === 'placement-anchor' && placement.elementType === 'ellipse') {
    editorStore.getState().updatePlacement({ type: 'placement-ellipse-radius', anchor: point }, point);

    return;
  }

  if (placement.type === 'placement-anchor') {
    editorStore
      .getState()
      .updatePlacement({ type: 'placement-extent', elementType: placement.elementType, anchor: point }, point);

    return;
  }

  if (placement.type === 'placement-extent') {
    if (placement.anchor.x === point.x && placement.anchor.y === point.y) return;

    editorStore
      .getState()
      .addElement(createPlacedElement({ elementType: placement.elementType, start: placement.anchor, end: point }));
    editorStore.getState().cancelPlacement();

    return;
  }

  if (placement.type === 'placement-ellipse-radius') {
    editorStore.getState().updatePlacement(
      {
        type: 'placement-ellipse-rotation',
        anchor: placement.anchor,
        radius: {
          rx: Math.max(1, Math.abs(point.x - placement.anchor.x)),
          ry: Math.max(1, Math.abs(point.y - placement.anchor.y)),
        },
      },
      point,
    );

    return;
  }

  editorStore.getState().addElement(
    createPlacedElement({
      elementType: 'ellipse',
      start: { x: placement.anchor.x - placement.radius.rx, y: placement.anchor.y - placement.radius.ry },
      end: { x: placement.anchor.x + placement.radius.rx, y: placement.anchor.y + placement.radius.ry },
    }),
  );
  editorStore.getState().cancelPlacement();
}

export function handlePathDrawingPoint(options: {
  readonly editorStore: ProjectEditorStore;
  readonly elementId: projectFormatV1.Id;
  readonly point: PlacementAnchorV1;
  readonly setPathPreview: (point: PlacementAnchorV1 | null) => void;
  readonly zoom: number;
}): void {
  const { editorStore, elementId, point, setPathPreview, zoom } = options;
  const state = editorStore.getState();
  const activeDocument = state.project.documents.find((candidate) => candidate.id === state.activeDocumentId);
  const element = activeDocument?.elements.find((candidate) => candidate.id === elementId);
  const last = lastPathPoint(element);

  if (last !== undefined && Math.hypot(last.x - point.x, last.y - point.y) <= 5 / zoom) {
    state.finishPathDrawing();
    setPathPreview(null);

    return;
  }

  state.updateElement(elementId, (candidate) => appendPathPoint(candidate, point));
  setPathPreview(point);
}
