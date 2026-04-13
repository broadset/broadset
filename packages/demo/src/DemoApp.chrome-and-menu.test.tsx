/** @jest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react';

import { dispatchDeleteKey, setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';
import { SAMPLE_DOCUMENT } from './sampleDocument';

describe('DemoApp chrome and menu integration', () => {
  /** @description Restores the expected direct-manipulation affordance by requiring a visible transform widget with resize and rotation handles whenever an element is selected. */
  it('renders a transform widget with resize and rotation handles for the selected element', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByTestId('demo-transform-widget')).toBeTruthy();
    expect(screen.getByTestId('transform-handle-se')).toBeTruthy();
    expect(screen.getByTestId('transform-rotation-handle')).toBeTruthy();
  });

  /** @description Keeps tooltip callouts readable by pointing them inward toward the working canvas rather than outward off the screen edges. */
  it('places toolbar tooltips inward toward the canvas center', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const mainToolbar = screen.getByRole('toolbar', { name: /main editor toolbar/i });
    const sidebarToolbar = screen.getByRole('toolbar', { name: /sidebar toolbar/i });
    const elementToolbar = screen.getByRole('toolbar', { name: /element toolbar/i });
    const undoParent = within(mainToolbar).getByRole('button', { name: /undo/i }).parentElement;
    const textParent = within(elementToolbar).getByRole('button', { name: /^text$/i }).parentElement;
    const layersParent = within(sidebarToolbar).getByRole('button', { name: /^layers$/i }).parentElement;

    expect(undoParent?.querySelector('[placement="bottom"]')).not.toBeNull();
    expect(textParent?.querySelector('[placement="right"]')).not.toBeNull();
    expect(layersParent?.querySelector('[placement="left"]')).not.toBeNull();
  });

  /** @description Prevents the horizontal ruler scale from drifting when the right sidebar is resized, since the top ruler must stay independent of sidebar width. */
  it('keeps the top ruler tick positions stable regardless of saved sidebar width', () => {
    setupDemoShellMocks();
    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'properties', width: 256 }),
    );

    const { unmount } = render(<DemoApp />);
    const narrowTickLeft = screen.getByText('1728').parentElement?.getAttribute('style') ?? '';

    unmount();

    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'properties', width: 800 }),
    );

    render(<DemoApp />);

    const wideTickLeft = screen.getByText('1728').parentElement?.getAttribute('style') ?? '';

    expect(wideTickLeft).toBe(narrowTickLeft);
  });

  /** @description Locks the Phase 4 menu-bar contract so the File and View menus expose the required editor actions instead of a trimmed subset. */
  it('renders the phase 4 file and view menu actions defined by the spec', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByRole('button', { name: /new document/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save as json/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^export$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /document settings/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /save snapshot/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /debug snapshot/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /show rulers/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /show grid/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /hide rulers/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /hide grid/i })).toBeNull();
    expect(screen.getByRole('button', { name: /snap to grid/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /zoom to fit/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /reset zoom/i })).toBeTruthy();
  });

  /** @description Preserves the Phase 4 custom plugin contract so the countdown tool appears alongside the built-in element types in the vertical toolbar. */
  it('renders the countdown plugin in the element toolbar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.getByRole('button', { name: /countdown/i })).toBeTruthy();
  });

  /** @description Ensures the Help menu opens actual modal dialogs instead of transient toasts so Phase 4 users can read shortcuts and About content without it disappearing. */
  it('opens help dialogs from the menu bar', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /about/i }));
    expect(screen.getByRole('dialog', { name: /broadset/i })).toBeTruthy();
  });

  /** @description Locks the Help dialog to HeroUI's keyboard-shortcut presentation so the shortcuts are shown as real keycaps rather than plain text sentences. */
  it('renders keyboard shortcuts using keycap elements in the shortcuts dialog', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));

    const shortcutsDialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });

    expect(shortcutsDialog.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(8);
  });

  /** @description Ensures empty-canvas right-click keeps the context menu minimal so users only see the paste affordance. */
  it('shows only the Paste action when the user right-clicks empty canvas', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    const preview = screen.getByLabelText(/screen preview for/i);

    fireEvent.click(preview);
    fireEvent.contextMenu(preview);

    expect(screen.getByRole('button', { name: /^paste\b/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^cut\b/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^copy\b/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^duplicate\b/i })).toBeNull();
  });

  /** @description Ensures locked elements cannot be cut, duplicated, or deleted from the context menu. */
  it('disables destructive context-menu actions for locked elements', () => {
    setupDemoShellMocks();

    const lockedElementId = SAMPLE_DOCUMENT.elements[0].id;
    const lockedDocument = {
      ...SAMPLE_DOCUMENT,
      elements: SAMPLE_DOCUMENT.elements.map((element, index) =>
        index === 0 ? { ...element, locked: true } : element,
      ),
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(lockedDocument));
    render(<DemoApp />);

    const rendererHost = screen.getByTestId('screen-renderer-host');
    const lockedElementNode = document.createElement('div');

    lockedElementNode.dataset['elementId'] = lockedElementId;
    rendererHost.appendChild(lockedElementNode);
    fireEvent.contextMenu(lockedElementNode);

    expect(screen.getByRole('button', { name: /^cut\b/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^duplicate\b/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^delete\b/i }).hasAttribute('disabled')).toBe(true);
  });

  /** @description Confirms the floating sidebar toolbar disables element-specific tabs when nothing is selected. */
  it('disables the Properties and Animation sidebar buttons after the selection is cleared', () => {
    setupDemoShellMocks();
    render(<DemoApp />);
    fireEvent.click(screen.getByLabelText(/screen preview for/i));

    expect(screen.getByRole('button', { name: /properties/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /animation/i }).hasAttribute('disabled')).toBe(true);
  });

  /** @description 9-A demo milestone: EditorErrorBoundary catches child errors and shows a recovery UI with reload option. */
  it('shows recovery UI when the editor canvas subtree throws', () => {
    const { mockedCreateScreenRenderer } = setupDemoShellMocks();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mockedCreateScreenRenderer.mockImplementation(() => {
      throw new Error('Canvas renderer exploded');
    });

    render(<DemoApp />);

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText('Canvas renderer exploded')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  /** @description 9-C demo milestone: change stream subscription logs batches to console with a cumulative count. */
  it('logs change stream batches to the console with a cumulative count', () => {
    setupDemoShellMocks();

    const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    render(<DemoApp />);
    dispatchDeleteKey();

    const changeLogCalls = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('Change batch'),
    );

    expect(changeLogCalls.length).toBeGreaterThanOrEqual(1);
    expect(changeLogCalls[0]?.[0]).toMatch(/Change batch #\d+/);

    consoleSpy.mockRestore();
  });
});
