import { expect, test } from '@playwright/experimental-ct-react';

import App from '../src/App';

test.describe('Demo Shell — mount renderer', () => {
  test('fills viewport with dark theme and overflow hidden', async ({ mount, page }) => {
    const component = await mount(<App />);

    // Full viewport layout
    const body = page.locator('body');
    const overflow = await body.evaluate((el) => getComputedStyle(el).overflow);

    expect(overflow).toBe('hidden');

    // Dark theme — background should be dark
    const bgColor = await component.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Parse RGB values to check it's a dark color
    const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(bgColor);

    expect(rgbMatch).not.toBeNull();

    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      const luminance = (r + g + b) / 3;

      // Luminance below 80 = dark theme
      expect(luminance).toBeLessThan(80);
    }
  });

  test('renders sample document with all 8 element types', async ({ mount }) => {
    const component = await mount(<App />);

    // Verify data-element-id attributes exist for all sample document elements
    const elements = await component.locator('[data-element-id]').count();

    // Sample document has 13 elements total (10 on page 1 + 3 on page 2, showing page 1)
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
    const homeLabel = group.locator('[data-element-id="el-home-label"]');
    const awayLabel = group.locator('[data-element-id="el-away-label"]');

    await expect(homeLabel).toBeVisible();
    await expect(awayLabel).toBeVisible();
  });
});
