/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('9-F: Preflight Diagnostics', () => {
  function renderDemoApp(): void {
    setupDemoShellMocks();
    render(<DemoApp />);
  }

  /** @description The Pre-flight sidebar tab must show the preflight panel with issue results. */
  it('shows the preflight panel when the Pre-flight tab is clicked', () => {
    renderDemoApp();

    const sidebarToolbar = screen.getByRole('toolbar', { name: /sidebar toolbar/i });
    const preflightButton = within(sidebarToolbar).getByRole('button', { name: /pre-flight/i });

    act(() => {
      fireEvent.click(preflightButton);
    });

    const preflightPanel = screen.getByRole('region', { name: /preflight/i });

    expect(preflightPanel).toBeTruthy();
  });

  /** @description The sample document has elements outside title-safe, so issues must be shown. */
  it('shows preflight issues for the sample document', () => {
    renderDemoApp();

    const sidebarToolbar = screen.getByRole('toolbar', { name: /sidebar toolbar/i });
    const preflightButton = within(sidebarToolbar).getByRole('button', { name: /pre-flight/i });

    act(() => {
      fireEvent.click(preflightButton);
    });

    const preflightPanel = screen.getByRole('region', { name: /preflight/i });
    const items = preflightPanel.querySelectorAll('li');

    expect(items.length).toBeGreaterThan(0);
    expect(preflightPanel.textContent).toContain('title-safe');
  });

  /** @description The custom countdown plugin type must appear as a button in the element toolbar. */
  it('shows countdown plugin in the element toolbar', () => {
    renderDemoApp();

    const elementToolbar = screen.getByRole('toolbar', { name: /element toolbar/i });
    const countdownButton = within(elementToolbar).getByRole('button', { name: /countdown/i });

    expect(countdownButton).toBeTruthy();
  });

  /** @description All toolbar regions must have role="toolbar" with descriptive aria-label so screen readers can announce them as navigable regions. */
  it('all toolbars have role="toolbar" with aria-label', () => {
    renderDemoApp();

    const toolbars = screen.getAllByRole('toolbar');

    for (const toolbar of toolbars) {
      expect(toolbar.getAttribute('aria-label')).toBeTruthy();
    }

    expect(toolbars.length).toBeGreaterThanOrEqual(3);
  });

  /** @description All icon-only toolbar buttons must have aria-label so screen readers can announce their purpose. */
  it('icon-only toolbar buttons have aria-label', () => {
    renderDemoApp();

    const mainToolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const buttons = within(mainToolbar).getAllByRole('button');

    for (const button of buttons) {
      const hasAriaLabel = button.getAttribute('aria-label') !== null;
      const hasText = button.textContent.trim().length > 0;

      expect(hasAriaLabel || hasText).toBe(true);
    }
  });

  /** @description The canvas area must have an accessible description to communicate interaction hints to screen reader users. */
  it('canvas has aria-description for interaction context', () => {
    renderDemoApp();

    const workarea = screen.getByTestId('demo-canvas-workarea');
    const previewDiv = workarea.querySelector('[aria-description]');

    expect(previewDiv).not.toBeNull();
    expect(previewDiv?.getAttribute('aria-description')).toBeTruthy();
  });
});
