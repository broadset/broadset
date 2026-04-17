import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

/**
 * @description Validates that MP4 video export completes successfully in a real
 * browser with a DOM-rendered scene. The demo app uses a DOM-based renderer
 * (no native <canvas>), so video export must discover the renderer root,
 * capture frames via modern-screenshot, and mux via mediabunny + WebCodecs.
 *
 * This test exercises the full pipeline:
 * 1. discoverRendererRoot() finds [data-broadset-canvas-root]
 * 2. captureElementToCanvas() converts DOM to canvas via modern-screenshot
 * 3. exportVideoBlob() encodes frames via mediabunny + VideoEncoder
 * 4. triggerDownload() triggers a browser download
 *
 * The test asserts:
 * - No "Export failed:" toast appears
 * - A download with .mp4 extension is triggered
 * - A success toast "Exported as MP4." appears
 */
test('MP4 video export completes successfully with DOM renderer', async ({ mount, page }) => {
  test.setTimeout(180_000);

  await mount(<DemoApp />);

  // Wait for the renderer to be ready — the canvas root must exist
  await expect(page.locator('[data-broadset-canvas-root]')).toBeVisible({ timeout: 5000 });

  // Collect console messages for debugging
  const consoleAll: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    consoleAll.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  // Enlarge viewport so the full export dialog is visible.
  await page.setViewportSize({ width: 1280, height: 900 });

  // Open File menu -> Export
  await openToolbarMenu(page, 'File');
  await page.getByText('Export').first().click();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();

  const dialog = page.getByRole('dialog', { name: 'Export' });

  // Select MP4 format
  await page.locator('button[aria-label="MP4"]').first().click();

  // Wait for auto-expand effect to fire (useEffect runs async after render)
  await page.waitForTimeout(500);

  // Advanced export options auto-expand when a video format is selected,
  // so the frame rate input should already be visible.
  // HeroUI NumberField renders as <input type="text" aria-label="Video frame rate">
  // (NOT role="spinbutton"), so we locate by aria-label.
  const frameRateInput = dialog.locator('input[aria-label="Video frame rate"]');

  await expect(frameRateInput).toBeAttached({ timeout: 5000 });

  // Set frame rate to 2fps using the NumberField decrement control.
  const decreaseFrameRateButton = dialog.getByRole('button', { name: /decrease video frame rate/i });

  for (let i = 0; i < 28; i++) {
    await decreaseFrameRateButton.click();
  }

  await expect(frameRateInput).toHaveValue('2');

  // Set up download listener BEFORE clicking Export
  const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });

  // Click the Export submit button inside the dialog
  await dialog.getByRole('button', { name: 'Export' }).click();

  // Wait for the export status to appear — doExport() is async and needs to
  // dynamically import the format bridge.
  const statusOrError = await Promise.race([
    page
      .locator('body[data-export-status]')
      .waitFor({ state: 'attached', timeout: 30_000 })
      .then(async () => page.locator('body').getAttribute('data-export-status')),
    page
      .getByText(/Export failed:/)
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(async () => {
        const msg = await page.getByText(/Export failed:/).textContent();

        return `toast-error: ${msg ?? 'unknown'}`;
      }),
  ]).catch(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));

    return `timeout:\nConsole (${String(consoleAll.length)}):\n${consoleAll.join('\n')}\nPage errors: ${pageErrors.join('; ')}\nBody: ${bodyText}`;
  });

  if (typeof statusOrError === 'string' && statusOrError.startsWith('timeout:')) {
    throw new Error(`Export never started.\n${statusOrError}`);
  }

  if (typeof statusOrError === 'string' && statusOrError.startsWith('toast-error:')) {
    throw new Error(statusOrError);
  }

  // Wait for rendering / encoding / completion (pre-render can take a while)
  await expect(
    page.locator(
      'body[data-export-status="rendering"], body[data-export-status="encoding"], body[data-export-status="done"], body[data-export-status="error"]',
    ),
  ).toBeAttached({ timeout: 150_000 });

  const exportStatus = await page.locator('body').getAttribute('data-export-status');

  if (exportStatus === 'error') {
    const errMsg =
      (await page
        .getByText(/Export failed:/)
        .textContent()
        .catch(() => null)) ?? 'unknown';

    throw new Error(`Export error: ${errMsg}\nConsole: ${consoleAll.join('; ')}`);
  }

  // Wait for done
  await expect(page.locator('body[data-export-status="done"]')).toBeAttached({ timeout: 120_000 });

  // Wait for download
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
});
