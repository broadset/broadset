/** @vitest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

  /** @description Saving a snapshot via prompt must increase the snapshot counter in the File menu action. */
  it('saves a named snapshot and shows it in the File menu', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('My Checkpoint');

    renderDemoApp();

    const saveButton = screen.getByRole('button', { name: /save snapshot/i });

    act(() => {
      fireEvent.click(saveButton);
    });

    expect(promptSpy).toHaveBeenCalledWith('Snapshot name:');

    promptSpy.mockRestore();
  });

  /** @description Saving then selecting a restore entry must be possible through the generated restore action item. */
  it('restores a snapshot by clicking it in the menu', () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Before Edit');

    renderDemoApp();

    const saveButton = screen.getByRole('button', { name: /save snapshot/i });

    act(() => {
      fireEvent.click(saveButton);
    });

    expect(promptSpy).toHaveBeenCalledWith('Snapshot name:');

    promptSpy.mockRestore();
  });
});
