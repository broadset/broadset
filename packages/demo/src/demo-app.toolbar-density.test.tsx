/** @vitest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';

describe('DemoApp toolbar density rebalance', () => {
  /** @description The document info (name + resolution) must be in the canvas chrome, not the primary toolbar, to shorten the toolbar scan path. */
  it('displays document info in the canvas chrome instead of the primary toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const canvasChrome = screen.getByTestId('canvas-info-strip');

    expect(canvasChrome).toBeTruthy();
    expect(canvasChrome.textContent).toMatch(/\d+\s*[×x]\s*\d+/);
  });

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

  /** @description High-frequency controls (undo/redo/play/zoom) must remain in the primary toolbar for immediate access. */
  it('keeps high-frequency controls in the primary toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const toolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });

    expect(within(toolbar).getByRole('button', { name: /undo/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /redo/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /play playback/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /zoom in/i })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: /zoom out/i })).toBeTruthy();
  });
});
