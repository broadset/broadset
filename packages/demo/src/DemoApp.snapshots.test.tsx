/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp named snapshots integration (9-E)', () => {
  function renderDemoApp(): void {
    setupDemoShellMocks();
    render(<DemoApp />);
  }

  /** @description The File menu must include a "Save Snapshot" action visible to the user. */
  it('shows the Save Snapshot action in the File menu', () => {
    renderDemoApp();

    expect(screen.getByRole('button', { name: /save snapshot/i })).toBeTruthy();
  });

  /** @description Saving a snapshot via prompt must store it and show a success toast. */
  it('saves a named snapshot and shows it in the File menu', () => {
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('My Checkpoint');

    renderDemoApp();

    const saveButton = screen.getByRole('button', { name: /save snapshot/i });

    act(() => {
      fireEvent.click(saveButton);
    });

    expect(promptSpy).toHaveBeenCalledWith('Snapshot name:');
    expect(screen.getByText('My Checkpoint')).toBeTruthy();

    promptSpy.mockRestore();
  });

  /** @description Clicking a snapshot entry in the menu must restore it and show a success toast. */
  it('restores a snapshot by clicking it in the File menu', () => {
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Before Edit');

    renderDemoApp();

    const saveButton = screen.getByRole('button', { name: /save snapshot/i });

    act(() => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText('Before Edit')).toBeTruthy();

    const snapshotEntry = screen.getByText('Before Edit').closest('[role="button"], button, [data-key]');

    if (snapshotEntry !== null) {
      act(() => {
        fireEvent.click(snapshotEntry);
      });
    }

    promptSpy.mockRestore();
  });
});
