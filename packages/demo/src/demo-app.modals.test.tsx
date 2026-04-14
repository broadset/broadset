/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp modal dialog integration (9-D)', () => {
  /** @description The New Document dialog must show category tabs and preset names so users can choose from a curated list of document sizes. */
  it('opens the New Document dialog with preset categories and names', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));

    const dialog = screen.getByRole('dialog', { name: /new document/i });

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('All')).toBeTruthy();
    expect(within(dialog).getByText('Broadcast')).toBeTruthy();
    expect(within(dialog).getByText('Print')).toBeTruthy();
    expect(within(dialog).getByText('Social Media')).toBeTruthy();
    expect(within(dialog).getByText('HD 1080p')).toBeTruthy();
    expect(within(dialog).getByText('A4 Portrait')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /create document/i })).toBeTruthy();
  });

  /** @description The Export dialog must show only the feature-gated exporter buttons so users see what formats are available in the current build. */
  it('opens the Export dialog with feature-gated format buttons', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));

    const dialog = screen.getByRole('dialog', { name: /export/i });

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'HTML' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'SVG' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'PDF' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'PNG' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'MP4' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'OGRAF' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'SVG-EMBEDDED' })).toBeTruthy();
  });

  /** @description The Template Browser must open from the File menu and show categorized template entries with thumbnail previews and a search field. */
  it('opens the Template Browser with categories and search', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /browse templates/i }));

    const dialog = screen.getByRole('dialog', { name: /template browser/i });

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('Lower Thirds')).toBeTruthy();
    expect(within(dialog).getByText('Full Screen')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Sports Score' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'News Ticker' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Full Screen Graphic' })).toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: /search templates/i })).toBeTruthy();
  });

  /** @description The Media Library dialog must be accessible from the File menu and show the configured demo assets. */
  it('opens the Media Library from the File menu', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /media library/i }));

    const dialog = screen.getByRole('dialog', { name: /media library/i });

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('Backgrounds')).toBeTruthy();
    expect(within(dialog).getByText('Placeholder 800×600')).toBeTruthy();
  });

  /** @description The Canvas Settings dialog must open and display controls for document name, rulers, grid, and other canvas properties. */
  it('opens the Canvas Settings dialog with property controls', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /document settings/i }));

    const dialog = screen.getByRole('dialog', { name: /canvas settings/i });

    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/rulers/i)).toBeTruthy();
    expect(within(dialog).getByText(/show grid/i)).toBeTruthy();
  });

  /** @description Each modal must close cleanly when its close/cancel button is clicked, removing the dialog from the DOM. */
  it('closes open modals when cancel is clicked', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /new document/i }));
    expect(screen.getByRole('dialog', { name: /new document/i })).toBeTruthy();

    const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
    const dialogCancel = cancelButtons.find((button) => button.closest('[role="dialog"]') !== null);

    expect(dialogCancel).toBeDefined();

    if (dialogCancel === undefined) {
      throw new Error('Cancel button not found inside dialog');
    }

    fireEvent.click(dialogCancel);
    expect(screen.queryByRole('dialog', { name: /new document/i })).toBeNull();
  });
});
