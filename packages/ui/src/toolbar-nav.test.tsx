/// <reference types="@testing-library/jest-dom/jest-globals" />
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { ElementTypeInfo } from './toolbar-nav';
import { ElementLibrary, PageSorter } from './toolbar-nav';

// ---------------------------------------------------------------------------
// Built-in element types (matches spec: 7 types excluding "group")
// ---------------------------------------------------------------------------

const BUILT_IN_TYPES: readonly ElementTypeInfo[] = [
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'svg', label: 'SVG' },
  { type: 'path', label: 'Path' },
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'qrcode', label: 'QR Code' },
];

// ===========================================================================
// Element Library
// ===========================================================================

describe('ElementLibrary', () => {
  /**
   * @description The element library must render one tile per built-in
   * element type with visible labels so users can identify each tool.
   */
  it('renders 7 built-in element tiles with labels', () => {
    const onSelect = jest.fn();

    render(<ElementLibrary elementTypes={BUILT_IN_TYPES} onSelect={onSelect} />);

    for (const { label } of BUILT_IN_TYPES) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(7);
  });

  /**
   * @description Clicking an element tile must call onSelect with the
   * element type so the editor can enter placement mode.
   */
  it('clicking a tile calls onSelect with the type', () => {
    const onSelect = jest.fn();

    render(<ElementLibrary elementTypes={BUILT_IN_TYPES} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Text'));

    expect(onSelect).toHaveBeenCalledWith('text');
  });

  /**
   * @description Custom plugin types from the registry must appear alongside
   * built-in types and be clickable.
   */
  it('renders custom type tile from registry', () => {
    const onSelect = jest.fn();
    const types: ElementTypeInfo[] = [...BUILT_IN_TYPES, { type: 'countdown', label: 'Countdown' }];

    render(<ElementLibrary elementTypes={types} onSelect={onSelect} />);

    const countdownButton = screen.getByText('Countdown');

    expect(countdownButton).toBeInTheDocument();

    fireEvent.click(countdownButton);

    expect(onSelect).toHaveBeenCalledWith('countdown');
  });
});

// ===========================================================================
// Page Sorter
// ===========================================================================

describe('PageSorter', () => {
  const threePages = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];

  /**
   * @description The page sorter must render a tab for each page in the
   * document so users can switch between pages.
   */
  it('renders tabs matching the number of pages', () => {
    const onPageSelect = jest.fn();

    render(
      <PageSorter
        pages={threePages}
        activePageIndex={0}
        onPageSelect={onPageSelect}
        onPageAdd={jest.fn()}
        onPageRemove={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');

    expect(tabs).toHaveLength(3);
  });

  /**
   * @description Clicking a page tab must call onPageSelect with the page
   * index so the editor can switch the active page.
   */
  it('clicking a tab calls onPageSelect with the page index', () => {
    const onPageSelect = jest.fn();

    render(
      <PageSorter
        pages={threePages}
        activePageIndex={0}
        onPageSelect={onPageSelect}
        onPageAdd={jest.fn()}
        onPageRemove={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');

    fireEvent.click(tabs[1] as HTMLElement);

    expect(onPageSelect).toHaveBeenCalledWith(1);
  });

  /**
   * @description The active tab must have aria-selected="true" to indicate
   * the currently viewed page.
   */
  it('active tab has aria-selected', () => {
    render(
      <PageSorter
        pages={threePages}
        activePageIndex={1}
        onPageSelect={jest.fn()}
        onPageAdd={jest.fn()}
        onPageRemove={jest.fn()}
      />,
    );

    const tabs = screen.getAllByRole('tab');

    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  /**
   * @description The add page button must call onPageAdd when clicked.
   */
  it('add button calls onPageAdd', () => {
    const onPageAdd = jest.fn();

    render(
      <PageSorter
        pages={threePages}
        activePageIndex={0}
        onPageSelect={jest.fn()}
        onPageAdd={onPageAdd}
        onPageRemove={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Add page'));

    expect(onPageAdd).toHaveBeenCalledTimes(1);
  });

  /**
   * @description The remove button must call onPageRemove with the active
   * page index when clicked.
   */
  it('remove button calls onPageRemove with active index', () => {
    const onPageRemove = jest.fn();

    render(
      <PageSorter
        pages={threePages}
        activePageIndex={1}
        onPageSelect={jest.fn()}
        onPageAdd={jest.fn()}
        onPageRemove={onPageRemove}
      />,
    );

    fireEvent.click(screen.getByLabelText('Remove page'));

    expect(onPageRemove).toHaveBeenCalledWith(1);
  });

  /**
   * @description When only one page exists, the remove button must be hidden
   * to prevent the user from deleting the last page.
   */
  it('hides remove button when only one page exists', () => {
    render(
      <PageSorter
        pages={[{ id: 'p1' }]}
        activePageIndex={0}
        onPageSelect={jest.fn()}
        onPageAdd={jest.fn()}
        onPageRemove={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Remove page')).not.toBeInTheDocument();
  });
});
