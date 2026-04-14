import { expect, test } from '@playwright/experimental-ct-react';

import {
  KeyframePropertyContextHarness,
  TimelineDeleteUndoHarness,
  TimelineSnapshotRestoreHarness,
} from './advanced-timeline-harnesses.helper';

/**
 * @description Validates `project/spec/ui/timeline.md` L-05: deleting a
 * selected keyframe removes it, and undo restores the removed timeline state.
 */
test('keyframe delete and undo restore timeline entry state', async ({ mount, page }) => {
  await mount(<TimelineDeleteUndoHarness />);

  await expect(page.getByTestId('timeline-keyframe-count')).toHaveText('2');
  await expect(page.getByTestId('timeline-offsets')).toHaveText('0,900');

  await page.getByRole('button', { name: 'Delete keyframe' }).click();

  await expect(page.getByTestId('timeline-keyframe-count')).toHaveText('1');
  await expect(page.getByTestId('timeline-offsets')).toHaveText('0');

  await page.getByRole('button', { name: 'Undo delete' }).click();

  await expect(page.getByTestId('timeline-keyframe-count')).toHaveText('2');
  await expect(page.getByTestId('timeline-offsets')).toHaveText('0,900');
});

/**
 * @description Validates `project/spec/ui/timeline.md` L-07: property edits
 * apply to selected keyframe context when active, otherwise update base values.
 */
test('property edit target switches between keyframe and base contexts', async ({ mount, page }) => {
  await mount(<KeyframePropertyContextHarness />);

  await expect(page.getByTestId('editing-context')).toHaveText('keyframe');
  await page.getByLabel('X property').fill('222');

  await expect(page.getByTestId('keyframe-x')).toHaveText('222');
  await expect(page.getByTestId('base-x')).toHaveText('60');

  await page.getByRole('button', { name: 'Clear keyframe context' }).click();
  await expect(page.getByTestId('editing-context')).toHaveText('base');

  await page.getByLabel('X property').fill('98');

  await expect(page.getByTestId('base-x')).toHaveText('98');
  await expect(page.getByTestId('keyframe-x')).toHaveText('none');
});

/**
 * @description Validates `project/spec/editor/timeline-playback.md` L-10:
 * snapshot restore executes before play and seek timeline actions.
 */
test('snapshot restore runs before play and seek actions', async ({ mount, page }) => {
  await mount(<TimelineSnapshotRestoreHarness />);

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByTestId('snapshot-sequence')).toHaveText('restore>play');

  const track = page.getByTestId('timeline-track');
  const trackBox = await track.boundingBox();

  if (trackBox === null) {
    throw new Error('Expected timeline track bounds');
  }

  await track.click({ position: { x: trackBox.width * 0.55, y: trackBox.height * 0.5 } });

  await expect(page.getByTestId('snapshot-sequence')).toContainText('restore>play>restore>seek');
});
