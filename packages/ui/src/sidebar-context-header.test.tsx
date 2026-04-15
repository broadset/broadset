import { render, screen } from '@testing-library/react';

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

  /** @description When no subtitle is provided, only the label and icon render */
  it('renders without subtitle by default', () => {
    const { container } = render(<SidebarContextHeader icon={<span />} label="Layers" />);

    expect(container.querySelectorAll('[data-testid="sidebar-context-subtitle"]')).toHaveLength(0);
  });

  /** @description When a subtitle is provided, it renders below the label for extra context */
  it('renders subtitle when provided', () => {
    render(<SidebarContextHeader icon={<span />} label="Properties" subtitle="Rectangle — element-1" />);

    expect(screen.getByText('Rectangle — element-1')).toBeInTheDocument();
  });
});
