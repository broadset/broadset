import { readFile } from 'node:fs/promises';

import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';

test('Save .bsp downloads a canonical v1 project', async ({ mount, page }) => {
  await mount(<DemoApp />);

  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Save .bsp' }).click();

  const download = await downloadPromise;
  const path = await download.path();

  expect(download.suggestedFilename()).toBe('broadset-project.bsp');

  const text = await readFile(path, 'utf8');
  const loaded = await projectFormatV1.loadProjectV1Json(text);

  expect(loaded.status).toBe('loaded');
});
