/** @vitest-environment jsdom */

import './toolbar-nav-heroui-mock';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_ELEMENT_TYPES, EditorToolbar, ElementLibrary, PageSorter } from './toolbar-nav';

describe('EditorToolbar', () => {
  /** @description The main toolbar must expose undo/redo and view toggles with proper disabled states so the editor shell behaves like a real design tool. */
  it('renders a HeroUI toolbar and wires actions for undo, redo, save, and toggles', () => {
    const onUndo = vi.fn<() => void>();
    const onRedo = vi.fn<() => void>();
    const onSave = vi.fn<() => void>();
    const onToggleGrid = vi.fn<() => void>();
    const onToggleGuides = vi.fn<() => void>();

    render(
      <EditorToolbar
        canUndo={false}
        canRedo
        showGrid
        showGuides={false}
        zoomPercent={125}
        onUndo={onUndo}
        onRedo={onRedo}
        onSave={onSave}
        onToggleGrid={onToggleGrid}
        onToggleGuides={onToggleGuides}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: /editor toolbar/i });
    const undoButton = screen.getByRole('button', { name: /undo/i });
    const redoButton = screen.getByRole('button', { name: /redo/i });
    const saveButton = screen.getByRole('button', { name: /save/i });
    const gridButton = screen.getByRole('button', { name: /toggle grid/i });
    const guidesButton = screen.getByRole('button', { name: /toggle guides/i });

    expect(toolbar).not.toBeNull();
    expect(undoButton.hasAttribute('disabled')).toBe(true);
    expect(redoButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('125%').textContent).toBe('125%');
    expect(saveButton.textContent.trim()).toBe('');
    expect(gridButton.textContent.trim()).toBe('');
    expect(guidesButton.textContent.trim()).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /redo/i }));
    fireEvent.click(saveButton);
    fireEvent.click(gridButton);
    fireEvent.click(guidesButton);

    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onToggleGrid).toHaveBeenCalledTimes(1);
    expect(onToggleGuides).toHaveBeenCalledTimes(1);
  });

  /** @description The optional Save command must disappear when no host save handler is configured so the UI never advertises a dead action. */
  it('hides the save button when onSave is not configured', () => {
    render(
      <EditorToolbar
        canUndo={false}
        canRedo={false}
        showGrid={false}
        showGuides={false}
        zoomPercent={100}
        onUndo={() => undefined}
        onRedo={() => undefined}
        onToggleGrid={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});

describe('ElementLibrary', () => {
  /** @description The element library must render all built-in tiles plus any custom plugin tiles in a two-column grid and start placement on click. */
  it('renders built-in and custom element tiles and forwards selection', () => {
    const onSelect = vi.fn<(type: string) => void>();

    render(
      <ElementLibrary
        elementTypes={[...DEFAULT_ELEMENT_TYPES, { type: 'countdown', label: 'Countdown' }]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('element-library-grid').getAttribute('data-columns')).toBe('2');
    expect(screen.getByRole('button', { name: /text/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /rectangle/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /countdown/i })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /countdown/i }));
    expect(onSelect).toHaveBeenCalledWith('countdown');
  });
});

describe('PageSorter', () => {
  /** @description Scene tabs must mirror the document pages, allow switching, and expose add/remove controls while protecting single-scene documents. */
  it('lists scenes, highlights the active one, and wires add/remove actions', () => {
    const onPageSelect = vi.fn<(index: number) => void>();
    const onPageAdd = vi.fn<() => void>();
    const onPageRemove = vi.fn<(index: number) => void>();

    render(
      <PageSorter
        pages={[
          { id: 'page-1', name: 'Intro' },
          { id: 'page-2', name: 'Offer' },
          { id: 'page-3', name: 'Outro' },
        ]}
        activePageIndex={1}
        onPageSelect={onPageSelect}
        onPageAdd={onPageAdd}
        onPageRemove={onPageRemove}
      />,
    );

    const activeTab = screen.getByRole('tab', { name: /scene 2/i });

    expect(activeTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: /scene 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /add scene/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove scene/i }));

    expect(onPageSelect).toHaveBeenCalledWith(2);
    expect(onPageAdd).toHaveBeenCalledTimes(1);
    expect(onPageRemove).toHaveBeenCalledWith(1);
  });

  /** @description Removing the only scene must be hidden so the editor always preserves the required one-scene minimum. */
  it('hides the remove action for single-scene documents', () => {
    render(
      <PageSorter
        pages={[{ id: 'page-1', name: 'Only scene' }]}
        activePageIndex={0}
        onPageSelect={() => undefined}
        onPageAdd={() => undefined}
        onPageRemove={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /remove scene/i })).toBeNull();
  });
});
