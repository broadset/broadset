import { expect, test } from '@playwright/experimental-ct-react';

import App from '../src/App';

test.describe('Demo — Animation playback controls', () => {
  test('play and pause buttons are visible', async ({ mount }) => {
    const component = await mount(<App />);

    const playBtn = component.locator('[data-testid="play-button"]');

    await expect(playBtn).toBeVisible();
  });

  test('clicking play switches button to pause state', async ({ mount }) => {
    const component = await mount(<App />);

    const playBtn = component.locator('[data-testid="play-button"]');

    await expect(playBtn).toHaveAttribute('data-playing', 'false');

    await playBtn.click();

    await expect(playBtn).toHaveAttribute('data-playing', 'true');
  });

  test('clicking pause switches button back to play state', async ({ mount }) => {
    const component = await mount(<App />);

    const playBtn = component.locator('[data-testid="play-button"]');

    await playBtn.click();

    await expect(playBtn).toHaveAttribute('data-playing', 'true');

    await playBtn.click();

    await expect(playBtn).toHaveAttribute('data-playing', 'false');
  });

  test('pressing play animates elements — opacity changes on animated element', async ({ mount, page }) => {
    const component = await mount(<App />);

    // el-title has an IN state timeline with opacity 0 → 1.
    // On mount, it should be seeked to t=0 (opacity = 0).
    const titleContent = component.locator('[data-element-id="el-title"] [data-element-content]');

    await expect(titleContent).toBeVisible();

    // Read initial opacity (should be 0 after seek to t=0)
    const initialOpacity = await titleContent.evaluate((el) => getComputedStyle(el).opacity);

    expect(initialOpacity).toBe('0');

    // Click play
    await component.locator('[data-testid="play-button"]').click();

    // Wait for opacity to change from 0 (animation is running)
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);

        if (!el) return false;

        return getComputedStyle(el).opacity !== '0';
      },
      '[data-element-id="el-title"] [data-element-content]',
      { timeout: 3000 },
    );
  });

  test('clicking reset restores initial state', async ({ mount, page }) => {
    const component = await mount(<App />);

    const resetBtn = component.locator('[data-testid="reset-button"]');

    await expect(resetBtn).toBeVisible();

    // Click play, wait briefly, then reset
    await component.locator('[data-testid="play-button"]').click();

    await page.waitForTimeout(200);

    await resetBtn.click();

    // After reset, animated element should be back at t=0 (opacity 0)
    const titleContent = component.locator('[data-element-id="el-title"] [data-element-content]');
    const opacity = await titleContent.evaluate((el) => getComputedStyle(el).opacity);

    expect(opacity).toBe('0');
  });

  test('browser zoom prevention — viewport overflow hidden', async ({ mount, page }) => {
    await mount(<App />);

    const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
    const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);

    expect(htmlOverflow).toBe('hidden');
    expect(bodyOverflow).toBe('hidden');
  });
});
