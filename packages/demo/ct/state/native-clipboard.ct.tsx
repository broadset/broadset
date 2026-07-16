import { expect, test } from '@playwright/experimental-ct-react';

import { FIXTURE_IDS } from '../fixture-selectors';
import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';

test('native v1 keyboard clipboard duplicates a valid element and undo restores the project', async ({
  mount,
  page,
}) => {
  await mount(<DemoAppFresh />);

  const source = page.locator(`[data-element-id="${FIXTURE_IDS.logo}"]`).first();

  await source.click();

  const initialCount = await page.evaluate(
    () => window.__broadsetProjectEditorStore?.getState().project.documents[0]?.elements.length ?? 0,
  );

  await page.locator('body').press('Control+c');
  await page.locator('body').press('Control+v');

  await expect
    .poll(
      () =>
        page.evaluate(() => window.__broadsetProjectEditorStore?.getState().project.documents[0]?.elements.length ?? 0),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(initialCount);

  const pastedState = await page.evaluate(() => {
    const state = window.__broadsetProjectEditorStore?.getState();

    return {
      selectedName: state?.project.documents[0]?.elements.find(
        ({ id }) => id === state.activeInstanceAddresses[0]?.elementId,
      )?.name,
      semanticDiagnostics: state === undefined ? ['missing-store'] : [],
    };
  });

  expect(pastedState.selectedName).toBe('Network Bug copy');
  expect(pastedState.semanticDiagnostics).toEqual([]);

  await page.locator('body').press('Control+z');

  await expect
    .poll(() =>
      page.evaluate(() => window.__broadsetProjectEditorStore?.getState().project.documents[0]?.elements.length ?? 0),
    )
    .toBe(initialCount);
});
