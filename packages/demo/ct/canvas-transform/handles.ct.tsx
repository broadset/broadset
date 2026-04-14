import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';
import { FIXTURE_IDS } from '../fixture-selectors';

/*  Direct canvas click selection                                      */
/* ------------------------------------------------------------------ */

/**
 * @description Validates `project/spec/editor/canvas.md` C-02 behavior:
 * clicking empty canvas space clears selection, hides the transform widget,
 * and disables selection-dependent sidebar tabs.
 */
test('clicking empty canvas space clears selection and disables dependent sidebar tabs', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();

  const preview = page.getByLabel(/screen preview for/i);

  // The sample document includes a full-stage background hit target, so a
  // pointer click usually lands on an element. Dispatching a click on the
  // preview root exercises the explicit "clear selection" branch.
  await preview.dispatchEvent('click');

  await expect(page.getByTestId('demo-transform-widget')).toHaveCount(0);
  await expect(page.locator('button[aria-label="Properties"]').first()).toBeDisabled();
  await expect(page.locator('button[aria-label="Animation"]').first()).toBeDisabled();
});

/**
 * @description Validates `project/spec/editor/editing.md` C-08 behavior:
 * click-only placement uses default element dimensions and selects the newly
 * placed element so transform controls attach immediately.
 */
test('click-only placement creates a default-size rectangle and selects it', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const idsBefore = await page
    .locator('[data-element-id]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.getAttribute('data-element-id')).filter((id) => id !== null)),
    ]);

  await page.locator('button[aria-label="Rectangle"]').first().click();
  await expect(page.getByTestId('placement-mode-banner')).toContainText('Rectangle');

  const preview = page.getByLabel(/screen preview for/i);
  const previewBox = await preview.boundingBox();

  if (previewBox === null) {
    throw new Error('Preview bounding box not found');
  }

  const clickOffsetX = previewBox.width * 0.28;
  const clickOffsetY = previewBox.height * 0.78;

  await preview.click({ position: { x: clickOffsetX, y: clickOffsetY } });

  await expect(page.getByTestId('placement-mode-banner')).toBeHidden();

  const idsAfter = await page
    .locator('[data-element-id]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.getAttribute('data-element-id')).filter((id) => id !== null)),
    ]);
  const newElementId = idsAfter.find((id) => !idsBefore.includes(id));

  if (newElementId === undefined) {
    throw new Error('No new element ID found after click-only placement');
  }

  const newElement = page.locator(`[data-element-id="${newElementId}"]`);
  const newBox = await newElement.boundingBox();
  const widgetBox = await page.getByTestId('demo-transform-widget').boundingBox();

  if (newBox === null || widgetBox === null) {
    throw new Error('Placed element or transform widget bounding box not found');
  }

  expect(widgetBox.x).toBeCloseTo(newBox.x, -1);
  expect(widgetBox.y).toBeCloseTo(newBox.y, -1);
  expect(widgetBox.width).toBeCloseTo(newBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(newBox.height, -1);

  // Default rectangle should preserve the model default 80:50 aspect ratio.
  expect(newBox.width).toBeGreaterThan(20);
  expect(newBox.height).toBeGreaterThan(12);
  expect(newBox.width / newBox.height).toBeCloseTo(80 / 50, 1);

  // Placement selects the new element immediately.
  await expect(page.getByTestId('demo-transform-widget')).toBeVisible();
});

/**
 * @description Validates that clicking a canvas element directly (not via
 * the layers panel) selects it and repositions the transform widget to
 * visually overlay that element's bounds. Uses el-logo-image which is
 * isolated in the bottom-right and not obscured by any other element.
 */
test('clicking a canvas element directly selects it and shows the widget at its bounds', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  // Verify initial auto-selection is el-score-title — widget overlays rendered element
  await expect(widget).toBeVisible();

  const ribbonEl = page.locator(`[data-element-id="${FIXTURE_IDS.title}"]`);
  const ribbonBox = await ribbonEl.boundingBox();
  const widgetBox = await widget.boundingBox();

  if (ribbonBox === null || widgetBox === null) {
    throw new Error('Element or widget bounding box not found');
  }

  expect(widgetBox.x).toBeCloseTo(ribbonBox.x, -1);
  expect(widgetBox.y).toBeCloseTo(ribbonBox.y, -1);
  expect(widgetBox.width).toBeCloseTo(ribbonBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(ribbonBox.height, -1);

  // Click el-logo-image which is isolated in the bottom-right (far from widget)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await expect(sponsorLogo).toBeVisible();
  await sponsorLogo.click();

  // Widget should reposition to visually overlay el-logo-image
  const logoBox = await sponsorLogo.boundingBox();
  const newWidgetBox = await widget.boundingBox();

  if (logoBox === null || newWidgetBox === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(newWidgetBox.x).toBeCloseTo(logoBox.x, -1);
  expect(newWidgetBox.y).toBeCloseTo(logoBox.y, -1);
  expect(newWidgetBox.width).toBeCloseTo(logoBox.width, -1);
  expect(newWidgetBox.height).toBeCloseTo(logoBox.height, -1);
});

/**
 * @description Validates that clicking a second canvas element outside the
 * first widget area switches selection. After selecting el-logo-image,
 * clicking el-live-ellipse (isolated on the right) should reposition the widget.
 */
test('clicking another canvas element switches the selection and widget position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-logo-image first (isolated bottom-right, outside ribbon widget)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await sponsorLogo.click();

  const logoBox = await sponsorLogo.boundingBox();
  const widgetAfterLogo = await widget.boundingBox();

  if (logoBox === null || widgetAfterLogo === null) {
    throw new Error('Logo or widget bounding box not found');
  }

  expect(widgetAfterLogo.x).toBeCloseTo(logoBox.x, -1);
  expect(widgetAfterLogo.y).toBeCloseTo(logoBox.y, -1);

  // Now click el-live-ellipse (isolated on the right, outside sponsor-logo widget)
  const heroBadge = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"]`);

  await expect(heroBadge).toBeVisible();
  await heroBadge.click();

  const badgeBox = await heroBadge.boundingBox();
  const widgetAfterBadge = await widget.boundingBox();

  if (badgeBox === null || widgetAfterBadge === null) {
    throw new Error('Widget bounding box not found after badge click');
  }

  // Widget should overlay el-live-ellipse
  expect(widgetAfterBadge.x).toBeCloseTo(badgeBox.x, -1);
  expect(widgetAfterBadge.y).toBeCloseTo(badgeBox.y, -1);
  expect(widgetAfterBadge.width).toBeCloseTo(badgeBox.width, -1);
  expect(widgetAfterBadge.height).toBeCloseTo(badgeBox.height, -1);
});

/* ------------------------------------------------------------------ */
/*  Handle position verification                                       */
/* ------------------------------------------------------------------ */

/**
 * @description Validates that all 8 resize handles are positioned at the
 * correct locations relative to the widget bounds. Handles are 10×10 px
 * circles positioned at corners and edge midpoints within the widget.
 */
test('resize handles are positioned at correct locations relative to the widget', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const widgetBox = await widget.boundingBox();

  if (widgetBox === null) {
    throw new Error('Widget bounding box not found');
  }

  const tolerance = 3;
  // Handles are positioned with CSS left/right/top/bottom: -5px and
  // transform: translate(±50%, ±50%), placing their centers 5px outside
  // the widget edge (half the 10px handle size).
  const offset = 5;

  const checkHandle = async (handle: string, expectedCenterX: number, expectedCenterY: number): Promise<void> => {
    const handleEl = page.getByTestId(`transform-handle-${handle}`);
    const handleBox = await handleEl.boundingBox();

    if (handleBox === null) {
      throw new Error(`Handle ${handle} bounding box not found`);
    }

    const handleCenterX = handleBox.x + handleBox.width / 2;
    const handleCenterY = handleBox.y + handleBox.height / 2;

    expect(handleCenterX).toBeCloseTo(expectedCenterX, -Math.log10(tolerance));
    expect(handleCenterY).toBeCloseTo(expectedCenterY, -Math.log10(tolerance));
  };

  // Corner handles: center offset 5px outside widget corner
  // Edge handles: center on edge midpoint, offset 5px outward
  await checkHandle('nw', widgetBox.x - offset, widgetBox.y - offset);
  await checkHandle('n', widgetBox.x + widgetBox.width / 2, widgetBox.y - offset);
  await checkHandle('ne', widgetBox.x + widgetBox.width + offset, widgetBox.y - offset);
  await checkHandle('e', widgetBox.x + widgetBox.width + offset, widgetBox.y + widgetBox.height / 2);
  await checkHandle('se', widgetBox.x + widgetBox.width + offset, widgetBox.y + widgetBox.height + offset);
  await checkHandle('s', widgetBox.x + widgetBox.width / 2, widgetBox.y + widgetBox.height + offset);
  await checkHandle('sw', widgetBox.x - offset, widgetBox.y + widgetBox.height + offset);
  await checkHandle('w', widgetBox.x - offset, widgetBox.y + widgetBox.height / 2);
});

/**
 * @description Validates that the rotation handle is positioned above the
 * widget's top-center by the ROTATION_HANDLE_OFFSET (28px) distance.
 */
test('rotation handle is positioned above the widget top-center', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  const widgetBox = await widget.boundingBox();
  const rotationHandle = page.getByTestId('transform-rotation-handle');
  const rotationBox = await rotationHandle.boundingBox();

  if (widgetBox === null || rotationBox === null) {
    throw new Error('Widget or rotation handle bounding box not found');
  }

  const rotationCenterX = rotationBox.x + rotationBox.width / 2;
  const rotationCenterY = rotationBox.y + rotationBox.height / 2;
  const widgetTopCenterX = widgetBox.x + widgetBox.width / 2;

  expect(rotationCenterX).toBeCloseTo(widgetTopCenterX, 0);
  // Rotation handle center is 28px above widget top edge
  expect(rotationCenterY).toBeCloseTo(widgetBox.y - 28, 0);
});

/**
 * @description Validates that handle positions update correctly when selecting
 * a different, smaller element. After selecting el-live-ellipse (96×96 doc-space),
 * the widget and handle positions should match the smaller element's bounds.
 */
test('handles reposition correctly for a small element selected via canvas click', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Click el-logo-image (isolated bottom-right, not obscured)
  const sponsorLogo = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`);

  await sponsorLogo.click();

  const widgetBox = await widget.boundingBox();
  const logoBox = await sponsorLogo.boundingBox();

  if (widgetBox === null || logoBox === null) {
    throw new Error('Widget or logo bounding box not found');
  }

  // Widget dimensions should match the rendered logo element
  expect(widgetBox.width).toBeCloseTo(logoBox.width, -1);
  expect(widgetBox.height).toBeCloseTo(logoBox.height, -1);

  // East handle at right edge, west handle at left edge
  const eastHandle = page.getByTestId('transform-handle-e');
  const westHandle = page.getByTestId('transform-handle-w');
  const eastBox = await eastHandle.boundingBox();
  const westBox = await westHandle.boundingBox();

  if (eastBox === null || westBox === null) {
    throw new Error('Handle bounding box not found');
  }

  const eastCenterX = eastBox.x + eastBox.width / 2;
  const westCenterX = westBox.x + westBox.width / 2;

  // East handle center is 5px outside widget right edge (CSS translate offset)
  expect(eastCenterX).toBeCloseTo(widgetBox.x + widgetBox.width + 5, 1);
  // West handle center is 5px outside widget left edge
  expect(westCenterX).toBeCloseTo(widgetBox.x - 5, 1);
  // Distance between east and west handle centers should equal widget width + 10
  expect(eastCenterX - westCenterX).toBeCloseTo(widgetBox.width + 10, 0);
});
