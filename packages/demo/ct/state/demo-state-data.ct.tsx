import { projectFormatV1 } from '@broadset/model';
import { expect, test } from '@playwright/experimental-ct-react';

import { DemoApp } from '../../src/DemoApp';
import { SAMPLE_PROJECT_V1 } from '../../src/sample-project-v1';
import { FIXTURE_IDS } from '../fixture-selectors';

test('fills the viewport and renders the v1 sample project', async ({ mount, page }) => {
  await mount(<DemoApp />);

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

test('restores a canonical v1 project from localStorage', async ({ mount, page }) => {
  const restoredProject: projectFormatV1.BroadsetProjectV1 = {
    ...SAMPLE_PROJECT_V1,
    metadata: { ...SAMPLE_PROJECT_V1.metadata, name: 'Restored v1 project' },
  };

  await page.evaluate((serialized) => {
    window.localStorage.setItem('broadset:project:v1', serialized);
  }, projectFormatV1.canonicalizeProjectV1(restoredProject));
  await mount(<DemoApp />);

  await expect
    .poll(() => page.evaluate(() => window.__broadsetProjectEditorStore?.getState().project.metadata.name ?? null))
    .toBe('Restored v1 project');
});

test('persists v1 scene mutations as canonical project JSON', async ({ mount, page }) => {
  const initialPageCount = SAMPLE_PROJECT_V1.documents[0]?.pages.length ?? 0;

  await mount(<DemoApp />);

  const addScene = page.getByRole('button', { name: 'Add scene' });

  await addScene.click();
  await expect(page.getByRole('tab', { name: `Scene ${String(initialPageCount + 1)}` })).toBeVisible();

  await expect
    .poll(async () => {
      const serialized = await page.evaluate(() => {
        const serialized = window.localStorage.getItem('broadset:project:v1');

        return serialized;
      });

      if (serialized === null) return 0;

      return projectFormatV1.broadsetProjectV1Schema.parse(JSON.parse(serialized)).documents[0]?.pages.length ?? 0;
    })
    .toBe(initialPageCount + 1);
});

test('exposes v1 layers, animation, and data inspectors', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.getByRole('tab', { name: 'Layers' }).click();
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();

  await page.getByRole('tab', { name: 'Animation' }).click();
  await expect(page.getByRole('complementary', { name: 'Sequence editor' })).toBeVisible();

  await page.getByRole('tab', { name: 'Data' }).click();
  await expect(page.getByRole('complementary', { name: 'Data editor' })).toBeVisible();
});

test('shows unsupported-file feedback without replacing the current project', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await page.getByLabel('Choose Broadset project file').setInputFiles({
    buffer: Buffer.from('unsupported'),
    mimeType: 'text/plain',
    name: 'unsupported.txt',
  });

  await expect(page.getByRole('status')).toHaveText('Unsupported project file type');
  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.initialSelection}"]`)).toBeAttached();
});

test('renders v1 clock and ticker content', async ({ mount, page }) => {
  await mount(<DemoApp />);

  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.clock}"]`)).not.toHaveText('');
  await expect(page.locator(`[data-element-id="${FIXTURE_IDS.ticker}"]`)).not.toHaveText('');
});
