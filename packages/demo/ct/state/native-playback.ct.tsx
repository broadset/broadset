import { expect, test } from '@playwright/experimental-ct-react';

import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

test('native v1 animation transport plays, seeks exact ticks, and resets the resolved canvas', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  const liveDot = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"]`).first();
  const play = page.getByRole('button', { name: 'Play Live Pulse' });

  await expect(play).toBeVisible();
  await play.click();

  await expect
    .poll(() => page.evaluate(() => window.__broadsetProjectEditorStore?.getState().playbackTick ?? 0))
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause Live Pulse' }).click();
  await page.evaluate(() => {
    window.__broadsetProjectEditorStore?.getState().seekPlaybackTick(800);
  });

  await expect.poll(() => liveDot.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.15');

  await page.getByRole('button', { name: 'Reset Live Pulse' }).click();

  await expect.poll(() => liveDot.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  await expect(page.getByText('0 / 800')).toBeVisible();
});
