import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

/* ------------------------------------------------------------------ */
/*  Drag → properties parity — closes CRA-2.30.                         */
/* ------------------------------------------------------------------ */

/**
 * Strip locale grouping separators ("1,808" → 1808) before parsing.
 * react-aria's `NumberField` (used by HeroUI) formats numeric values
 * with `Intl.NumberFormat` so `parseFloat` would otherwise read only
 * the leading digit on values ≥ 1000.
 */
function parseFieldNumber(input: string): number {
  return parseFloat(input.replace(/[^\d.\-+eE]/g, ''));
}

/**
 * @description Validates `project/spec/editor/transforms.md` Drag
 * Translation: dragging an element on the canvas via the transform
 * widget MUST commit a new position that the Properties panel
 * Geometry section reflects via its X / Y fields. Existing CT
 * coverage asserts only that the widget moves; this test closes the
 * gap by additionally reading the Geometry panel post-drop and
 * comparing the field values to the canvas widget's inline `left` /
 * `top` (the canonical pixel coordinates the renderer paints).
 */
test('dragging an element commits new X/Y values into the Geometry panel', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select the network bug via the layers panel — same path the
  // panel-to-canvas-parity tests exercise, with a known stable Geometry
  // sidebar binding.
  await page.locator('button[aria-label="Layers"]').first().click();

  const sidebar = page.getByTestId('demo-properties-sidebar');

  await sidebar.getByRole('button', { name: 'Select Network Bug', exact: true }).click();

  const widget = page.getByTestId('demo-transform-widget');

  await expect(widget).toBeVisible();

  // Switch to the Properties tab so the Geometry section is rendered.
  await page.locator('button[aria-label="Properties"]').first().click();

  // Geometry lives inside an Accordion; expand it if collapsed.
  const geometryHeader = page.getByRole('button', { name: 'Geometry', exact: true }).first();

  await expect(geometryHeader).toBeVisible();

  const isExpanded = (await geometryHeader.getAttribute('aria-expanded')) === 'true';

  if (!isExpanded) await geometryHeader.click();

  const xField = page.getByRole('textbox', { name: 'Position X (px)' });
  const yField = page.getByRole('textbox', { name: 'Position Y (px)' });

  await expect(xField).toBeVisible();
  await expect(yField).toBeVisible();

  // Capture initial X/Y from both regions.
  const startX = parseFieldNumber(await xField.inputValue());
  const startY = parseFieldNumber(await yField.inputValue());

  expect(Number.isFinite(startX)).toBe(true);
  expect(Number.isFinite(startY)).toBe(true);

  // Drag the bounds rectangle by a known offset.
  const bounds = page.getByTestId('transform-bounds');
  const boundsBox = await bounds.boundingBox();

  if (boundsBox === null) throw new Error('transform bounds not found');

  const startScreenX = boundsBox.x + boundsBox.width / 2;
  const startScreenY = boundsBox.y + boundsBox.height / 2;
  const dragDx = 60;
  const dragDy = 40;

  await page.mouse.move(startScreenX, startScreenY);
  await page.mouse.down();
  await page.mouse.move(startScreenX + dragDx, startScreenY + dragDy, { steps: 8 });
  await page.mouse.up();

  // After commit, the Geometry fields MUST update to reflect the drop.
  // Use polling because the commit pipeline runs through React state
  // and there's a brief frame between pointer-up and field update.
  await expect.poll(async () => parseFieldNumber(await xField.inputValue())).toBeGreaterThan(startX);
  await expect.poll(async () => parseFieldNumber(await yField.inputValue())).toBeGreaterThan(startY);

  // Cross-region parity: the new field values MUST match the canvas
  // widget's painted position within rounding tolerance. The widget's
  // inline `left` / `top` carry the canonical px coordinates the
  // renderer uses, so this assertion ties properties → canvas exactly.
  const widgetLeft = await widget.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const widgetTop = await widget.evaluate((el) => parseFloat((el as HTMLElement).style.top));
  const fieldX = parseFieldNumber(await xField.inputValue());
  const fieldY = parseFieldNumber(await yField.inputValue());

  expect(Math.abs(fieldX - widgetLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(fieldY - widgetTop)).toBeLessThanOrEqual(1);
});
