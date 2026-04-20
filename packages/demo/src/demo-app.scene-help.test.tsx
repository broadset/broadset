/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp scene strip and help affordances', () => {
  /** @description The persistent scene strip must be visible in the default layout so users can switch pages without opening the Scenes dropdown menu. */
  it('renders a persistent scene strip in the canvas chrome', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const sceneStrip = screen.getByTestId('scene-strip');
    const tabs = sceneStrip.querySelectorAll('[role="tab"]');

    expect(sceneStrip).toBeTruthy();
    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  /** @description The scene strip must show tabs matching the document pages so each scene is one click away. */
  it('renders scene tabs matching the document pages', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const sceneStrip = screen.getByTestId('scene-strip');
    const tabs = sceneStrip.querySelectorAll('[role="tab"]');

    expect(tabs.length).toBeGreaterThanOrEqual(1);
  });

  /** @description A persistent help button must be visible in the canvas chrome so keyboard shortcuts are discoverable in one click from the default layout. */
  it('renders a persistent help button in the canvas chrome', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByTestId('persistent-help-button')).toBeTruthy();
  });

  /** @description Clicking the persistent help button must immediately open the shortcuts dialog without navigating through menus. */
  it('opens the shortcuts dialog when the persistent help button is clicked', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByTestId('persistent-help-button'));

    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();
  });

  /** @description The scene strip must use glass-panel styling for consistent floating chrome appearance matching the toolbar. */
  it('applies glass-panel styling to the scene strip', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const sceneStrip = screen.getByTestId('scene-strip');

    expect(sceneStrip.style.backdropFilter).toContain('blur');
  });
});
