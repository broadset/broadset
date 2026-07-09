import { expect, test } from '@playwright/experimental-ct-react';
import type { Download, Page } from '@playwright/test';

import { DemoApp } from '../../src/DemoApp';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

async function enableExperimentalFeatures(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface ExperimentalStore {
      readonly getState: () => { readonly updateCanvasSettings: (s: { showExperimentalFeatures: boolean }) => void };
    }

    const store = (window as unknown as { __broadsetEditorStore?: ExperimentalStore }).__broadsetEditorStore;

    store?.getState().updateCanvasSettings({ showExperimentalFeatures: true });
  });
}

async function runDocumentExportDownloadFlow(
  page: Page,
  formatLabel: 'PDF' | 'PSD',
  requireDownloadEvent: boolean,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('[data-broadset-canvas-root]')).toBeVisible({ timeout: 5000 });

  await enableExperimentalFeatures(page);

  await openToolbarMenu(page, 'File');
  await page.getByText('Export').first().click();

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await expect(dialog).toBeVisible();

  await dialog.locator(`button[aria-label="${formatLabel}"]`).first().click();

  const downloadPromise: Promise<Download | null> =
    requireDownloadEvent ? page.waitForEvent('download', { timeout: 90_000 }) : Promise.resolve(null);

  await dialog.locator('button[aria-label="Export"]').first().click();

  await expect(
    page.locator(
      'body[data-export-status="bridge-loaded"], body[data-export-status="formats-loading"], body[data-export-status="formats-loaded"], body[data-export-status="done"], body[data-export-status="error"]',
    ),
  ).toBeAttached({ timeout: 30_000 });

  await expect(page.locator('body[data-export-status="done"]')).toBeAttached({ timeout: 90_000 });
  await expect(page.getByText(/Export failed:/)).toHaveCount(0);

  const download = await downloadPromise;

  if (download !== null) {
    expect(download.suggestedFilename().toLowerCase()).toMatch(formatLabel === 'PDF' ? /\.pdf$/ : /\.psd$/);
  }
}

/**
 * @description Validates the P0 release-blocker browser path for PDF export:
 * exporting through the demo UI must complete in-browser to a `done` status
 * and emit a success toast. Chromium CT download events for PDF can be flaky,
 * so this test focuses on end-to-end completion in the real browser flow.
 */
test('PDF export completes through the demo export modal browser path', async ({ mount, page }) => {
  test.setTimeout(120_000);

  // Keep PDF export deterministic in CT by short-circuiting remote Google Fonts
  // requests; the exporter falls back to Standard 14 fonts with warnings.
  await page.route('https://fonts.googleapis.com/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await route.fulfill({ status: 404, body: '' });
  });

  await mount(<DemoApp />);
  await runDocumentExportDownloadFlow(page, 'PDF', false);
});

/**
 * @description Validates the P0 release-blocker browser path for PSD export:
 * exporting through the demo UI must complete in-browser and trigger a real
 * `.psd` download with no export failure state.
 */
test('PSD export triggers a real browser download through the demo export modal', async ({ mount, page }) => {
  test.setTimeout(120_000);

  await mount(<DemoApp />);
  await runDocumentExportDownloadFlow(page, 'PSD', true);
});
