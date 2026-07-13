/** @vitest-environment jsdom */

import './demo-app-test-helpers';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemoApp } from './demo-app/app';
import { setupDemoShellMocks } from './demo-shell-test-utils';

describe('DemoApp toolbar density rebalance', () => {
  /** @description The main toolbar must have visual separators between action clusters for clearer task-category grouping. */
  it('renders separators between toolbar action clusters', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const toolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const separators = toolbar.querySelectorAll('hr');

    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  /** @description The primary toolbar must not contain the document name readout so it stays focused on actionable controls only. */
  it('does not render document name in the primary toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const toolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const infoStrip = within(toolbar).queryByTestId('toolbar-document-info');

    expect(infoStrip).toBeNull();
  });

  /** @description High-frequency editing controls (undo/redo/zoom) must remain in the primary toolbar for immediate access. */
  it('keeps high-frequency editing controls in the primary toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const toolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });

    expect(within(toolbar).getByRole('button', { name: /undo/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /redo/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /zoom in/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /zoom out/i })).toBeTruthy();
  });

  /** @description Animation controls (play/pause, reset, timeline toggle) must live in the canvas bottom toolbar, not the primary toolbar. */
  it('moves animation controls out of the primary toolbar and into the canvas bottom toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const primaryToolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const animationToolbar = screen.getByRole('toolbar', { name: /animation toolbar/i });

    expect(within(primaryToolbar).queryByRole('button', { name: /play playback/i })).toBeNull();
    expect(within(primaryToolbar).queryByRole('button', { name: /reset playback/i })).toBeNull();

    expect(within(animationToolbar).getByRole('button', { name: /play playback/i })).toBeTruthy();
    expect(within(animationToolbar).getByRole('button', { name: /reset playback/i })).toBeTruthy();
    expect(within(animationToolbar).getByRole('button', { name: /open timeline view/i })).toBeTruthy();
  });

  /** @description Animation authoring is now a first-class default workflow, so the sidebar entry must be visible without enabling experimental features manually. */
  it('shows the animation sidebar entry by default', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByRole('button', { name: 'Animation' })).toBeTruthy();
  });
});
