import { expect, test } from '@playwright/experimental-ct-react';

import { TimelineHarness, ToolbarHarness } from './toolbar-timeline.stories';

test.describe('UI package component tests', () => {
  /** @description The UI package must own browser-level coverage for toolbar actions and toggle state, not rely solely on demo integration tests. */
  test('EditorToolbar dispatches browser clicks and updates visible state', async ({ mount }) => {
    const component = await mount(<ToolbarHarness />);

    await expect(component.getByRole('toolbar', { name: /editor toolbar/i })).toBeVisible();
    await expect(component.getByRole('button', { name: /undo/i })).toBeDisabled();
    await component.getByRole('button', { name: /redo/i }).click();
    await component.getByRole('button', { name: /toggle grid/i }).click();

    await expect(component.getByLabel('Redo count')).toHaveText('1');
    await expect(component.getByLabel('Grid state')).toHaveText('on');
  });

  /** @description The UI package must own browser-level coverage for the timeline editor's add-keyframe and seek interactions. */
  test('TimelineEditor adds a keyframe and seeks when the track is clicked', async ({ mount }) => {
    const component = await mount(<TimelineHarness />);

    await expect(component.getByTestId('timeline-track')).toBeVisible();
    await expect(component.getByTestId('keyframe-marker')).toHaveCount(2);
    await component.getByRole('button', { name: /add keyframe/i }).click();
    await expect(component.getByTestId('keyframe-marker')).toHaveCount(3);
    await component.getByTestId('timeline-track').click({ position: { x: 360, y: 20 } });
    await expect(component.getByLabel('Seek value')).not.toHaveText('idle');
  });
});
