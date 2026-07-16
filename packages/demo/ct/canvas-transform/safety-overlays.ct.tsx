import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function openToolbarMenu(page: Page, menuLabel: string): Promise<void> {
  await page.locator(`button[aria-label="${menuLabel}"]`).first().click();
}

async function seedPaddingAndExperimentalFlag(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__broadsetProjectEditorStore?.getState();

    if (state === undefined) throw new Error('Expected demo editor store');

    state.updateActiveDocument((document) => ({
      ...document,
      surface: { ...document.surface, padding: { top: 10, right: 10, bottom: 10, left: 10 } },
    }));
    state.updateCanvasSettings({ showExperimentalFeatures: true });
  });
}

/**
 * @description Validates `project/spec/editor/canvas.md` Safety Boundaries and
 * `project/spec/ui/modals.md` Canvas Settings Modal: viewMode buttons in the
 * modal must immediately show/hide safety overlays on the canvas.
 */
test('Canvas Settings viewMode toggles safety overlays on the canvas', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);
  await seedPaddingAndExperimentalFlag(page);

  const overlay = page.getByTestId('safety-boundaries-overlay');

  await expect(overlay).toHaveCount(0);

  await openToolbarMenu(page, 'File');
  await page.getByText('Document Settings').first().click();

  const canvasSettingsDialog = page.getByRole('dialog', { name: 'Canvas Settings' });

  await expect(canvasSettingsDialog).toBeVisible();

  await canvasSettingsDialog.getByRole('button', { name: 'broadcast' }).click();
  await expect(overlay).toHaveCount(1);
  await expect(page.getByTestId('safety-boundary-top')).toHaveAttribute('fill', 'rgba(220, 38, 38, 0.2)');
  await expect(page.getByTestId('safety-boundary-right')).toBeVisible();
  await expect(page.getByTestId('safety-boundary-bottom')).toBeVisible();
  await expect(page.getByTestId('safety-boundary-left')).toBeVisible();

  await canvasSettingsDialog.getByRole('button', { name: 'none' }).click();
  await expect(overlay).toHaveCount(0);

  await canvasSettingsDialog.getByRole('button', { name: 'print' }).click();
  await expect(overlay).toHaveCount(1);
  await expect(page.getByTestId('safety-boundary-top')).toHaveAttribute('fill', 'rgba(37, 99, 235, 0.2)');

  await canvasSettingsDialog.getByRole('button', { name: 'Done' }).click();
  await expect(canvasSettingsDialog).toHaveCount(0);
});
