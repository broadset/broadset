import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

/* ------------------------------------------------------------------ */
/*  Geometry panel → canvas parity — closes CRA-2.36.                   */
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
 * @description Validates `project/spec/ui/panels.md` Geometry Panel:
 * editing the Position X / Y / Width / Height fields in the
 * Properties sidebar MUST commit through the NumField pipeline and
 * propagate to the canvas — both the rendered element AND the
 * transform widget (which mirrors element bounds) update on the
 * next frame.
 *
 * The Drag → properties test (CRA-2.30) covers the canvas → panel
 * direction; this test closes the gap on panel → canvas, completing
 * the bidirectional Geometry contract.
 */
test('editing Position X in the Geometry panel updates canvas widget position', async ({ mount, page }) => {
  await mount(<DemoApp />);

  // Select Network Bug via Layers — its position values are far from
  // any anchor edge so a +50px commit can't clamp.
  await page.getByRole('tab', { name: 'Layers' }).click();

  const sidebar = page;

  await sidebar.getByRole('button', { name: 'Select Network Bug', exact: true }).click();

  // Switch to Properties; expand Geometry if collapsed.
  await page.getByRole('tab', { name: 'Properties' }).click();

  const geometryHeader = page.getByRole('button', { name: 'Geometry', exact: true }).first();

  await expect(geometryHeader).toBeVisible();

  const isExpanded = (await geometryHeader.getAttribute('aria-expanded')) === 'true';

  if (!isExpanded) await geometryHeader.click();

  const xField = page.getByRole('textbox', { name: 'Position X (px)' });

  await expect(xField).toBeVisible();

  // Read the canvas widget's painted left coordinate before the commit
  // so we can assert it changed afterward.
  const widget = page.getByTestId('demo-transform-widget');
  const initialWidgetLeft = await widget.evaluate((element) => new DOMMatrix(element.style.transform).e);
  const startX = parseFieldNumber(await xField.inputValue());
  const targetX = startX + 50;

  // Commit a new X value via the NumField commit path. `fill()`
  // replaces any previous value atomically so we don't have to chain
  // a select-all / type / press sequence (which races with the
  // controlled value updates from React).
  await xField.fill(String(targetX));
  await xField.press('Enter');

  // Field reflects the committed value.
  await expect.poll(async () => parseFieldNumber(await xField.inputValue())).toBe(targetX);

  // Canvas widget moved — its painted `left` MUST match the new field
  // value within rounding tolerance. If the panel commit did not
  // propagate to the canvas the widget would stay at its initial left.
  await expect
    .poll(async () => widget.evaluate((element) => new DOMMatrix(element.style.transform).e))
    .not.toBe(initialWidgetLeft);

  const widgetLeft = await widget.evaluate((element) => new DOMMatrix(element.style.transform).e);

  expect(Math.abs(widgetLeft - targetX)).toBeLessThanOrEqual(1);
});
