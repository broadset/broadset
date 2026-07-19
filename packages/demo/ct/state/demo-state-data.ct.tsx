import { loadBspPackageV1 } from '@broadset/formats';
import type { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { SAMPLE_PROJECT_V1 } from '../../src/sample-project-v1';
import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';
import { DemoAppStored } from '../helpers/demo-app-stored.helper';

const STORAGE_PREFIX_V1 = 'bsp-v1-base64:';

test('fills the viewport and renders the v1 sample project', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const shell = page.getByTestId('demo-shell');

  await expect(shell).toBeVisible();
  await expect(page.getByTestId('v1-page-preview')).toBeVisible();

  for (const elementId of [
    FIXTURE_IDS.background,
    FIXTURE_IDS.title,
    FIXTURE_IDS.teamHome,
    FIXTURE_IDS.teamAway,
    FIXTURE_IDS.video,
    FIXTURE_IDS.accentSvg,
    FIXTURE_IDS.accentCurve,
    FIXTURE_IDS.logo,
    FIXTURE_IDS.promoQr,
    FIXTURE_IDS.clock,
    FIXTURE_IDS.liveOrb,
    FIXTURE_IDS.ticker,
  ]) {
    await expect(page.locator(`[data-element-id="${elementId}"]`)).toBeAttached();
  }

  const shellBox = await shell.boundingBox();
  const viewport = page.viewportSize();

  expect(Math.round(shellBox?.width ?? 0)).toBeGreaterThanOrEqual(viewport?.width ?? 0);
  expect(Math.round(shellBox?.height ?? 0)).toBeGreaterThanOrEqual(viewport?.height ?? 0);
});

test('restores a complete native v1 project package from localStorage', async ({ mount, page }) => {
  const restoredProject: projectFormatV1.BroadsetProjectV1 = {
    ...SAMPLE_PROJECT_V1,
    metadata: { ...SAMPLE_PROJECT_V1.metadata, name: 'Restored v1 project' },
  };

  await mount(<DemoAppStored project={restoredProject} />);

  await expect
    .poll(() => page.evaluate(() => window.__broadsetProjectEditorStore?.getState().project.metadata.name ?? null))
    .toBe('Restored v1 project');
});

test('persists v1 scene mutations in the native project package', async ({ mount, page }) => {
  const initialPageCount = SAMPLE_PROJECT_V1.documents[0]?.pages.length ?? 0;

  await mount(<DemoAppFresh />);

  const addScene = page.getByRole('button', { name: 'Add scene' });

  await addScene.click();
  await expect(page.getByRole('tab', { name: `Scene ${String(initialPageCount + 1)}` })).toBeVisible();

  await expect
    .poll(async () => {
      const serialized = await page.evaluate(() => {
        const serialized = window.localStorage.getItem('broadset:project:v1');

        return serialized;
      });

      if (serialized?.startsWith(STORAGE_PREFIX_V1) !== true) return 0;

      const bytes = Uint8Array.from(Buffer.from(serialized.slice(STORAGE_PREFIX_V1.length), 'base64'));
      const loaded = await loadBspPackageV1(bytes);

      return loaded.status === 'loaded' ? (loaded.project.documents[0]?.pages.length ?? 0) : 0;
    })
    .toBe(initialPageCount + 1);
});

test('exposes v1 layers, animation, and data inspectors', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();

  await page.getByRole('tab', { name: 'Animation' }).click();
  await expect(page.getByRole('complementary', { name: 'Sequence editor' })).toBeVisible();

  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByRole('complementary', { name: 'Data editor' })).toBeVisible();
});

test('shows unsupported-file feedback without replacing the current project', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.getByLabel('Choose Broadset project file').setInputFiles({
    buffer: Buffer.from('unsupported'),
    mimeType: 'text/plain',
    name: 'unsupported.txt',
  });

  await expect(page.getByRole('status')).toHaveText('Unsupported project file type');
  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.initialSelection}"]`)).toBeAttached();
});

test('renders v1 clock and ticker content', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.clock}"]`)).not.toHaveText('');
  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.ticker}"]`)).not.toHaveText('');
});
