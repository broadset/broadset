import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

test('MP4 video export completes successfully with the v1 DOM renderer', async ({ mount, page }) => {
  test.setTimeout(180_000);
  await mount(<DemoApp />);

  await expect(page.locator('[data-broadset-canvas-root]')).toBeVisible();
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Export' }).click();

  const dialog = page.getByRole('dialog', { name: 'Export' });

  await expect(dialog).toBeVisible();

  const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });

  await dialog.getByRole('button', { name: 'Export MP4' }).click();
  await expect(dialog.getByRole('status')).toHaveText('MP4 exported', { timeout: 150_000 });

  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('broadset-page.mp4');
});
