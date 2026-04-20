import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SidebarContextHeader } from './sidebar-context-header';

describe('SidebarContextHeader', () => {
  /** @description The header must display the active tab label for in-panel context identification */
  it('renders the tab label text', () => {
    render(<SidebarContextHeader icon={<span data-testid="icon" />} label="Properties" />);

    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  /** @description The header must render the associated icon for quick visual identification */
  it('renders the tab icon', () => {
    render(<SidebarContextHeader icon={<span data-testid="icon" />} label="Layers" />);

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  /** @description The header must be an accessible semantic element with proper test identification */
  it('renders with data-testid for reliable targeting', () => {
    render(<SidebarContextHeader icon={<span />} label="Animation" />);

    expect(screen.getByTestId('sidebar-context-header')).toBeInTheDocument();
  });

  /** @description The header must use flexbox layout for icon + label alignment */
  it('applies flexbox layout to the header container', () => {
    render(<SidebarContextHeader icon={<span />} label="Layers" />);

    const header = screen.getByTestId('sidebar-context-header');

    expect(header).toBeInTheDocument();
    expect(header.style.display).toBe('flex');
    expect(header.style.alignItems).toBe('center');
  });

  /** @description The header must render a bottom border for visual separation from panel content */
  it('renders a bottom border for visual separation', () => {
    render(<SidebarContextHeader icon={<span />} label="Properties" />);

    const header = screen.getByTestId('sidebar-context-header');

    expect(header.style.borderBottom).toContain('1px solid');
  });

  /** @description Header never leaks the element id to the user; the label alone is authoritative. */
  it('renders with just the label and icon by default', () => {
    const { container } = render(<SidebarContextHeader icon={<span />} label="Layers" />);

    expect(container.querySelectorAll('[data-testid="sidebar-context-subtitle"]')).toHaveLength(0);
  });

  /** @description When onLabelChange is provided the label turns into an inline editable input for fast renames. */
  it('renders an editable name input when onLabelChange is provided', () => {
    render(
      <SidebarContextHeader
        icon={<span />}
        label="Score bug"
        onLabelChange={() => {
          /* no-op for this test */
        }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Element name' })).toBeInTheDocument();
  });

  /** @description Type and count chips must render when supplied so selection context stays visible in the header. */
  it('renders type and count chips when labels are provided', () => {
    render(
      <SidebarContextHeader icon={<span />} label="Properties" typeChipLabel="Rectangle" countChipLabel="3 elements" />,
    );

    expect(screen.getByText('Rectangle')).toBeInTheDocument();
    expect(screen.getByText('3 elements')).toBeInTheDocument();
  });

  /** @description Lock button must expose a stable aria-label and trigger onToggleLock for keyboard and pointer users. */
  it('renders lock button and invokes callback', () => {
    const onToggleLock = vi.fn(() => undefined);

    render(<SidebarContextHeader icon={<span />} label="Properties" isLocked={false} onToggleLock={onToggleLock} />);

    const lockButton = screen.getByRole('button', { name: 'Lock element' });

    expect(lockButton.querySelector('svg')).not.toBeNull();
    fireEvent.click(lockButton);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  /** @description Locked headers must flip the accessible lock label to unlock for clear state feedback. */
  it('renders unlock aria label when locked', () => {
    render(<SidebarContextHeader icon={<span />} label="Properties" isLocked onToggleLock={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Unlock element' })).toBeInTheDocument();
  });

  /** @description Lock button must expose aria-pressed so screen readers and tests can see the current state, and the button visual must differ per state. */
  it('reflects lock state via aria-pressed on the lock button', () => {
    const { rerender } = render(
      <SidebarContextHeader icon={<span />} label="Properties" isLocked={false} onToggleLock={() => undefined} />,
    );

    expect(screen.getByRole('button', { name: 'Lock element' }).getAttribute('aria-pressed')).toBe('false');

    rerender(<SidebarContextHeader icon={<span />} label="Properties" isLocked onToggleLock={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Unlock element' }).getAttribute('aria-pressed')).toBe('true');
  });

  /** @description Animation mode chip must appear only when explicitly enabled and use fallback label text when omitted. */
  it('renders animation mode chip with fallback label', () => {
    render(<SidebarContextHeader icon={<span />} label="Animation" showAnimationMode />);

    expect(screen.getByText('Animation Mode')).toBeInTheDocument();
  });
});
