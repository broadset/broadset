import type { BroadsetDocument } from '@broadset/model';

import { toPixelValue } from '../../dom/layout';

const CHECKER_SIZE_PX = 16;
const CHECKER_LIGHT = '#d5d7dc';
const CHECKER_DARK = '#b8bcc4';
const DEFAULT_CANVAS_BG = '#0f172a';

/**
 * Applies the Broadset preview canvas background to the outermost scale shell.
 *
 * The checkerboard background is a Broadset editor/demo preview affordance —
 * it signals transparent canvas mode. This behavior is deliberately hosted in
 * the Broadset adapter layer so a generic consumer of the renderer core can
 * pick its own canvas backdrop (or none at all) without inheriting the
 * editor's preview semantics.
 *
 * Background lives on `canvasScaleShell`, which sits OUTSIDE the 3D rendering
 * context established by `canvasTransformLayer`'s perspective + preserve-3d.
 * If the background were on `canvasRoot` (inside the 3D context) it would be
 * depth-sorted with the elements, and any element rotating into negative z
 * would render BEHIND the background plane. Keeping it outside the 3D context
 * makes the background a plain 2D backdrop that no 3D rotation can hide an
 * element behind.
 */
export function applyCanvasFrame(args: {
  readonly documentData: BroadsetDocument;
  readonly canvasTransformLayer: HTMLElement;
  readonly canvasScaleShell: HTMLElement;
  readonly canvasRoot: HTMLElement;
}): void {
  const { documentData, canvasTransformLayer, canvasScaleShell, canvasRoot } = args;

  canvasTransformLayer.style.width = toPixelValue(documentData.canvas.width);
  canvasTransformLayer.style.height = toPixelValue(documentData.canvas.height);

  canvasScaleShell.style.background = '';
  canvasRoot.style.background = '';
  canvasRoot.style.backgroundColor = '';
  canvasRoot.style.backgroundImage = '';

  if (documentData.canvas.backgroundMode === 'solid') {
    canvasScaleShell.style.backgroundColor = documentData.canvas.backgroundColor ?? DEFAULT_CANVAS_BG;
    canvasScaleShell.style.backgroundImage = '';

    return;
  }

  canvasScaleShell.style.backgroundColor = CHECKER_LIGHT;
  canvasScaleShell.style.backgroundImage =
    `linear-gradient(45deg, ${CHECKER_DARK} 25%, transparent 25%), ` +
    `linear-gradient(-45deg, ${CHECKER_DARK} 25%, transparent 25%), ` +
    `linear-gradient(45deg, transparent 75%, ${CHECKER_DARK} 75%), ` +
    `linear-gradient(-45deg, transparent 75%, ${CHECKER_DARK} 75%)`;
  canvasScaleShell.style.backgroundSize =
    `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
    `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
    `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px, ` +
    `${String(CHECKER_SIZE_PX)}px ${String(CHECKER_SIZE_PX)}px`;
  canvasScaleShell.style.backgroundPosition =
    `0 0, 0 ${String(CHECKER_SIZE_PX / 2)}px, ` +
    `${String(CHECKER_SIZE_PX / 2)}px ${String(-CHECKER_SIZE_PX / 2)}px, ` +
    `${String(-CHECKER_SIZE_PX / 2)}px 0`;
}
