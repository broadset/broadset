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

function pushIfWithinThreshold(
  candidates: SnapCandidate[],
  axis: 'x' | 'y',
  draggedEdge: number,
  targetPosition: number,
  threshold: number,
  priority: SnapPriority,
): void {
  const distance = Math.abs(draggedEdge - targetPosition);

  if (distance <= threshold) {
    candidates.push({ axis, position: targetPosition, distance, priority });
  }
}

function collectElementCandidates(
  draggedEdges: readonly number[],
  others: readonly Rect[],
  threshold: number,
  axis: 'x' | 'y',
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  for (const other of others) {
    const [otherStart, otherCenter, otherEnd] = getEdgesAndCenters(other, axis);

    if (otherStart === undefined || otherCenter === undefined || otherEnd === undefined) continue;

    for (const draggedEdge of draggedEdges) {
      pushIfWithinThreshold(candidates, axis, draggedEdge, otherCenter, threshold, ELEMENT_CENTER_PRIORITY);
      pushIfWithinThreshold(candidates, axis, draggedEdge, otherStart, threshold, ELEMENT_EDGE_PRIORITY);
      pushIfWithinThreshold(candidates, axis, draggedEdge, otherEnd, threshold, ELEMENT_EDGE_PRIORITY);
    }
  }

  return candidates;
}

function collectGuideCandidates(
  draggedEdges: readonly number[],
  userGuides: readonly SnapGuide[],
  threshold: number,
  axis: 'x' | 'y',
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  for (const guide of userGuides) {
    if (guide.axis !== axis) continue;

    const priority: SnapPriority = guide.priority ?? PAGE_EDGE_PRIORITY;

    for (const draggedEdge of draggedEdges) {
      pushIfWithinThreshold(candidates, axis, draggedEdge, guide.position, threshold, priority);
    }
  }

  return candidates;
}

function findCandidateForAxis(
  dragged: Rect,
  others: readonly Rect[],
  userGuides: readonly SnapGuide[],
  threshold: number,
  axis: 'x' | 'y',
): SnapCandidate | undefined {
  const draggedEdges = getEdgesAndCenters(dragged, axis);
  const candidates = [
    ...collectElementCandidates(draggedEdges, others, threshold, axis),
    ...collectGuideCandidates(draggedEdges, userGuides, threshold, axis),
  ];

  if (candidates.length === 0) return undefined;

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

/**
 * Projects a screen-space pointer delta into the element's local coordinate
 * system by rotating it by the negative of the element's rotation angle.
 */
function projectToLocal(
  screenDx: number,
  screenDy: number,
  rotationDeg: number,
): { readonly localDx: number; readonly localDy: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    localDx: screenDx * cos + screenDy * sin,
    localDy: -screenDx * sin + screenDy * cos,
  };
}

/**
 * Returns the local-space offset from the element center to the anchor point
 * (the opposite edge/corner) for a given resize handle.
 *
 * The anchor is the point that must stay fixed in screen space during resize.
 */
function anchorOffset(
  handle: ResizeHandle,
  width: number,
  height: number,
): { readonly ax: number; readonly ay: number } {
  switch (handle) {
    case 'e':
      return { ax: -width / 2, ay: 0 };
    case 'w':
      return { ax: width / 2, ay: 0 };
    case 'n':
      return { ax: 0, ay: height / 2 };
    case 's':
      return { ax: 0, ay: -height / 2 };
    case 'se':
      return { ax: -width / 2, ay: -height / 2 };
    case 'nw':
      return { ax: width / 2, ay: height / 2 };
    case 'ne':
      return { ax: -width / 2, ay: height / 2 };
    case 'sw':
      return { ax: width / 2, ay: -height / 2 };
  }
}

/**
 * Applies a resize delta for one of the eight transform handles.
 *
 * When `rotationDeg` is non-zero, screen-space pointer deltas are projected
 * onto the element's local axes so that edge handles only scale along their
 * intended axis. The position is then adjusted to keep the **opposite
 * handle/edge fixed in screen space** (anchor point preservation), which
 * compensates for the CSS `transform-origin: center center` rotation pivot
 * shifting when width/height changes.
 */
export function applyResize(
  rect: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  zoom: number,
  rotationDeg = 0,
  minSize = 0,
): Rect {
  const compensatedDx = compensateZoom(dx, zoom);
  const compensatedDy = compensateZoom(dy, zoom);

  // Project screen-space movement into the element's local coordinate system.
  const { localDx, localDy } = projectToLocal(compensatedDx, compensatedDy, rotationDeg);

  // Compute width/height changes from local-space deltas.
  let dWidth = 0;
  let dHeight = 0;

  if (CORNER_HANDLES.has(handle)) {
    switch (handle) {
      case 'se':
        dWidth = localDx;
        dHeight = localDy;
        break;
      case 'ne':
        dWidth = localDx;
        dHeight = -localDy;
        break;
      case 'nw':
        dWidth = -localDx;
        dHeight = -localDy;
        break;
      case 'sw':
        dWidth = -localDx;
        dHeight = localDy;
        break;
    }
  } else {
    switch (handle) {
      case 'e':
        dWidth = localDx;
        break;
      case 'w':
        dWidth = -localDx;
        break;
      case 's':
        dHeight = localDy;
        break;
      case 'n':
        dHeight = -localDy;
        break;
    }
  }

  // Clamp to minimum size BEFORE anchor math so the anchor preservation
  // uses the actual final dimensions and doesn't produce drift.
  const newWidth = Math.max(rect.width + dWidth, minSize);
  const newHeight = Math.max(rect.height + dHeight, minSize);

  // ----- Anchor point preservation -----
  // The anchor is the opposite edge/corner of the handle being dragged. Its
  // global (screen-space) position must stay fixed so the element doesn't
  // shift when the CSS rotation pivot (center center) moves.
  //
  // Anchor_global = old_center + R(θ) · old_anchor_offset
  //
  // We need: new_center + R(θ) · new_anchor_offset = Anchor_global
  // → new_center = old_center + R(θ) · (old_anchor - new_anchor)
  // → new_pos    = new_center - (newWidth/2, newHeight/2)

  const oldAnchor = anchorOffset(handle, rect.width, rect.height);
  const newAnchor = anchorOffset(handle, newWidth, newHeight);
  const dAnchorX = oldAnchor.ax - newAnchor.ax;
  const dAnchorY = oldAnchor.ay - newAnchor.ay;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // old_center = (rect.x + rect.width/2, rect.y + rect.height/2)
  // new_center = old_center + R(θ) · (dAnchorX, dAnchorY)
  // new_pos    = new_center - (newWidth/2, newHeight/2)
  const newX = rect.x + rect.width / 2 + (cos * dAnchorX - sin * dAnchorY) - newWidth / 2;
  const newY = rect.y + rect.height / 2 + (sin * dAnchorX + cos * dAnchorY) - newHeight / 2;

  return { x: newX, y: newY, width: newWidth, height: newHeight };
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
