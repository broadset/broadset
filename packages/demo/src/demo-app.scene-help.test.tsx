/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp scene strip and help affordances', () => {
  /** @description The persistent scene strip must mount in the canvas chrome and expose one tab per page of the active document — not just "at least one" — with the first scene pre-selected. */
  it('renders one tab per document page, labels each, and selects the first scene by default', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const sceneStrip = screen.getByTestId('scene-strip');
    const tabs = within(sceneStrip).getAllByRole('tab');

    // The sample fixture's Match document has exactly five pages.
    expect(tabs).toHaveLength(5);

    for (const tab of tabs) {
      expect(tab.textContent.trim().length).toBeGreaterThan(0);
    }

    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');

    for (const tab of tabs.slice(1)) {
      expect(tab.getAttribute('aria-selected')).toBe('false');
    }
  });

  /** @description The persistent help button in the canvas chrome must open the shortcuts dialog directly — no menu hop, one click. */
  it('opens the keyboard shortcuts dialog when the persistent help button is clicked', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByTestId('persistent-help-button'));

    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  /** @description The scene strip must use glass-panel styling so it reads as floating chrome consistent with the rest of the toolbar stack. */
  it('applies glass-panel backdrop styling to the scene strip', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const sceneStrip = screen.getByTestId('scene-strip');

    expect(sceneStrip.style.backdropFilter).toContain('blur');
  });
});
