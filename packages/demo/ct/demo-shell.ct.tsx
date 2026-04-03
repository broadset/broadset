import { expect, test } from '@playwright/experimental-ct-react';

import App from '../src/App';

test.describe('Demo Shell — mount renderer', () => {
  test('fills viewport with transparent background and overflow hidden', async ({ mount, page }) => {
    const component = await mount(<App />);

    // Full viewport layout
    const body = page.locator('body');
    const overflow = await body.evaluate((el) => getComputedStyle(el).overflow);

    expect(overflow).toBe('hidden');

    // Background should be transparent (rgba with alpha 0)
    const bgColor = await component.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Transparent can be reported as 'rgba(0, 0, 0, 0)' or 'transparent'
    const isTransparent = bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)';

    expect(isTransparent).toBe(true);
  });

  test('renders sample document with all 8 element types', async ({ mount }) => {
    const component = await mount(<App />);

    // Verify data-element-id attributes exist for all sample document elements
    const elements = await component.locator('[data-element-id]').count();

    // Sample document has 14 elements total (11 on page 1 + 3 on page 2, showing page 1)
    expect(elements).toBeGreaterThanOrEqual(8);

    // Verify specific element types by their data-element-id
    await expect(component.locator('[data-element-id="el-bg-bar"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-title"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-logo"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-circle"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-icon"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-path"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-qr"]')).toBeVisible();
    await expect(component.locator('[data-element-id="el-group-score"]')).toBeVisible();
  });

  test('canvas fills available space without scrollbars', async ({ mount, page }) => {
    const component = await mount(<App />);

    const viewportSize = page.viewportSize();

    expect(viewportSize).not.toBeNull();

    if (viewportSize) {
      const box = await component.boundingBox();

      expect(box).toBeTruthy();

      if (box) {
        expect(box.width).toBeCloseTo(viewportSize.width, -1);
        expect(box.height).toBeCloseTo(viewportSize.height, -1);
      }
    }

    // No scrollbars
    const hasScrollbar = await page.evaluate(() => {
      return document.documentElement.scrollHeight > document.documentElement.clientHeight;
    });

    expect(hasScrollbar).toBe(false);
  });

  test('group element contains children', async ({ mount }) => {
    const component = await mount(<App />);

    const group = component.locator('[data-element-id="el-group-score"]');

    await expect(group).toBeVisible();

    // Children should be inside the group
    const scoreBg = group.locator('[data-element-id="el-score-bg"]');
    const homeLabel = group.locator('[data-element-id="el-home-label"]');
    const awayLabel = group.locator('[data-element-id="el-away-label"]');

    await expect(scoreBg).toBeVisible();
    await expect(homeLabel).toBeVisible();
    await expect(awayLabel).toBeVisible();
  });
});
