import type { BroadsetElement, Canvas } from '@broadset/model';
import { type PDFOperator, popGraphicsState, pushGraphicsState, rotateDegrees, translate } from 'pdf-lib';

import { elementToPoints } from '../geometry';

/**
 * A position expressed in canvas-absolute coordinates (in canvas units,
 * not PDF points). Children of a parent group carry positions relative to
 * their parent's top-left in the model; the exporter composes them into
 * canvas-absolute coordinates before Y-flipping into PDF space.
 */
export interface CanvasAbsolutePosition {
  readonly x: number;
  readonly y: number;
}

/**
 * Bracket sequences produced by the rotation helper.
 *
 * `start` is pushed before the element's drawing operators; `end` is
 * pushed after. Elements with `rotation === 0` produce empty sequences so
 * the caller can emit them unconditionally without bloating the content
 * stream with no-op graphics-state pushes.
 */
export interface OperatorBrackets {
  readonly start: readonly PDFOperator[];
  readonly end: readonly PDFOperator[];
}

const EMPTY_BRACKETS: OperatorBrackets = { start: [], end: [] };

/**
 * Walk the `parentId` chain of `element` accumulating translation so the
 * returned position is canvas-absolute rather than parent-local. Respects
 * the validated acyclic parentId invariant in `@broadset/model`
 * (`document.ts`) and carries a local cycle guard so an invalid fixture
 * cannot infinite-loop the exporter.
 *
 * The renderer documents in `packages/renderer/src/dom/layout.ts` that
 * "Parented elements use model-space coordinates relative to their
 * parent's top-left." The PDF exporter previously ignored that and drew
 * children at raw `element.position.x / y` — this helper closes that
 * gap for P6.2 parity rebuild.
 */
export function composeCanvasAbsolutePosition(
  element: BroadsetElement,
  elementsById: ReadonlyMap<string, BroadsetElement>,
): CanvasAbsolutePosition {
  let x = 0;
  let y = 0;
  let current: BroadsetElement | undefined = element;
  const seen = new Set<string>();

  while (current !== undefined) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    x += current.position.x;
    y += current.position.y;
    current = current.parentId === null ? undefined : elementsById.get(current.parentId);
  }

  return { x, y };
}

/**
 * PDF graphics-state operator brackets that rotate `element.rotation`
 * degrees clockwise (Broadset / CSS convention) around the element's
 * canvas-absolute centre. Returns empty sequences when rotation is 0 so
 * the content stream doesn't carry no-op transform stacks.
 *
 * PDF's coordinate system is Y-up while Broadset's is Y-down, so a
 * clockwise rotation in screen space is a counter-clockwise rotation in
 * PDF space. The helper negates the angle to keep visual direction
 * consistent across the two coordinate systems.
 */
export function elementRotationBrackets(
  element: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
): OperatorBrackets {
  if (element.rotation === 0) {
    return EMPTY_BRACKETS;
  }

  const cxPt = elementToPoints(canvas, absolute.x + element.width / 2);
  const cyPt = heightPt - elementToPoints(canvas, absolute.y + element.height / 2);

  return {
    start: [
      pushGraphicsState(),
      translate(cxPt, cyPt),
      rotateDegrees(-element.rotation),
      translate(-cxPt, -cyPt),
    ],
    end: [popGraphicsState()],
  };
}

/**
 * Build an `ReadonlyMap<string, BroadsetElement>` keyed by element id so
 * repeated parent lookups during rendering stay O(1).
 */
export function indexElementsById(
  elements: readonly BroadsetElement[],
): ReadonlyMap<string, BroadsetElement> {
  const index = new Map<string, BroadsetElement>();

  for (const el of elements) {
    index.set(el.id, el);
  }

  return index;
}
