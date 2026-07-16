import { expect, test } from '@playwright/experimental-ct-react';

import { getCanvasRootRect } from '../canvas-transform/helpers';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';
import {
  activatePathTool,
  assertPathVerticesMatchClicks,
  clickAbsolute,
  clickAndWaitForVertex,
  clickCanvasAt,
  isPathDrawingActive,
} from './path-tool.helpers';

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: clicking the Path toolbar button enters placement mode, a click
 * on the canvas places a path element AND enters drawing mode AND the cursor
 * flips to crosshair. This crosses regions: toolbar → canvas cursor → placement
 * banner.
 */
test('Path toolbar activation updates the canvas cursor, placement banner, and persists crosshair into drawing mode', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  const preview = page.getByLabel(/screen preview for/i);

  await activatePathTool(page);

  const placementCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(placementCursor).toBe('crosshair');

  await clickCanvasAt(page, 400, 350);

  // After first click, placement is cleared. Cursor should remain crosshair
  // because pathDrawingElementId is now active.
  await expect(page.getByTestId('placement-mode-banner')).toHaveCount(0);

  const drawingCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(drawingCursor).toBe('crosshair');
});

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: after the Path tool is activated, three canvas clicks followed
 * by Enter produce a closed path — the rendered `<path>` element in the
 * renderer host has a `d` attribute ending in `Z`, and the cursor returns to
 * default (drawing mode exited). Cross-region: toolbar → canvas → cursor reset.
 */
test('three canvas clicks plus Enter produces a closed path and restores the default cursor', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  await activatePathTool(page);
  await clickCanvasAt(page, 400, 250);
  await clickCanvasAt(page, 550, 320);
  await clickCanvasAt(page, 470, 450);

  // Dispatch Enter directly via the window so it reaches the global keydown
  // handler without competing with any toolbar button's default Enter-click.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  const rendererHost = page.getByTestId('v1-page-preview');
  const closedPath = rendererHost.locator('svg path[d*="Z"]');

  await expect(closedPath.first()).toBeAttached({ timeout: 2000 });

  const preview = page.getByLabel(/screen preview for/i);
  const finalCursor = await preview.evaluate((element) => getComputedStyle(element).cursor);

  expect(finalCursor).toBe('default');
});

/**
 * @description Validates `project/spec/editor/editing.md` § Path Drawing
 * Interaction: Escape during drawing commits the current points as-is (no Z)
 * and exits drawing mode. Cross-region: canvas clicks → keyboard → cursor reset.
 */
test('Escape during drawing commits the path without closing it and restores the default cursor', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  await activatePathTool(page);
  await clickCanvasAt(page, 150, 120);
  await clickCanvasAt(page, 280, 160);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });
  await expect.poll(async () => isPathDrawingActive(page)).toBe(false);

  const preview = page.getByLabel(/screen preview for/i);

  await expect.poll(async () => preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('default');
});

/**
 * @description The selection transform widget MUST NOT render while path
 * drawing is active. Without this suppression, widget pointerdown handlers
 * intercept canvas clicks once the path's bounding box extends under the
 * widget, hijacking append clicks into a drag that "moves all points."
 */
test('transform widget is hidden during placement and path drawing', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  // Activating the path tool enters placement mode → widget hides so the user's
  // first canvas click isn't swallowed by a leftover selection widget.
  await activatePathTool(page);
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);

  await clickCanvasAt(page, 200, 140);

  // First click created the path and entered path-drawing mode.
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);

  // Keep appending points — widget stays hidden for the duration of drawing.
  await clickCanvasAt(page, 320, 200);
  await clickCanvasAt(page, 260, 280);
  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);
});

/**
 * @description Full path-drawing round-trip at default zoom/pan. Every single
 * appended point must render on screen exactly where the user clicked — not
 * just "somewhere inside the path's bounding box."
 */
test('path vertices land on their click positions at default zoom', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.3, y: canvasRect.y + canvasRect.height * 0.25 },
    { x: canvasRect.x + canvasRect.width * 0.6, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.45, y: canvasRect.y + canvasRect.height * 0.7 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Aggressive regression guard: click 8 points scattered across
 * the canvas. Every click must land on its exact vertex — the path must not
 * drift, scramble, or place points at surprise locations. This was the
 * failure mode the user reported: "clicks produce points all over the canvas
 * everywhere but not where I click to."
 */
test('eight scattered clicks each produce a vertex at the exact click position', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.28, y: canvasRect.y + canvasRect.height * 0.22 },
    { x: canvasRect.x + canvasRect.width * 0.72, y: canvasRect.y + canvasRect.height * 0.25 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.7 },
    { x: canvasRect.x + canvasRect.width * 0.32, y: canvasRect.y + canvasRect.height * 0.62 },
    { x: canvasRect.x + canvasRect.width * 0.48, y: canvasRect.y + canvasRect.height * 0.52 },
    { x: canvasRect.x + canvasRect.width * 0.65, y: canvasRect.y + canvasRect.height * 0.35 },
    { x: canvasRect.x + canvasRect.width * 0.36, y: canvasRect.y + canvasRect.height * 0.48 },
    { x: canvasRect.x + canvasRect.width * 0.58, y: canvasRect.y + canvasRect.height * 0.6 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description After a path is drawn and deselected, clicking the path's
 * host element must re-select it — just like any other element type.
 * User-reported: "Path type element can't be selected again after being
 * created and deselected."
 */
test('a completed path can be re-selected by clicking it', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.35, y: canvasRect.y + canvasRect.height * 0.35 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.6 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  // Commit via Enter, then deselect via the store (avoids landing clicks on
  // overlapping sample elements in the CT harness).
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });
  await page.evaluate(() => {
    const store = window.__broadsetProjectEditorStore;

    store?.getState().selectElement(null);
  });

  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);

  // Now click directly on the path element host. Selection must take.
  const pathId = await page.evaluate((): string | null => {
    const store = window.__broadsetProjectEditorStore;

    if (store === undefined) return null;

    const elements = store.getState().project.documents[0]?.elements ?? [];

    // Iterate in reverse so we find the most recently created path element.
    for (let index = elements.length - 1; index >= 0; index -= 1) {
      const element = elements[index];

      if (element?.kind === 'vector' && element.geometryData.kind === 'path') {
        return element.id;
      }
    }

    return null;
  });

  expect(pathId).not.toBeNull();

  const pathHost = page.locator(`[data-testid="v1-page-preview"] [data-element-id="${String(pathId)}"]`);

  await expect(pathHost).toBeAttached();

  const pathStrokePoint = await pathHost.locator('svg path').evaluate((pathElement): { x: number; y: number } => {
    const path = pathElement as SVGPathElement;
    const host = path.closest<HTMLElement>('[data-element-id]');
    const elementId = host?.dataset['elementId'] ?? null;
    const matrix = path.getScreenCTM();

    if (elementId === null) {
      throw new Error('Rendered path host does not expose data-element-id');
    }

    if (matrix === null) {
      throw new Error('Rendered path does not expose a screen transform');
    }

    const totalLength = path.getTotalLength();

    for (const ratio of [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) {
      const localPoint = path.getPointAtLength(totalLength * ratio);
      const screenPoint = new DOMPoint(localPoint.x, localPoint.y).matrixTransform(matrix);
      const hit = document.elementFromPoint(screenPoint.x, screenPoint.y)?.closest('[data-element-id]');

      if (hit instanceof HTMLElement && hit.dataset['elementId'] === elementId) {
        return { x: screenPoint.x, y: screenPoint.y };
      }
    }

    throw new Error('Rendered path has no painted hit-test point');
  });

  await page.mouse.click(pathStrokePoint.x, pathStrokePoint.y);

  // The click lands on the SVG child of the path host; the handler must walk up
  // via `closest('[data-element-id]')` to select the host's element id.
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Clicking the last-placed vertex again commits the path and
 * exits drawing mode — no Enter keypress required. This is a natural "I'm
 * done" signal: the user places their final point and clicks it once more.
 */
test('clicking the last vertex again ends path drawing', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.35, y: canvasRect.y + canvasRect.height * 0.35 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.6 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  const preview = page.getByLabel(/screen preview for/i);

  // Still drawing — cursor is crosshair, rubber-band line is visible.
  await expect.poll(async () => preview.evaluate((el) => getComputedStyle(el).cursor)).toBe('crosshair');

  // Click the SAME final point again — commits and exits drawing.
  const finalClick = clicks[clicks.length - 1];

  if (finalClick === undefined) throw new Error('Expected a final click');
  await clickAbsolute(page, finalClick.x, finalClick.y);

  // Drawing mode has ended — cursor returns to default and the rubber-band
  // preview line disappears.
  await expect.poll(async () => preview.evaluate((el) => getComputedStyle(el).cursor)).toBe('default');
  await expect(page.getByTestId('placement-preview-path-line')).toHaveCount(0);

  // No extra vertex was appended — the committed path has the same three points.
  const pathD = await page
    .locator('[data-testid="v1-page-preview"] [data-element-id] svg path[d]')
    .last()
    .getAttribute('d');
  const matches = (pathD ?? '').match(/[ML]/g) ?? [];

  expect(matches).toHaveLength(3);
});

/**
 * @description After the first click, moving the cursor must render a dashed
 * rubber-band line from the last committed vertex to the cursor so the user
 * sees a preview of what the next segment would look like. The line's
 * endpoint must follow the pointer in real time.
 */
test('path drawing shows a rubber-band preview line from the last vertex to the cursor', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const anchor = { x: canvasRect.x + canvasRect.width * 0.35, y: canvasRect.y + canvasRect.height * 0.4 };

  // No preview line yet — we haven't committed a vertex.
  await expect(page.getByTestId('placement-preview-path-line')).toHaveCount(0);

  await clickAbsolute(page, anchor.x, anchor.y);

  // Move the mouse to a new position — the rubber-band line should appear.
  const cursorPosition = { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.45 };

  await page.mouse.move(cursorPosition.x, cursorPosition.y);

  const previewLine = page.getByTestId('placement-preview-path-line');

  await expect(previewLine).toHaveCount(1);

  // Line endpoint must follow the cursor when it moves again.
  const secondCursorPosition = {
    x: canvasRect.x + canvasRect.width * 0.65,
    y: canvasRect.y + canvasRect.height * 0.55,
  };

  await page.mouse.move(secondCursorPosition.x, secondCursorPosition.y);

  // The preview line endpoint (x2, y2) lives in SVG coords inside a scaled
  // transform layer, but its screen bbox should sit between the last vertex
  // (≈ anchor) and the new cursor position on screen.
  const lineBox = await previewLine.boundingBox();

  if (lineBox === null) throw new Error('Preview line bounding box not found');

  const minExpectedX = Math.min(anchor.x, secondCursorPosition.x);
  const maxExpectedX = Math.max(anchor.x, secondCursorPosition.x);
  const minExpectedY = Math.min(anchor.y, secondCursorPosition.y);
  const maxExpectedY = Math.max(anchor.y, secondCursorPosition.y);
  const tolerance = 4;

  expect(lineBox.x).toBeGreaterThanOrEqual(minExpectedX - tolerance);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(maxExpectedX + tolerance);
  expect(lineBox.y).toBeGreaterThanOrEqual(minExpectedY - tolerance);
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(maxExpectedY + tolerance);
});

/**
 * @description Exact user-reported scenario: click sequence that extends the
 * bounding box in NEGATIVE directions (up, then left). The user reported:
 * "THE WHOLE ELEMENT MOVES... after that also each new point is placed wrong.
 * Only point clicked to right and/or down the original point get placed
 * correctly." This test reproduces those exact clicks and asserts every
 * vertex lands on its click position within 1 screen pixel.
 */
test('clicks extending the bbox up and left keep every vertex anchored to its click', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const p1 = { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.6 };
  const p2 = { x: p1.x + 50, y: p1.y };
  const p3 = { x: p2.x, y: p2.y - 50 };
  const p4 = { x: p3.x - 100, y: p3.y };
  const clicks = [p1, p2, p3, p4];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Exhaustive bbox-direction test: click the anchor, then clicks
 * in every compass direction. Each direction independently extends the bbox
 * and forces re-anchoring of the element position + content. Previous
 * vertices must stay anchored to their original click positions after every
 * new click — the "whole element moves" bug.
 */
test('clicks in every compass direction keep previous vertices anchored', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const center = { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.5 };
  const clicks = [
    center, // anchor
    { x: center.x + 60, y: center.y }, // east
    { x: center.x + 60, y: center.y + 40 }, // southeast
    { x: center.x, y: center.y + 40 }, // south
    { x: center.x - 60, y: center.y + 40 }, // southwest
    { x: center.x - 60, y: center.y }, // west
    { x: center.x - 60, y: center.y - 40 }, // northwest
    { x: center.x, y: center.y - 40 }, // north
    { x: center.x + 60, y: center.y - 40 }, // northeast
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Clicks that land in a straight horizontal line still produce
 * vertices at those clicks. Edge case where bbox Y padding could collapse.
 */
test('path vertices land on their click positions for colinear clicks', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.3, y: canvasRect.y + canvasRect.height * 0.5 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.5 },
    { x: canvasRect.x + canvasRect.width * 0.7, y: canvasRect.y + canvasRect.height * 0.5 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Same as above, but after the user has zoomed in a few steps.
 * The click-to-document conversion must account for the active zoom so every
 * click still maps onto its corresponding path vertex.
 */
test('path vertices land on their click positions after zooming in', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomIn = page.locator('button[aria-label="Zoom in"]').first();

  for (let index = 0; index < 4; index += 1) {
    await zoomIn.click();
  }

  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.4, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.5 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.65 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Same as above, but after the user has zoomed out a few steps.
 */
test('path vertices land on their click positions after zooming out', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomOut = page.locator('button[aria-label="Zoom out"]').first();

  for (let index = 0; index < 2; index += 1) {
    await zoomOut.click();
  }

  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.4, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.5 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.65 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Combined: pan AND zoom before drawing. Both transforms must
 * compose correctly in the click-to-document conversion.
 */
test('path vertices land on their click positions after pan + zoom', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const zoomIn = page.locator('button[aria-label="Zoom in"]').first();

  for (let index = 0; index < 2; index += 1) {
    await zoomIn.click();
  }

  // Shift-drag pan from the center of the canvas area.
  const preRect = await getCanvasRootRect(page);
  const centerX = preRect.x + preRect.width / 2;
  const centerY = preRect.y + preRect.height / 2;

  await page.keyboard.down('Shift');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 60, centerY - 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  await activatePathTool(page);

  // Use the POST-pan canvas rect so click positions fall inside the shifted canvas.
  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.4, y: canvasRect.y + canvasRect.height * 0.4 },
    { x: canvasRect.x + canvasRect.width * 0.55, y: canvasRect.y + canvasRect.height * 0.55 },
    { x: canvasRect.x + canvasRect.width * 0.5, y: canvasRect.y + canvasRect.height * 0.65 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await assertPathVerticesMatchClicks(page, clicks, 2);
});

/**
 * @description Regression guard: while drawing, clicks must always land on the
 * canvas — they must not be intercepted by a leftover selection widget from a
 * prior selection. Before suppression, the widget's pointerdown hijacked clicks
 * once the growing path's bounding box extended under the widget, making all
 * existing points drag together as if the element were being moved.
 */
test('appending path points keeps growing the path instead of dragging it', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await activatePathTool(page);

  const canvasRect = await getCanvasRootRect(page);
  const clicks = [
    { x: canvasRect.x + canvasRect.width * 0.38, y: canvasRect.y + canvasRect.height * 0.32 },
    { x: canvasRect.x + canvasRect.width * 0.56, y: canvasRect.y + canvasRect.height * 0.42 },
    { x: canvasRect.x + canvasRect.width * 0.48, y: canvasRect.y + canvasRect.height * 0.58 },
    { x: canvasRect.x + canvasRect.width * 0.64, y: canvasRect.y + canvasRect.height * 0.54 },
    { x: canvasRect.x + canvasRect.width * 0.42, y: canvasRect.y + canvasRect.height * 0.68 },
  ];

  for (let index = 0; index < clicks.length; index += 1) {
    const click = clicks[index];

    if (click === undefined) continue;
    await clickAndWaitForVertex(page, click.x, click.y, index + 1);
  }

  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  const rendererHost = page.getByTestId('v1-page-preview');
  const closedPath = rendererHost.locator('svg path[d*="Z"]').last();
  const pathData = await closedPath.getAttribute('d');

  expect(pathData).not.toBeNull();

  // Five canvas clicks — first is the initial M anchor, the remaining four each
  // must append an L command. If the transform widget had hijacked any of
  // those clicks, we'd see < 4 L commands in the final path.
  const matches = (pathData ?? '').match(/L/g) ?? [];

  expect(matches.length).toBeGreaterThanOrEqual(4);
});
