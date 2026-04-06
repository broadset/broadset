export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SnapGuide {
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly priority?: SnapPriority;
}

export interface SnapResult {
  readonly snappedPosition: {
    readonly x: number;
    readonly y: number;
  };
  readonly guides: readonly SnapGuide[];
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const CORNER_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'se', 'sw']);

export const PAGE_CENTER_PRIORITY = 1;
export const PAGE_EDGE_PRIORITY = 2;
export const ELEMENT_CENTER_PRIORITY = 3;
export const ELEMENT_EDGE_PRIORITY = 4;

type SnapPriority =
  | typeof PAGE_CENTER_PRIORITY
  | typeof PAGE_EDGE_PRIORITY
  | typeof ELEMENT_CENTER_PRIORITY
  | typeof ELEMENT_EDGE_PRIORITY;

interface SnapCandidate extends SnapGuide {
  readonly distance: number;
  readonly priority: SnapPriority;
}

function getEdgesAndCenters(rect: Rect, axis: 'x' | 'y'): readonly number[] {
  return axis === 'x' ?
      [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    : [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function findCandidateForAxis(
  dragged: Rect,
  others: readonly Rect[],
  userGuides: readonly SnapGuide[],
  threshold: number,
  axis: 'x' | 'y',
): SnapCandidate | undefined {
  const draggedEdges = getEdgesAndCenters(dragged, axis);
  const candidates: SnapCandidate[] = [];

  for (const other of others) {
    const [otherStart, otherCenter, otherEnd] = getEdgesAndCenters(other, axis);

    if (otherStart === undefined || otherCenter === undefined || otherEnd === undefined) {
      continue;
    }

    for (const draggedEdge of draggedEdges) {
      const centerDistance = Math.abs(draggedEdge - otherCenter);

      if (centerDistance <= threshold) {
        candidates.push({
          axis,
          position: otherCenter,
          distance: centerDistance,
          priority: ELEMENT_CENTER_PRIORITY,
        });
      }

      for (const otherEdge of [otherStart, otherEnd]) {
        const edgeDistance = Math.abs(draggedEdge - otherEdge);

        if (edgeDistance <= threshold) {
          candidates.push({
            axis,
            position: otherEdge,
            distance: edgeDistance,
            priority: ELEMENT_EDGE_PRIORITY,
          });
        }
      }
    }
  }

  for (const guide of userGuides) {
    if (guide.axis !== axis) {
      continue;
    }

    for (const draggedEdge of draggedEdges) {
      const guideDistance = Math.abs(draggedEdge - guide.position);

      if (guideDistance <= threshold) {
        candidates.push({
          axis,
          position: guide.position,
          distance: guideDistance,
          priority: guide.priority ?? PAGE_EDGE_PRIORITY,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((left, right) => left.priority - right.priority || left.distance - right.distance)[0];
}

function snapAlongAxis(
  currentOrigin: number,
  currentRect: Rect,
  candidate: SnapCandidate | undefined,
  axis: 'x' | 'y',
): { readonly nextOrigin: number; readonly guides: readonly SnapGuide[] } {
  if (candidate === undefined) {
    return { nextOrigin: currentOrigin, guides: [] };
  }

  const draggedEdges = getEdgesAndCenters(currentRect, axis);
  const baseOrigin = axis === 'x' ? currentRect.x : currentRect.y;
  let closestOffset = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const draggedEdge of draggedEdges) {
    const edgeDistance = Math.abs(draggedEdge - candidate.position);

    if (edgeDistance < closestDistance) {
      closestDistance = edgeDistance;
      closestOffset = draggedEdge - baseOrigin;
    }
  }

  return {
    nextOrigin: candidate.position - closestOffset,
    guides: [{ axis, position: candidate.position }],
  };
}

/** Converts a screen-space pointer delta into canvas-space movement based on the current zoom. */
export function compensateZoom(screenDelta: number, zoom: number): number {
  return screenDelta / zoom;
}

/** Applies a drag translation to the current element position using zoom-compensated deltas. */
export function applyDragTranslation(
  current: { readonly x: number; readonly y: number },
  delta: { readonly dx: number; readonly dy: number },
  zoom: number,
): { readonly x: number; readonly y: number } {
  return {
    x: current.x + compensateZoom(delta.dx, zoom),
    y: current.y + compensateZoom(delta.dy, zoom),
  };
}

/** Applies a resize delta for one of the eight transform handles. */
export function applyResize(rect: Rect, handle: ResizeHandle, dx: number, dy: number, zoom: number): Rect {
  const compensatedDx = compensateZoom(dx, zoom);
  const compensatedDy = compensateZoom(dy, zoom);
  let { x, y, width, height } = rect;

  if (CORNER_HANDLES.has(handle)) {
    switch (handle) {
      case 'se':
        width += compensatedDx;
        height += compensatedDy;
        break;
      case 'ne':
        width += compensatedDx;
        y += compensatedDy;
        height -= compensatedDy;
        break;
      case 'nw':
        x += compensatedDx;
        width -= compensatedDx;
        y += compensatedDy;
        height -= compensatedDy;
        break;
      case 'sw':
        x += compensatedDx;
        width -= compensatedDx;
        height += compensatedDy;
        break;
    }
  } else {
    switch (handle) {
      case 'e':
        width += compensatedDx;
        break;
      case 'w':
        x += compensatedDx;
        width -= compensatedDx;
        break;
      case 's':
        height += compensatedDy;
        break;
      case 'n':
        y += compensatedDy;
        height -= compensatedDy;
        break;
    }
  }

  return { x, y, width, height };
}

/** Adds a rotation delta in degrees to the current rotation value. */
export function applyRotation(currentDegrees: number, deltaDegrees: number): number {
  return currentDegrees + deltaDegrees;
}

/** Chooses left/right and top/bottom anchors based on the element center relative to the canvas center. */
export function calculateAnchors(
  elementCenter: { readonly x: number; readonly y: number },
  canvasSize: { readonly width: number; readonly height: number },
): { readonly anchorX: 'left' | 'right'; readonly anchorY: 'top' | 'bottom' } {
  return {
    anchorX: elementCenter.x < canvasSize.width / 2 ? 'left' : 'right',
    anchorY: elementCenter.y < canvasSize.height / 2 ? 'top' : 'bottom',
  };
}

/** Returns whether the current element type should show border-radius handles. */
export function isBorderRadiusHandle(elementType: string): boolean {
  return elementType === 'rectangle';
}

/** Finds the nearest snap guides for the dragged rect against other elements and user-created guides. */
export function findSnapGuides(
  dragged: Rect,
  others: readonly Rect[],
  userGuides: readonly SnapGuide[],
  threshold: number,
): SnapResult {
  const xCandidate = findCandidateForAxis(dragged, others, userGuides, threshold, 'x');
  const snappedX = snapAlongAxis(dragged.x, dragged, xCandidate, 'x');
  const yCandidate = findCandidateForAxis(dragged, others, userGuides, threshold, 'y');
  const snappedY = snapAlongAxis(dragged.y, dragged, yCandidate, 'y');

  return {
    snappedPosition: {
      x: snappedX.nextOrigin,
      y: snappedY.nextOrigin,
    },
    guides: [...snappedX.guides, ...snappedY.guides],
  };
}

/** Snaps a free position to the nearest grid intersection when it falls within the configured threshold. */
export function findGridSnap(
  position: { readonly x: number; readonly y: number },
  gridSize: number,
  threshold: number,
): { readonly x: number; readonly y: number } {
  const nearestX = Math.round(position.x / gridSize) * gridSize;
  const nearestY = Math.round(position.y / gridSize) * gridSize;

  return {
    x: Math.abs(position.x - nearestX) <= threshold ? nearestX : position.x,
    y: Math.abs(position.y - nearestY) <= threshold ? nearestY : position.y,
  };
}
