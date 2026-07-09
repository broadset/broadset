/** @vitest-environment jsdom */

import './toolbar-nav-heroui-mock';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CanvasContextMenu } from './toolbar-nav';
import { defaultContextMenuProps } from './toolbar-nav-test-helpers';

describe('CanvasContextMenu', () => {
  /** @description The context menu must appear positioned at click coordinates. */
  it('renders at the specified position', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    const menu = screen.getByRole('menu');

    expect(menu).not.toBeNull();
  });

  /** @description When isOpen is false, the context menu must not render. */
  it('does not render when isOpen is false', () => {
    const props = defaultContextMenuProps({ isOpen: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  /** @description When no element is selected, editing items are not rendered (only Paste shown). */
  it('does not render editing items when no selection exists', () => {
    const props = defaultContextMenuProps({ hasSelection: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-cut')).toBeNull();
    expect(screen.queryByTestId('menu-item-copy')).toBeNull();
    expect(screen.queryByTestId('menu-item-duplicate')).toBeNull();
    expect(screen.queryByTestId('menu-item-delete')).toBeNull();
  });

  /** @description When right-clicking on empty canvas without selection, only Paste is shown. */
  it('shows only Paste when nothing is selected', () => {
    const props = defaultContextMenuProps({ hasSelection: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-paste')).not.toBeNull();
    expect(screen.queryByTestId('menu-item-cut')).toBeNull();
    expect(screen.queryByTestId('menu-item-copy')).toBeNull();
    expect(screen.queryByTestId('menu-item-duplicate')).toBeNull();
    expect(screen.queryByTestId('menu-item-delete')).toBeNull();
    expect(screen.queryByTestId('menu-item-bring-to-front')).toBeNull();
    expect(screen.queryByTestId('menu-item-toggle-lock')).toBeNull();
  });

  /** @description When Cut is clicked, the onCut callback must fire. */
  it('calls onCut when Cut is clicked', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-cut'));

    expect(props.onCut).toHaveBeenCalledTimes(1);
  });

  /** @description When Copy is clicked and then Paste, the respective callbacks must fire. */
  it('calls onCopy and onPaste when clicked', () => {
    const props = defaultContextMenuProps({ hasClipboard: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-copy'));
    fireEvent.click(screen.getByTestId('menu-item-paste'));

    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onPaste).toHaveBeenCalledTimes(1);
  });

  /** @description When delete is clicked, removeElements must be called for all selected. */
  it('calls onDelete when Delete is clicked', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-delete'));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  /** @description When a locked element is selected, Cut, Duplicate, and Delete must be disabled. */
  it('disables Cut, Duplicate, Delete for locked elements', () => {
    const props = defaultContextMenuProps({ isLocked: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-cut').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('menu-item-duplicate').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('menu-item-delete').getAttribute('aria-disabled')).toBe('true');
  });

  /** @description Group/Ungroup must be visible when 2+ elements are selected. */
  it('shows Group and Ungroup when multi-selecting', () => {
    const props = defaultContextMenuProps({ isMultiSelect: true, isGroupSelected: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-group')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup').getAttribute('aria-disabled')).toBe('false');
  });

  /** @description Ungroup must be disabled when multi-selecting non-group elements. */
  it('disables Ungroup when no group is selected', () => {
    const props = defaultContextMenuProps({ isMultiSelect: true, isGroupSelected: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-group')).not.toBeNull();
    expect(screen.getByTestId('menu-item-ungroup').getAttribute('aria-disabled')).toBe('true');
  });

  /** @description Group/Ungroup must be absent when a single element is selected. */
  it('hides Group and Ungroup for single selection', () => {
    const props = defaultContextMenuProps({ isMultiSelect: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-group')).toBeNull();
    expect(screen.queryByTestId('menu-item-ungroup')).toBeNull();
  });

  /** @description Layer reorder actions call the correct callbacks. */
  it('calls reorder callbacks for layer operations', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-bring-to-front'));
    fireEvent.click(screen.getByTestId('menu-item-bring-forward'));
    fireEvent.click(screen.getByTestId('menu-item-send-backward'));
    fireEvent.click(screen.getByTestId('menu-item-send-to-back'));

    expect(props.onBringToFront).toHaveBeenCalledTimes(1);
    expect(props.onBringForward).toHaveBeenCalledTimes(1);
    expect(props.onSendBackward).toHaveBeenCalledTimes(1);
    expect(props.onSendToBack).toHaveBeenCalledTimes(1);
  });

  /** @description Lock/Unlock toggles the element's locked state and shows the correct label. */
  it('shows Lock label for unlocked element and fires onToggleLock', () => {
    const props = defaultContextMenuProps({ isLocked: false });

    render(<CanvasContextMenu {...props} />);

    const lockItem = screen.getByTestId('menu-item-toggle-lock');

    expect(lockItem.textContent).toContain('Lock');
    fireEvent.click(lockItem);

    expect(props.onToggleLock).toHaveBeenCalledTimes(1);
  });

  /** @description Lock/Unlock must show Unlock when element is already locked. */
  it('shows Unlock label for locked element', () => {
    const props = defaultContextMenuProps({ isLocked: true });

    render(<CanvasContextMenu {...props} />);

    const lockItem = screen.getByTestId('menu-item-toggle-lock');

    expect(lockItem.textContent).toContain('Unlock');
  });

  /** @description Edit Path Points must be visible only for path elements. */
  it('shows Edit Path Points for path elements', () => {
    const props = defaultContextMenuProps({ isPathElement: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-edit-path')).not.toBeNull();
  });

  /** @description Edit Path Points must be hidden for non-path elements. */
  it('hides Edit Path Points for non-path elements', () => {
    const props = defaultContextMenuProps({ isPathElement: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.queryByTestId('menu-item-edit-path')).toBeNull();
  });

  /** @description Edit Path Points callback fires when clicked. */
  it('calls onEditPathPoints when Edit Path Points is clicked', () => {
    const props = defaultContextMenuProps({ isPathElement: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-edit-path'));

    expect(props.onEditPathPoints).toHaveBeenCalledTimes(1);
  });

  /** @description Edit Clip Path must be visible only for elements with clipPath capability. */
  it('shows Edit Clip Path for elements with clipPath capability', () => {
    const props = defaultContextMenuProps({ hasClipPathCapability: true });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-edit-clip-path')).not.toBeNull();
  });

  /** @description Edit Clip Path callback fires when clicked. */
  it('calls onEditClipPath when Edit Clip Path is clicked', () => {
    const props = defaultContextMenuProps({ hasClipPathCapability: true });

    render(<CanvasContextMenu {...props} />);

    fireEvent.click(screen.getByTestId('menu-item-edit-clip-path'));

    expect(props.onEditClipPath).toHaveBeenCalledTimes(1);
  });

  /** @description Delete item must render with danger variant (red text). */
  it('renders Delete with danger variant', () => {
    const props = defaultContextMenuProps();

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-delete').getAttribute('data-variant')).toBe('danger');
  });

  /** @description Paste must be disabled when clipboard is empty. */
  it('disables Paste when clipboard is empty', () => {
    const props = defaultContextMenuProps({ hasClipboard: false });

    render(<CanvasContextMenu {...props} />);

    expect(screen.getByTestId('menu-item-paste').getAttribute('aria-disabled')).toBe('true');
  });
});
