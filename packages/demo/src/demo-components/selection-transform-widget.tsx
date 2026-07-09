import {
  applyDragTranslation,
  applyResize,
  applyRotation,
  type ElementUpdate,
  type ResizeHandle,
} from '@broadset/editor';
import type { BroadsetElement } from '@broadset/model';
import { buildElementTransform } from '@broadset/renderer';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  MIN_TRANSFORM_SIZE,
  ROTATION_HANDLE_OFFSET,
  TRANSFORM_HANDLE_CURSORS,
  TRANSFORM_HANDLE_SIZE,
  type TransformGesture,
} from '../demo-types';

/**
 * Resize-handle positions inside the widget, expressed in canvas units. The
 * widget itself lives in canvas-unit space (so it tracks the element under
 * any zoom, pan, or 3D transform), but handle chips need a constant on-screen
 * size. We counter-scale by `screenPxPerCanvasUnit = 1 / (zoom * contentScale)`
 * so a 10px handle with a -5px offset on screen resolves to
 * (10 * screenPxPerCanvasUnit) and (-5 * screenPxPerCanvasUnit) in canvas units.
 */
function measureOverlayRatio(overlayRoot: HTMLElement): number {
  const rect = overlayRoot.getBoundingClientRect();
  const logicalWidth = overlayRoot.offsetWidth;

  if (logicalWidth <= 0 || rect.width <= 0) {
    return 1;
  }

  const ratio = rect.width / logicalWidth;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function buildHandlePositions(screenPxPerCanvasUnit: number): Readonly<Record<ResizeHandle, React.CSSProperties>> {
  const halfSize = (TRANSFORM_HANDLE_SIZE * screenPxPerCanvasUnit) / 2;
  const edgeOffset = `${String(-halfSize)}px`;

  return {
    e: { right: edgeOffset, top: '50%', transform: 'translate(50%, -50%)' },
    n: { left: '50%', top: edgeOffset, transform: 'translate(-50%, -50%)' },
    ne: { right: edgeOffset, top: edgeOffset, transform: 'translate(50%, -50%)' },
    nw: { left: edgeOffset, top: edgeOffset, transform: 'translate(-50%, -50%)' },
    s: { bottom: edgeOffset, left: '50%', transform: 'translate(-50%, 50%)' },
    se: { bottom: edgeOffset, right: edgeOffset, transform: 'translate(50%, 50%)' },
    sw: { bottom: edgeOffset, left: edgeOffset, transform: 'translate(-50%, 50%)' },
    w: { left: edgeOffset, top: '50%', transform: 'translate(-50%, -50%)' },
  };
}

function buildAncestorWrapperStyle(element: BroadsetElement): React.CSSProperties {
  return {
    height: `${String(Math.max(element.height, 1))}px`,
    left: `${String(element.position.x)}px`,
    pointerEvents: 'none',
    position: 'absolute',
    top: `${String(element.position.y)}px`,
    transform: buildElementTransform(element, element.style),
    transformOrigin: 'center center',
    width: `${String(Math.max(element.width, 1))}px`,
  };
}

function getElementZRotation(element: BroadsetElement): number {
  return element.rotation + (element.style.rotateZ ?? 0);
}

function projectDeltaToAncestorLocal(
  delta: { readonly dx: number; readonly dy: number },
  ancestorRotationDeg: number,
): { readonly dx: number; readonly dy: number } {
  if (ancestorRotationDeg === 0) {
    return delta;
  }

  const radians = (ancestorRotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    dx: delta.dx * cos + delta.dy * sin,
    dy: -delta.dx * sin + delta.dy * cos,
  };
}

type Point2D = { readonly x: number; readonly y: number };
type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

interface GesturePlaneProjection {
  readonly startLocal: Point2D;
  readonly screenToLocal: Matrix3;
}

function readAugmentedCell(augmented: readonly (readonly number[])[], row: number, column: number): number {
  return augmented[row]?.[column] ?? 0;
}

function findPivotRow(augmented: readonly (readonly number[])[], column: number, size: number): number {
  let pivotRow = column;

  for (let row = column + 1; row < size; row += 1) {
    if (
      Math.abs(readAugmentedCell(augmented, row, column)) > Math.abs(readAugmentedCell(augmented, pivotRow, column))
    ) {
      pivotRow = row;
    }
  }

  return pivotRow;
}

function swapAugmentedRows(augmented: number[][], column: number, pivotRow: number): boolean {
  const currentRow = augmented[column];
  const nextPivotRow = augmented[pivotRow];

  if (currentRow === undefined || nextPivotRow === undefined) {
    return false;
  }

  augmented[column] = nextPivotRow;
  augmented[pivotRow] = currentRow;

  return true;
}

function normalizeAugmentedRow(rowEntries: number[], column: number, size: number, pivot: number): void {
  for (let entry = column; entry <= size; entry += 1) {
    rowEntries[entry] = (rowEntries[entry] ?? 0) / pivot;
  }
}

function eliminateAugmentedColumn(augmented: number[][], column: number, size: number): boolean {
  const columnEntries = augmented[column];

  if (columnEntries === undefined) {
    return false;
  }

  for (let row = 0; row < size; row += 1) {
    if (row === column) {
      continue;
    }

    const rowEntries = augmented[row];

    if (rowEntries === undefined) {
      return false;
    }

    const factor = rowEntries[column] ?? 0;

    for (let entry = column; entry <= size; entry += 1) {
      rowEntries[entry] = (rowEntries[entry] ?? 0) - factor * (columnEntries[entry] ?? 0);
    }
  }

  return true;
}

function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  values: readonly number[],
): readonly number[] | null {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index] ?? 0]);

  for (let column = 0; column < size; column += 1) {
    const pivotRow = findPivotRow(augmented, column, size);
    const pivot = readAugmentedCell(augmented, pivotRow, column);

    if (Math.abs(pivot) < 1e-9 || !swapAugmentedRows(augmented, column, pivotRow)) {
      return null;
    }

    const currentRow = augmented[column];

    if (currentRow === undefined) {
      return null;
    }

    normalizeAugmentedRow(currentRow, column, size, pivot);

    if (!eliminateAugmentedColumn(augmented, column, size)) {
      return null;
    }
  }

  return augmented.map((row) => row[size] ?? 0);
}

function computeHomography(local: readonly Point2D[], screen: readonly Point2D[]): Matrix3 | null {
  if (local.length !== 4 || screen.length !== 4) {
    return null;
  }

  const rows: number[][] = [];
  const values: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const localPoint = local[index];
    const screenPoint = screen[index];

    if (localPoint === undefined || screenPoint === undefined) {
      return null;
    }

    rows.push([localPoint.x, localPoint.y, 1, 0, 0, 0, -screenPoint.x * localPoint.x, -screenPoint.x * localPoint.y]);
    values.push(screenPoint.x);
    rows.push([0, 0, 0, localPoint.x, localPoint.y, 1, -screenPoint.y * localPoint.x, -screenPoint.y * localPoint.y]);
    values.push(screenPoint.y);
  }

  const solved = solveLinearSystem(rows, values);

  if (solved === null) {
    return null;
  }

  return [
    solved[0] ?? 0,
    solved[1] ?? 0,
    solved[2] ?? 0,
    solved[3] ?? 0,
    solved[4] ?? 0,
    solved[5] ?? 0,
    solved[6] ?? 0,
    solved[7] ?? 0,
    1,
  ];
}

function invertMatrix3(matrix: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(determinant) < 1e-9) {
    return null;
  }

  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function projectPoint(matrix: Matrix3, point: Point2D): Point2D | null {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];

  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator;
  const y = (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator;

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function measurePlaneScreenPoints(plane: HTMLElement, localPoints: readonly Point2D[]): readonly Point2D[] {
  const probes = localPoints.map((point) => {
    const probe = document.createElement('div');

    probe.style.height = '0px';
    probe.style.left = `${String(point.x)}px`;
    probe.style.pointerEvents = 'none';
    probe.style.position = 'absolute';
    probe.style.top = `${String(point.y)}px`;
    probe.style.width = '0px';
    plane.appendChild(probe);

    return probe;
  });

  try {
    return probes.map((probe) => {
      const rect = probe.getBoundingClientRect();

      return { x: rect.left, y: rect.top };
    });
  } finally {
    for (const probe of probes) {
      probe.remove();
    }
  }
}

function createGesturePlaneProjection(widget: HTMLElement, startPoint: Point2D): GesturePlaneProjection | null {
  const plane = widget.offsetParent instanceof HTMLElement ? widget.offsetParent : null;
  const width = plane?.offsetWidth ?? 0;
  const height = plane?.offsetHeight ?? 0;

  if (plane === null || width <= 0 || height <= 0) {
    return null;
  }

  const localPoints = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const screenPoints = measurePlaneScreenPoints(plane, localPoints);
  const localToScreen = computeHomography(localPoints, screenPoints);
  const screenToLocal = localToScreen === null ? null : invertMatrix3(localToScreen);
  const startLocal = screenToLocal === null ? null : projectPoint(screenToLocal, startPoint);

  return screenToLocal === null || startLocal === null ? null : { screenToLocal, startLocal };
}

function projectGestureDelta(projection: GesturePlaneProjection | null, point: Point2D): Point2D | null {
  if (projection === null) {
    return null;
  }

  const projectedPoint = projectPoint(projection.screenToLocal, point);

  return projectedPoint === null ? null : (
      {
        x: projectedPoint.x - projection.startLocal.x,
        y: projectedPoint.y - projection.startLocal.y,
      }
    );
}

function projectGesturePoint(projection: GesturePlaneProjection | null, point: Point2D): Point2D | null {
  return projection === null ? null : projectPoint(projection.screenToLocal, point);
}

const ANCESTOR_OPACITY_WRAPPER_STYLE: React.CSSProperties = {
  height: '100%',
  width: '100%',
};

const ANCESTOR_CONTENT_WRAPPER_STYLE: React.CSSProperties = {
  boxSizing: 'border-box',
  display: 'block',
  height: '100%',
  padding: '0px',
  position: 'relative',
  width: '100%',
};

function wrapWithAncestorTransforms(
  content: React.ReactNode,
  ancestorElements: readonly BroadsetElement[],
): React.ReactNode {
  return ancestorElements.reduceRight(
    (child, ancestor) => (
      <div key={ancestor.id} style={buildAncestorWrapperStyle(ancestor)}>
        <div style={ANCESTOR_OPACITY_WRAPPER_STYLE}>
          <div style={ANCESTOR_CONTENT_WRAPPER_STYLE}>{child}</div>
        </div>
      </div>
    ),
    content,
  );
}

/**
 * The selection transform widget renders inside the renderer's overlay layer
 * (sibling of the element layer, inside canvasRoot). Because the overlay
 * shares the same transform chain as elements — translate(panX, panY) from
 * the demo's pan layer, scale(zoom) from the host, placeItems:center and
 * scale(contentScale) from the renderer, perspective from canvasSettings —
 * the widget uses raw canvas coordinates for its layout box and the full
 * element transform string for its CSS transform. No arithmetic duplicates
 * anything done by the renderer, so the widget cannot drift pixel-wise.
 */
export function SelectionTransformWidget({
  ancestorElements,
  element,
  overlayRoot,
  zoom,
  onPreviewUpdate,
  onCommitUpdate,
  onDoubleClick,
}: {
  readonly ancestorElements: readonly BroadsetElement[];
  readonly element: BroadsetElement;
  readonly overlayRoot: HTMLElement;
  readonly zoom: number;
  readonly onPreviewUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onCommitUpdate: (elementId: string, updates: ElementUpdate) => void;
  readonly onDoubleClick?: (elementId: string) => void;
}): React.ReactPortal {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<TransformGesture | null>(null);
  const gestureScaleRef = useRef(1);
  const gestureProjectionRef = useRef<GesturePlaneProjection | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  // Scale ratio between rendered screen pixels and canvas units, measured
  // directly off the overlay root's client rect. This is authoritative — it
  // reflects the cumulative effect of canvasRoot's scale, hostRef's zoom, and
  // any DPI scaling, without having to agree with separately-computed state.
  // Initialize synchronously on first render (overlayRoot is a prop and
  // already exists in the DOM) so handle sizes render correctly on the very
  // first paint — no stale-scale flash.
  const [pointerToCanvas, setPointerToCanvas] = useState(() => measureOverlayRatio(overlayRoot));

  useLayoutEffect(() => {
    const measure = (): void => {
      const nextRatio = measureOverlayRatio(overlayRoot);

      setPointerToCanvas((previous) => (nextRatio === previous ? previous : nextRatio));
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(overlayRoot);

    return () => {
      observer.disconnect();
    };
  }, [overlayRoot, zoom]);

  // Inverse ratio used to keep chrome (handles, rotation arm) a constant size
  // on screen even though the widget lives in canvas-unit space.
  const screenPxPerCanvasUnit = 1 / pointerToCanvas;
  const handleSizePx = TRANSFORM_HANDLE_SIZE * screenPxPerCanvasUnit;
  const rotationOffsetPx = ROTATION_HANDLE_OFFSET * screenPxPerCanvasUnit;
  const handlePositions = buildHandlePositions(screenPxPerCanvasUnit);
  const ancestorRotationDeg = ancestorElements.reduce((total, ancestor) => total + getElementZRotation(ancestor), 0);

  const captureGestureScale = useCallback((): void => {
    const ratio = measureOverlayRatio(overlayRoot);

    gestureScaleRef.current = ratio;
    setPointerToCanvas((previous) => (ratio === previous ? previous : ratio));
  }, [overlayRoot]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      captureGestureScale();
      gestureProjectionRef.current =
        widgetRef.current === null ?
          null
        : createGesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
      gestureRef.current = {
        initialPosition: { ...element.position },
        kind: 'drag',
        lastUpdate: null,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [captureGestureScale, element.position],
  );

  const beginResize = useCallback(
    (handle: ResizeHandle) =>
      (event: React.PointerEvent<HTMLDivElement>): void => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        captureGestureScale();
        gestureProjectionRef.current =
          widgetRef.current === null ?
            null
          : createGesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
        gestureRef.current = {
          handle,
          initialRect: {
            height: element.height,
            width: element.width,
            x: element.position.x,
            y: element.position.y,
          },
          kind: 'resize',
          lastUpdate: null,
          startX: event.clientX,
          startY: event.clientY,
        };
      },
    [captureGestureScale, element.height, element.position.x, element.position.y, element.width],
  );

  const beginRotation = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return;
      }

      const projection =
        widgetRef.current === null ?
          null
        : createGesturePlaneProjection(widgetRef.current, { x: event.clientX, y: event.clientY });
      const projectedPoint = projectGesturePoint(projection, { x: event.clientX, y: event.clientY });
      const localCenter = {
        x: element.position.x + element.width / 2,
        y: element.position.y + element.height / 2,
      };
      const bounds = widgetRef.current?.getBoundingClientRect();
      const centerX = bounds === undefined ? event.clientX : bounds.left + bounds.width / 2;
      const centerY = bounds === undefined ? event.clientY : bounds.top + bounds.height / 2;
      const startAngle =
        projectedPoint === null ?
          Math.atan2(event.clientY - centerY, event.clientX - centerX)
        : Math.atan2(projectedPoint.y - localCenter.y, projectedPoint.x - localCenter.x);

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      captureGestureScale();
      gestureProjectionRef.current = projection;
      setIsRotating(true);
      gestureRef.current = {
        initialRotation: element.rotation,
        kind: 'rotate',
        lastUpdate: null,
        startAngle,
      };
    },
    [captureGestureScale, element.height, element.position.x, element.position.y, element.rotation, element.width],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;

      if (gesture === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const activeScale = gestureScaleRef.current;

      if (gesture.kind === 'drag') {
        const projectedDelta = projectGestureDelta(gestureProjectionRef.current, {
          x: event.clientX,
          y: event.clientY,
        });
        const update = {
          position:
            projectedDelta === null ?
              applyDragTranslation(
                gesture.initialPosition,
                projectDeltaToAncestorLocal(
                  { dx: event.clientX - gesture.startX, dy: event.clientY - gesture.startY },
                  ancestorRotationDeg,
                ),
                activeScale,
              )
            : {
                x: gesture.initialPosition.x + projectedDelta.x,
                y: gesture.initialPosition.y + projectedDelta.y,
              },
        } satisfies ElementUpdate;

        gesture.lastUpdate = update;
        onPreviewUpdate(element.id, update);

        return;
      }

      if (gesture.kind === 'resize') {
        const projectedDelta = projectGestureDelta(gestureProjectionRef.current, {
          x: event.clientX,
          y: event.clientY,
        });
        const pointerDelta =
          projectedDelta === null ?
            projectDeltaToAncestorLocal(
              { dx: event.clientX - gesture.startX, dy: event.clientY - gesture.startY },
              ancestorRotationDeg,
            )
          : { dx: projectedDelta.x, dy: projectedDelta.y };
        const nextRect = applyResize(
          gesture.initialRect,
          gesture.handle,
          pointerDelta.dx,
          pointerDelta.dy,
          projectedDelta === null ? activeScale : 1,
          getElementZRotation(element),
          MIN_TRANSFORM_SIZE,
        );
        const update = {
          height: nextRect.height,
          position: { x: nextRect.x, y: nextRect.y },
          width: nextRect.width,
        } satisfies ElementUpdate;

        gesture.lastUpdate = update;
        onPreviewUpdate(element.id, update);

        return;
      }

      const projectedPoint = projectGesturePoint(gestureProjectionRef.current, { x: event.clientX, y: event.clientY });
      const localCenter = {
        x: element.position.x + element.width / 2,
        y: element.position.y + element.height / 2,
      };
      const bounds = widgetRef.current?.getBoundingClientRect();
      const centerX = bounds === undefined ? event.clientX : bounds.left + bounds.width / 2;
      const centerY = bounds === undefined ? event.clientY : bounds.top + bounds.height / 2;
      const currentAngle =
        projectedPoint === null ?
          Math.atan2(event.clientY - centerY, event.clientX - centerX)
        : Math.atan2(projectedPoint.y - localCenter.y, projectedPoint.x - localCenter.x);
      const update = {
        rotation: applyRotation(gesture.initialRotation, ((currentAngle - gesture.startAngle) * 180) / Math.PI),
      } satisfies ElementUpdate;

      gesture.lastUpdate = update;
      onPreviewUpdate(element.id, update);
    },
    [ancestorRotationDeg, element, onPreviewUpdate],
  );

  const finishGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;

      if (gesture === null) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setIsRotating(false);
      gestureRef.current = null;
      gestureProjectionRef.current = null;

      if (gesture.lastUpdate !== null) {
        onCommitUpdate(element.id, gesture.lastUpdate);
      }
    },
    [element.id, onCommitUpdate],
  );

  const elementTransform = buildElementTransform(element, element.style);

  return createPortal(
    wrapWithAncestorTransforms(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- transform widget is a canvas overlay; onClick only exists to swallow click propagation so the canvas click handler doesn't fire. Keyboard interaction happens on the parent canvas (role="application").
      <div
        ref={widgetRef}
        data-testid="demo-transform-widget"
        onClick={(event) => {
          event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick?.(element.id);
        }}
        onPointerCancel={finishGesture}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        style={{
          height: `${String(Math.max(element.height, 1))}px`,
          left: `${String(element.position.x)}px`,
          pointerEvents: 'auto',
          position: 'absolute',
          top: `${String(element.position.y)}px`,
          transform: elementTransform,
          transformOrigin: 'center center',
          width: `${String(Math.max(element.width, 1))}px`,
        }}
      >
        <div
          data-testid="transform-bounds"
          onPointerDown={beginDrag}
          style={{
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.95)',
            borderRadius: '0.4rem',
            boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.35)',
            cursor: 'move',
            inset: 0,
            position: 'absolute',
          }}
        />
        {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
          <div
            key={handle}
            data-testid={`transform-handle-${handle}`}
            onPointerDown={beginResize(handle)}
            style={{
              ...handlePositions[handle],
              background: '#ffffff',
              border: '1px solid rgba(37, 99, 235, 0.95)',
              borderRadius: '9999px',
              cursor: TRANSFORM_HANDLE_CURSORS[handle],
              height: `${String(handleSizePx)}px`,
              position: 'absolute',
              width: `${String(handleSizePx)}px`,
            }}
          />
        ))}
        <div
          aria-hidden="true"
          style={{
            background: 'rgba(59, 130, 246, 0.8)',
            height: `${String((ROTATION_HANDLE_OFFSET - 6) * screenPxPerCanvasUnit)}px`,
            left: '50%',
            pointerEvents: 'none',
            position: 'absolute',
            top: `${String((-ROTATION_HANDLE_OFFSET + 8) * screenPxPerCanvasUnit)}px`,
            transform: 'translateX(-50%)',
            width: `${String(screenPxPerCanvasUnit)}px`,
          }}
        />
        <div
          data-testid="transform-rotation-handle"
          onPointerDown={beginRotation}
          style={{
            background: 'rgba(37, 99, 235, 0.98)',
            border: '2px solid rgba(255, 255, 255, 0.96)',
            borderRadius: '9999px',
            boxShadow: '0 4px 10px rgba(15, 23, 42, 0.24)',
            cursor: isRotating ? 'grabbing' : 'grab',
            height: `${String((TRANSFORM_HANDLE_SIZE + 2) * screenPxPerCanvasUnit)}px`,
            left: '50%',
            position: 'absolute',
            top: `${String(-rotationOffsetPx)}px`,
            transform: 'translate(-50%, -50%)',
            width: `${String((TRANSFORM_HANDLE_SIZE + 2) * screenPxPerCanvasUnit)}px`,
          }}
        />
      </div>,
      ancestorElements,
    ),
    overlayRoot,
  );
}
