import { readFile } from 'node:fs/promises';

import { loadBspPackageV1 } from '@broadset/formats';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

test('Save .bsp downloads a valid native v1 project package', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Save .bsp' }).click();

  const download = await downloadPromise;
  const path = await download.path();

  expect(download.suggestedFilename()).toBe('broadset-project.bsp');

  const bytes = new Uint8Array(await readFile(path));
  const loaded = await loadBspPackageV1(bytes);

  expect(loaded.status).toBe('loaded');
});
