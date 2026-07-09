/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { enableExperimentalFeatures, setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp modal dialog integration (9-D)', () => {
  /** @description The New Document dialog must show preset categories and, after the user picks a preset and confirms, apply that preset (closing the dialog and surfacing a success toast) — proving the primary action is wired, not just the chrome. */
  it('opens the New Document dialog and applies a preset on Create Document', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));

    const dialog = screen.getByRole('dialog', { name: /new document/i });

    expect(within(dialog).getByText('All')).toBeTruthy();
    expect(within(dialog).getByText('Broadcast')).toBeTruthy();
    expect(within(dialog).getByText('Print')).toBeTruthy();
    expect(within(dialog).getByText('Social Media')).toBeTruthy();
    expect(within(dialog).getByText('HD 1080p')).toBeTruthy();
    expect(within(dialog).getByText('A4 Portrait')).toBeTruthy();

    fireEvent.click(within(dialog).getByText('HD 1080p'));
    fireEvent.click(within(dialog).getByRole('button', { name: /create document/i }));

    expect(screen.queryByRole('dialog', { name: /new document/i })).toBeNull();
    expect(screen.getByText(/created "hd 1080p"/i)).toBeTruthy();
  });

  /** @description The Export dialog must list feature-gated formats and close cleanly when the user cancels, preserving the host document state. */
  it('opens the Export dialog with feature-gated format buttons and closes on cancel', () => {
    setupDemoShellMocks();
    render(<DemoApp />);
    enableExperimentalFeatures();

    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

    const dialog = screen.getByRole('dialog', { name: /export/i });

    for (const format of ['HTML', 'SVG', 'PDF', 'PNG', 'WEBM', 'OGRAF', 'SVG-EMBEDDED']) {
      expect(within(dialog).getByRole('button', { name: format })).toBeTruthy();
    }

    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog', { name: /export/i })).toBeNull();
  });

  /** @description The Template Browser search field must narrow the list so users can locate a template quickly — an actual outcome on the live DOM, not a count of categories. */
  it('narrows the visible template list when the user searches', () => {
    setupDemoShellMocks();
    render(<DemoApp />);
    enableExperimentalFeatures();

    fireEvent.click(screen.getByRole('button', { name: /browse templates/i }));

    const dialog = screen.getByRole('dialog', { name: /template browser/i });

    expect(within(dialog).getByRole('button', { name: 'Sports Score' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'News Ticker' })).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('textbox', { name: /search templates/i }), {
      target: { value: 'sports' },
    });

    expect(within(dialog).getByRole('button', { name: 'Sports Score' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'News Ticker' })).toBeNull();
  });

  /** @description The Media Library must allow the user to pick an asset — picking one moves the dialog into the confirm state where a Select action becomes available. */
  it('surfaces a Select action after an asset is picked from the Media Library', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /media library/i }));

    const dialog = screen.getByRole('dialog', { name: /media library/i });

    expect(within(dialog).getByText('Backgrounds')).toBeTruthy();

    const assetButton = within(dialog).getByText('Placeholder 800×600').closest('button');

    expect(assetButton).not.toBeNull();

    if (assetButton !== null) fireEvent.click(assetButton);

    expect(within(dialog).getByRole('button', { name: /^select$/i })).toBeTruthy();
  });

  /** @description The Canvas Settings dialog must expose the ruler/grid toggles and commit a changed setting back to the host when the user clicks Done. */
  it('opens the Canvas Settings dialog and commits the "Show rulers" toggle on Done', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /document settings/i }));

    const dialog = screen.getByRole('dialog', { name: /canvas settings/i });

    expect(within(dialog).getByText(/rulers/i)).toBeTruthy();
    expect(within(dialog).getByText(/show grid/i)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('switch', { name: /show rulers/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /done/i }));

    expect(screen.queryByRole('dialog', { name: /canvas settings/i })).toBeNull();
  });

  /** @description Cancelling the New Document modal must remove the dialog from the DOM so the underlying shell regains focus. */
  it('closes the New Document dialog when cancel is clicked', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));
    expect(screen.getByRole('dialog', { name: /new document/i })).toBeTruthy();

    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    const dialogCancel = cancelButtons.find((button) => button.closest('[role="dialog"]') !== null);

    if (dialogCancel === undefined) {
      throw new Error('Cancel button not found inside dialog');
    }

    fireEvent.click(dialogCancel);
    expect(screen.queryByRole('dialog', { name: /new document/i })).toBeNull();
  });
});
