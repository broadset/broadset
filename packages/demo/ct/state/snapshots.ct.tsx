import { expect, test } from '@playwright/experimental-ct-react';
import type { Page } from '@playwright/test';

import { FIXTURE_IDS, FIXTURE_LAYER_LABELS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

async function openFileMenu(page: Page): Promise<void> {
  await page.locator('button[aria-label="File"]').first().click();
}

async function saveSnapshotWithName(page: Page, name: string): Promise<void> {
  page.once('dialog', (dialog) => {
    void dialog.accept(name);
  });
  await openFileMenu(page);
  await page.getByRole('menuitem').filter({ hasText: 'Save Snapshot' }).first().click();
}

/**
 * @description Validates end-to-end snapshot save/restore semantics: the
 * rollback must undo mutations that happened after save and update every
 * affected region (canvas node, layers panel row, restore entry in File
 * menu). Corresponds to the cross-region scenario backing
 * `project/spec/demo/state.md` snapshot behavior.
 */
test('save captures state, mutation diverges, restore reverts canvas and layers together', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const liveDotNode = page.locator(`[data-element-id="${FIXTURE_IDS.liveOrb}"]`);

  await expect(liveDotNode).toBeVisible();

  // --- Save a snapshot of the initial fixture state ---
  await saveSnapshotWithName(page, 'Before Delete');

  // --- Switch to Layers panel so we can observe the secondary region ---
  await page.getByRole('tab', { name: 'Layers' }).click();

  const liveDotLayer = page.getByLabel(`Select ${FIXTURE_LAYER_LABELS.liveOrb}`);

  await expect(liveDotLayer).toBeVisible();

  // --- Mutate: delete the Live Dot element. Canvas + layer row must disappear. ---
  await liveDotLayer.click();
  await page.locator('body').press('Delete');

  await expect(liveDotNode).toHaveCount(0);
  await expect(liveDotLayer).toHaveCount(0);

  // --- Restore via File menu. The named entry and snapshot counter both prove save registered. ---
  await openFileMenu(page);

  const saveSnapshotItem = page.getByRole('menuitem').filter({ hasText: 'Save Snapshot' }).first();

  await expect(saveSnapshotItem.getByText('1', { exact: true })).toBeVisible();

  await page.getByRole('menuitem').filter({ hasText: 'Before Delete' }).first().click();

  // Canvas brings the element back AND the layers panel shows the row again.
  await expect(liveDotNode).toBeVisible();
  await expect(page.getByLabel(`Select ${FIXTURE_LAYER_LABELS.liveOrb}`)).toBeVisible();
});
