// ---------------------------------------------------------------------------
// Transform Interactions — pure computation layer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SnapGuide {
  readonly axis: 'x' | 'y';
  readonly position: number;
}

export interface SnapResult {
  readonly snappedPosition: { readonly x: number; readonly y: number };
  readonly guides: readonly SnapGuide[];
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Zoom compensation
// ---------------------------------------------------------------------------

export function compensateZoom(screenDelta: number, zoom: number): number {
  return screenDelta / zoom;
}

// ---------------------------------------------------------------------------
// Drag translation
// ---------------------------------------------------------------------------

export function applyDragTranslation(
  current: { readonly x: number; readonly y: number },
  delta: { readonly dx: number; readonly dy: number },
  zoom: number,
): { readonly x: number; readonly y: number } {
  const dx = compensateZoom(delta.dx, zoom);
  const dy = compensateZoom(delta.dy, zoom);

  return { x: current.x + dx, y: current.y + dy };
}

// ---------------------------------------------------------------------------
// Resize via handles
// ---------------------------------------------------------------------------

const CORNER_HANDLES = new Set<ResizeHandle>(['nw', 'ne', 'se', 'sw']);

export function applyResize(rect: Rect, handle: ResizeHandle, dx: number, dy: number, zoom: number): Rect {
  const cdx = compensateZoom(dx, zoom);
  const cdy = compensateZoom(dy, zoom);

  let { x, y, width, height } = rect;

  if (CORNER_HANDLES.has(handle)) {
    // Corner handles adjust both axes
    switch (handle) {
      case 'se':
        width += cdx;
        height += cdy;
        break;
      case 'ne':
        width += cdx;
        y += cdy;
        height -= cdy;
        break;
      case 'nw':
        x += cdx;
        width -= cdx;
        y += cdy;
        height -= cdy;
        break;
      case 'sw':
        x += cdx;
        width -= cdx;
        height += cdy;
        break;
    }
  } else {
    // Edge handles adjust one axis only
    switch (handle) {
      case 'e':
        width += cdx;
        break;
      case 'w':
        x += cdx;
        width -= cdx;
        break;
      case 's':
        height += cdy;
        break;
      case 'n':
        y += cdy;
        height -= cdy;
        break;
    }
  }

  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

export function applyRotation(currentDegrees: number, deltaDegrees: number): number {
  return currentDegrees + deltaDegrees;
}

// ---------------------------------------------------------------------------
// Anchor auto-assignment
// ---------------------------------------------------------------------------

type AnchorX = 'left' | 'right';
type AnchorY = 'top' | 'bottom';

export function calculateAnchors(
  elementCenter: { readonly x: number; readonly y: number },
  canvasSize: { readonly width: number; readonly height: number },
): { readonly anchorX: AnchorX; readonly anchorY: AnchorY } {
  const anchorX: AnchorX = elementCenter.x < canvasSize.width / 2 ? 'left' : 'right';
  const anchorY: AnchorY = elementCenter.y < canvasSize.height / 2 ? 'top' : 'bottom';

  return { anchorX, anchorY };
}

// ---------------------------------------------------------------------------
// Border radius handle predicate
// ---------------------------------------------------------------------------

export function isBorderRadiusHandle(elementType: string): boolean {
  return elementType === 'rectangle';
}

// ---------------------------------------------------------------------------
// Smart guide snapping
// ---------------------------------------------------------------------------

interface SnapCandidate {
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly distance: number;
  readonly priority: number; // lower = higher priority
}

function getEdgesAndCenters(rect: Rect, axis: 'x' | 'y'): readonly number[] {
  if (axis === 'x') {
    return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  }

  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function findCandidatesForAxis(
  dragged: Rect,
  others: readonly Rect[],
  userGuides: readonly SnapGuide[],
  threshold: number,
  axis: 'x' | 'y',
): SnapCandidate | undefined {
  const draggedEdges = getEdgesAndCenters(dragged, axis);
  const candidates: SnapCandidate[] = [];

  // Element guides
  for (const other of others) {
    const otherEdges = getEdgesAndCenters(other, axis);
    const otherStart = otherEdges[0];
    const otherCenter = otherEdges[1];
    const otherEnd = otherEdges[2];

    if (otherStart === undefined || otherCenter === undefined || otherEnd === undefined) continue;

    for (const de of draggedEdges) {
      // Element center alignment (priority 3)
      const centerDist = Math.abs(de - otherCenter);

      if (centerDist <= threshold) {
        candidates.push({ axis, position: otherCenter, distance: centerDist, priority: 3 });
      }

      // Element edge alignment (priority 4)
      for (const oe of [otherStart, otherEnd]) {
        const edgeDist = Math.abs(de - oe);

        if (edgeDist <= threshold) {
          candidates.push({ axis, position: oe, distance: edgeDist, priority: 4 });
        }
      }
    }
  }

  // User guide lines
  for (const guide of userGuides) {
    if (guide.axis !== axis) continue;

    for (const de of draggedEdges) {
      const dist = Math.abs(de - guide.position);

      if (dist <= threshold) {
        // User guides treated as page edge priority (priority 2)
        candidates.push({ axis, position: guide.position, distance: dist, priority: 2 });
      }
    }
  }

  if (candidates.length === 0) return undefined;

  // Sort by priority (lower = better), then by distance
  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);

  return candidates[0];
}

export function findSnapGuides(
  dragged: Rect,
  others: readonly Rect[],
  userGuides: readonly SnapGuide[],
  threshold: number,
): SnapResult {
  const guides: SnapGuide[] = [];
  let snappedX = dragged.x;
  let snappedY = dragged.y;

  const xCandidate = findCandidatesForAxis(dragged, others, userGuides, threshold, 'x');

  if (xCandidate) {
    // Adjust x to align the matching edge/center with the snap target
    const draggedEdges = getEdgesAndCenters(dragged, 'x');
    let bestOffset = Infinity;

    for (const de of draggedEdges) {
      const offset = de - dragged.x;
      const dist = Math.abs(de - xCandidate.position);

      if (dist <= threshold && Math.abs(offset) < Math.abs(bestOffset)) {
        bestOffset = xCandidate.position - de + offset;
      }
    }

    // Find which dragged edge was closest to the snap position
    let closestEdgeOffset = 0;
    let closestDist = Infinity;

    for (const de of draggedEdges) {
      const dist = Math.abs(de - xCandidate.position);

      if (dist < closestDist) {
        closestDist = dist;
        closestEdgeOffset = de - dragged.x;
      }
    }

    snappedX = xCandidate.position - closestEdgeOffset;
    guides.push({ axis: 'x', position: xCandidate.position });
  }

  const yCandidate = findCandidatesForAxis(dragged, others, userGuides, threshold, 'y');

  if (yCandidate) {
    const draggedEdges = getEdgesAndCenters(dragged, 'y');
    let closestEdgeOffset = 0;
    let closestDist = Infinity;

    for (const de of draggedEdges) {
      const dist = Math.abs(de - yCandidate.position);

      if (dist < closestDist) {
        closestDist = dist;
        closestEdgeOffset = de - dragged.y;
      }
    }

    snappedY = yCandidate.position - closestEdgeOffset;
    guides.push({ axis: 'y', position: yCandidate.position });
  }

  return {
    snappedPosition: { x: snappedX, y: snappedY },
    guides,
  };
}

// ---------------------------------------------------------------------------
// Grid snapping
// ---------------------------------------------------------------------------

export function findGridSnap(
  position: { readonly x: number; readonly y: number },
  gridSize: number,
  threshold: number,
): { readonly x: number; readonly y: number } {
  const nearestX = Math.round(position.x / gridSize) * gridSize;
  const nearestY = Math.round(position.y / gridSize) * gridSize;

  const x = Math.abs(position.x - nearestX) <= threshold ? nearestX : position.x;
  const y = Math.abs(position.y - nearestY) <= threshold ? nearestY : position.y;

  return { x, y };
}
