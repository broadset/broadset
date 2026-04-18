import { expect, test } from '@playwright/experimental-ct-react';

import { DemoAppFresh } from '../helpers/demo-app-fresh.helper';
import {
  CanvasSettingsHarness,
  ExportHarness,
  GuidePositionHarness,
  MediaLibraryHarness,
  NewDocumentHarness,
  TemplateBrowserHarness,
} from './modal-harnesses.helper';

/**
 * @description Validates `project/spec/ui/modals.md` M-01 from real toolbar flow:
 * Help menu opens Shortcut/About modals and both close via Escape or close button.
 */
test('toolbar actions open Shortcut and About modals with expected close behavior', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.locator('button[aria-label="Help"]').first().click();
  await page.getByText('Keyboard shortcuts').first().click();

  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0);

  await page.locator('button[aria-label="Help"]').first().click();
  await page.getByText('About').first().click();

  const dialog = page.getByRole('dialog', { name: 'Broadset' });

  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Broadset' })).toHaveCount(0);
});

/**
 * @description Validates `project/spec/ui/modals.md` M-02: Canvas Settings inputs
 * dispatch immediate updates for document fields and view toggles.
 */
test('Canvas Settings modal controls update state immediately', async ({ mount, page }) => {
  await mount(<CanvasSettingsHarness />);

  await page.getByLabel('Document name').fill('Final Program');

  const showRulers = page.getByRole('switch', { name: 'Show rulers' });

  await showRulers.focus();
  await page.keyboard.press('Space');
  await page.getByLabel('print').click();

  const showGrid = page.getByRole('switch', { name: 'Show grid' });

  await showGrid.focus();
  await page.keyboard.press('Space');

  await expect(page.getByTestId('settings-state')).toHaveText('Final Program|false|px|print|false');
});

/**
 * @description Validates `project/spec/ui/modals.md` M-03: Export modal only shows
 * enabled formats and emits selected exporter + data payload.
 */
test('Export modal gates formats and emits exporter payload', async ({ mount, page }) => {
  await mount(<ExportHarness />);

  await expect(page.getByRole('button', { name: 'PNG' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'HTML' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PSD' })).toHaveCount(0);

  const exportButton = page.getByRole('button', { name: 'Export' }).first();

  await expect(exportButton).toBeDisabled();
  await page.getByRole('button', { name: 'PNG' }).click();
  await expect(exportButton).toBeEnabled();

  await exportButton.click();
  await expect(page.getByTestId('export-payload')).toHaveText(/"exporter":"png"/);
  await expect(page.getByTestId('export-payload')).toHaveText(/"score":3/);
});

/**
 * @description Validates `project/spec/ui/modals.md` M-04: Media Library supports
 * search/category filtering, selection gating, and upload trigger callbacks.
 */
test('Media Library search, category filter, select gating, and upload flow work', async ({ mount, page }) => {
  await mount(<MediaLibraryHarness />);

  await page.getByLabel('Search media').fill('logo');
  await expect(page.getByRole('button', { name: 'Arena Logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Player Photo' })).toHaveCount(0);

  await page.getByLabel('Search media').fill('');
  await page.getByRole('tab', { name: 'Photos' }).click();
  await expect(page.getByRole('button', { name: 'Player Photo' })).toBeVisible();

  const selectButton = page.getByRole('button', { name: 'Select' }).first();

  await expect(selectButton).toBeDisabled();
  await page.getByRole('button', { name: 'Player Photo' }).click();
  await expect(selectButton).toBeEnabled();

  await selectButton.click();
  await expect(page.getByTestId('media-selected')).toHaveText('a-photo');

  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByTestId('media-uploads')).toHaveText('1');
});

/**
 * @description Validates `project/spec/ui/modals.md` M-05 (New Document):
 * create stays disabled until a preset row is selected.
 */
test('New Document flow enforces preset selection before create', async ({ mount, page }) => {
  await mount(<NewDocumentHarness />);

  const createDocument = page.getByRole('button', { name: 'Create document' }).first();

  await expect(createDocument).toBeDisabled();
  await page.getByRole('row', { name: /HD Broadcast/i }).click();
  await expect(createDocument).toBeEnabled();
  await createDocument.click();
  await expect(page.getByTestId('new-document-created')).toHaveText('HD Broadcast');
});

/**
 * @description Validates `project/spec/ui/modals.md` M-05 (Template Browser):
 * create stays disabled until a template is selected and unsaved confirmation gates final creation.
 */
test('Template Browser enforces selection and unsaved confirmation', async ({ mount, page }) => {
  await mount(<TemplateBrowserHarness />);

  const createTemplate = page.getByRole('button', { name: 'Create from template' }).first();

  await expect(createTemplate).toBeDisabled();
  await page.getByRole('button', { name: 'Live Show' }).click();
  await expect(createTemplate).toBeEnabled();
  await createTemplate.click();

  await expect(page.getByLabel('Confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Discard & Create' }).click();
  await expect(page.getByTestId('template-created')).toHaveText('tpl-live');
});

/**
 * @description Validates `project/spec/ui/modals.md` M-06: Guide Position modal
 * apply/delete actions and Enter-key apply behavior.
 */
test('Guide Position modal apply/delete controls and keyboard commit work', async ({ mount, page }) => {
  await mount(<GuidePositionHarness />);

  const input = page.getByRole('textbox', { name: 'Position (px)' });

  await input.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('guide-applies')).toHaveText('1');

  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('guide-applies')).toHaveText('2');

  await page.getByRole('button', { name: 'Delete guide' }).click();
  await expect(page.getByTestId('guide-deletes')).toHaveText('1');
});

/**
 * @description Validates `project/spec/ui/modals.md` M-07: modal focus remains in
 * dialog during Tab navigation and Escape restores focus to the opening trigger.
 */
test('About modal traps focus and restores trigger focus on escape', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  const helpButton = page.locator('button[aria-label="Help"]').first();

  await helpButton.click();
  await page.getByText('About').first().click();

  const dialog = page.getByRole('dialog', { name: 'Broadset' });

  await expect(dialog).toBeVisible();

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const active = document.activeElement;
          const modal = document.querySelector('[role="dialog"][aria-label="Broadset"]');

          return active !== null && modal?.contains(active) === true;
        }),
      )
      .toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(helpButton).toBeFocused();
});

/**
 * @description Validates `project/spec/ui/modals.md` M-08 runtime ARIA contract:
 * modal dialogs expose dialog role, modal state, and accessible name.
 */
test('modals expose dialog role, aria-modal, and accessible naming metadata', async ({ mount, page }) => {
  await mount(<DemoAppFresh />);

  await page.locator('button[aria-label="Help"]').first().click();
  await page.getByText('About').first().click();

  const dialog = page.getByRole('dialog', { name: 'Broadset' });

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('aria-label', 'Broadset');
});
