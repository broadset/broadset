/** @vitest-environment jsdom */

import { createDefaultElement } from '@broadset/model';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dispatchDeleteKey, enableExperimentalFeatures, setupDemoShellMocks } from './demo-shell-test-utils';
import { DemoApp } from './DemoApp';
import { createDemoAppChromeTestDocument, createParentingTransformTestDocument } from './test-fixtures';

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
    expect(layersParent?.querySelector('[placement="bottom"]')).not.toBeNull();
  });

  /** @description Parented element selections must position the transform widget using world coordinates so handles align with the actual on-canvas location. */
  it('positions the transform widget at the world position for parented elements', () => {
    setupDemoShellMocks();

    const fixtureDocument = createParentingTransformTestDocument();
    const elementById = new Map(fixtureDocument.elements.map((element) => [element.id, element]));
    const parentedElement = fixtureDocument.elements.find((element) => element.parentId !== null);

    if (parentedElement === undefined) {
      throw new Error('Expected sample fixture to contain at least one parented element.');
    }

    let expectedLeft = parentedElement.position.x;
    let expectedTop = parentedElement.position.y;
    let parent = elementById.get(parentedElement.parentId ?? '');

    while (parent !== undefined) {
      expectedLeft += parent.position.x;
      expectedTop += parent.position.y;
      parent = parent.parentId === null ? undefined : elementById.get(parent.parentId);
    }

    const reorderedDocument = {
      ...fixtureDocument,
      elements: [parentedElement, ...fixtureDocument.elements.filter((element) => element.id !== parentedElement.id)],
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(reorderedDocument));
    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'layers', width: 332 }),
    );
    render(<DemoApp />);

    const widgetStyle = screen.getByTestId('demo-transform-widget').getAttribute('style') ?? '';

    expect(widgetStyle).toContain(`left: ${String(expectedLeft)}px`);
    expect(widgetStyle).toContain(`top: ${String(expectedTop)}px`);
  });

  /** @description Layers must explicitly show parent-child relationships so grouped/parented structures are understandable without guessing from canvas placement. */
  it('shows explicit parenting labels in the layers panel', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /^layers$/i }));

    expect(screen.getAllByText('Child of Score Bug').length).toBeGreaterThan(0);
  });

  /** @description Dragging a layer onto another layer must reparent it so hierarchy edits in the layers panel update the real document structure. */
  it('reparents a layer when dropped inside another layer', () => {
    setupDemoShellMocks();

    const fixtureDocument = createParentingTransformTestDocument();
    const standaloneBadge = createDefaultElement('text', {
      id: 'el-standalone-badge',
      name: 'Standalone Badge',
      position: { x: 40, y: 40 },
      width: 160,
      height: 40,
      content: 'Standalone',
    });
    const withStandaloneRoot = {
      ...fixtureDocument,
      elements: [...fixtureDocument.elements, standaloneBadge],
      pages: fixtureDocument.pages.map((page, index) =>
        index === 0 ?
          {
            ...page,
            elements: [
              ...page.elements,
              {
                elementId: standaloneBadge.id,
                transform: {
                  position: { x: standaloneBadge.position.x, y: standaloneBadge.position.y, z: 0 },
                  rotation: { x: 0, y: 0, z: standaloneBadge.rotation },
                  scale: { x: 1, y: 1, z: 1 },
                },
                visible: true,
              },
            ],
          }
        : page,
      ),
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(withStandaloneRoot));
    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'layers', width: 332 }),
    );

    render(<DemoApp />);

    expect(screen.getAllByText('Child of Promo Group')).toHaveLength(1);

    const dragHandle = screen.getByLabelText('Drag Standalone Badge');
    const dropTarget = screen.getByLabelText('Select Promo Group').closest('li');

    if (dropTarget === null) {
      throw new Error('Expected Promo Group layer row to exist.');
    }

    Object.defineProperty(dropTarget, 'getBoundingClientRect', {
      value: () => ({
        bottom: 30,
        height: 30,
        left: 0,
        right: 200,
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      }),
    });

    fireEvent.dragStart(dragHandle, {
      dataTransfer: {
        effectAllowed: 'move',
        setDragImage: vi.fn(),
      },
    });
    fireEvent.dragOver(dropTarget, { clientY: 15 });
    fireEvent.drop(dropTarget);

    expect(screen.getAllByText('Child of Promo Group')).toHaveLength(2);
  });

  /** @description Dragging near the upper half of a layer row must clearly show that parenting will happen, so users can discover and trust the feature. */
  it('shows a parent-drop indicator across the expanded upper drop zone', () => {
    setupDemoShellMocks();

    const fixtureDocument = createParentingTransformTestDocument();
    const standaloneBadge = createDefaultElement('text', {
      id: 'el-standalone-badge',
      name: 'Standalone Badge',
      position: { x: 40, y: 40 },
      width: 160,
      height: 40,
      content: 'Standalone',
    });
    const withStandaloneRoot = {
      ...fixtureDocument,
      elements: [...fixtureDocument.elements, standaloneBadge],
      pages: fixtureDocument.pages.map((page, index) =>
        index === 0 ?
          {
            ...page,
            elements: [
              ...page.elements,
              {
                elementId: standaloneBadge.id,
                transform: {
                  position: { x: standaloneBadge.position.x, y: standaloneBadge.position.y, z: 0 },
                  rotation: { x: 0, y: 0, z: standaloneBadge.rotation },
                  scale: { x: 1, y: 1, z: 1 },
                },
                visible: true,
              },
            ],
          }
        : page,
      ),
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(withStandaloneRoot));
    window.localStorage.setItem(
      'broadset:demo-sidebar-preferences:v1',
      JSON.stringify({ isOpen: true, tab: 'layers', width: 332 }),
    );

    render(<DemoApp />);

    const dragHandle = screen.getByLabelText('Drag Standalone Badge');
    const dropTarget = screen.getByLabelText('Select Promo Group').closest('li');

    if (dropTarget === null) {
      throw new Error('Expected Promo Group layer row to exist.');
    }

    Object.defineProperty(dropTarget, 'getBoundingClientRect', {
      value: () => ({
        bottom: 30,
        height: 30,
        left: 0,
        right: 200,
        top: 0,
        width: 200,
        x: 0,
        y: 0,
      }),
    });

    fireEvent.dragStart(dragHandle, {
      dataTransfer: {
        effectAllowed: 'move',
        setDragImage: vi.fn(),
      },
    });

    // 14px over a 30px row is below the old top-third threshold but inside the new expanded parent zone.
    fireEvent.dragOver(dropTarget, { clientY: 14 });

    expect(screen.queryAllByTestId(/layer-drop-(parent|inside)-indicator-/).length).toBeGreaterThan(0);
  });

  /** @description Sidebar visibility toggles must immediately force element visibility in edit mode and feed an updated document to the renderer. */
  it('updates renderer document when toggling layer visibility in edit mode', () => {
    const { mockedCreateScreenRenderer } = setupDemoShellMocks();
    const updateDocument = vi.fn();

    const overlayRoot = document.body.appendChild(document.createElement('div'));

    mockedCreateScreenRenderer.mockReturnValue({
      destroy: vi.fn(() => {
        overlayRoot.remove();
      }),
      getOverlayRoot: vi.fn(() => overlayRoot),
      host: document.createElement('div'),
      updateDocument,
      updateSettings: vi.fn(),
    });

    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /^layers$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^hide score bug$/i }));

    const hasHiddenUpdate = updateDocument.mock.calls.some((call) => {
      const [documentArg] = call as [{ readonly elements: readonly { readonly id: string }[] }];

      return documentArg.elements.every((element) => element.id !== 'el-scorebug');
    });

    expect(hasHiddenUpdate).toBe(true);
  });

  /** @description Closing the sidebar must remove hidden panel controls from keyboard navigation so Tab cannot scroll focus into offscreen UI. */
  it('removes sidebar panel controls from the tab order when the sidebar is closed', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /^layers$/i }));
    expect(screen.getByRole('region', { name: /layers/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /close sidebar/i }));

    expect(screen.queryByRole('region', { name: /layers/i })).toBeNull();
  });

  /** @description Selecting a layer row must keep the user in the Layers panel instead of forcing a tab switch to Properties. */
  it('keeps the layers tab active when selecting a layer row', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    fireEvent.click(screen.getByRole('button', { name: /^layers$/i }));
    fireEvent.click(screen.getByLabelText('Select Score Bug'));

    expect(screen.getByRole('region', { name: /layers/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /properties/i })).toBeNull();
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
    enableExperimentalFeatures();

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

  /** @description Enforces the layout contract that the File menu omits the Save action when the host did not provide an onSave handler. */
  it('hides the Save file action when onSave is not configured', () => {
    setupDemoShellMocks();
    render(<DemoApp />);

    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /save as json/i })).toBeTruthy();
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

    expect(screen.getByRole('button', { name: /^paste/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^cut/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^copy/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^duplicate/i })).toBeNull();
  });

  /** @description Ensures locked elements cannot be cut, duplicated, or deleted from the context menu. */
  it('disables destructive context-menu actions for locked elements', () => {
    setupDemoShellMocks();

    const chromeDocument = createDemoAppChromeTestDocument();

    const firstElement = chromeDocument.elements[0];

    if (firstElement === undefined) {
      throw new Error('Expected sample fixture to contain at least one element.');
    }

    const lockedElementId = firstElement.id;
    const lockedDocument = {
      ...chromeDocument,
      elements: chromeDocument.elements.map((element, index) => (index === 0 ? { ...element, locked: true } : element)),
    };

    window.localStorage.setItem('broadset:demo-document:v1', JSON.stringify(lockedDocument));
    render(<DemoApp />);

    const rendererHost = screen.getByTestId('screen-renderer-host');
    const lockedElementNode = document.createElement('div');

    lockedElementNode.dataset['elementId'] = lockedElementId;
    rendererHost.appendChild(lockedElementNode);
    fireEvent.contextMenu(lockedElementNode);

    expect(screen.getByRole('button', { name: /^cut/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^duplicate/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /^delete/i }).hasAttribute('disabled')).toBe(true);
  });

  /** @description Confirms the floating sidebar toolbar disables element-specific tabs when nothing is selected. */
  it('disables the Properties and Animation sidebar buttons after the selection is cleared', () => {
    setupDemoShellMocks();
    render(<DemoApp />);
    enableExperimentalFeatures();
    fireEvent.click(screen.getByLabelText(/screen preview for/i));

    expect(screen.getByRole('button', { name: /properties/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /animation/i }).hasAttribute('disabled')).toBe(true);
  });

  /** @description 9-A demo milestone: EditorErrorBoundary catches child errors and shows a recovery UI with reload option. */
  it('shows recovery UI when the editor canvas subtree throws', () => {
    const { mockedCreateScreenRenderer } = setupDemoShellMocks();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

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

  /** @description 9-C demo milestone: change stream subscription logs batches only when debug mode is explicitly enabled. */
  it('logs change stream batches when debug mode is enabled', () => {
    setupDemoShellMocks();
    window.localStorage.setItem('broadset:debug-change-stream', '1');

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      render(<DemoApp />);
      dispatchDeleteKey();

      const changeLogCalls = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('Change batch'),
      );

      expect(changeLogCalls.length).toBeGreaterThanOrEqual(1);
      expect(changeLogCalls[0]?.[0]).toMatch(/Change batch #\d+/);
    } finally {
      window.localStorage.removeItem('broadset:debug-change-stream');
      consoleSpy.mockRestore();
    }
  });
});
