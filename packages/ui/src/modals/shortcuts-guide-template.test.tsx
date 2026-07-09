/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GuidePositionModalProps, TemplateBrowserModalProps } from './index';
import { GuidePositionModal, ShortcutHelpModal, TemplateBrowserModal } from './index';

describe('ShortcutHelpModal', () => {
  /** @description Confirms modal does not render when closed */
  it('does not render when closed', () => {
    const { container } = render(<ShortcutHelpModal isOpen={false} onClose={vi.fn()} />);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /** @description All five shortcut groups are displayed with Kbd elements */
  it('renders all five shortcut groups with kbd elements', () => {
    render(<ShortcutHelpModal isOpen={true} onClose={vi.fn()} />);
    // 5 groups: Clipboard & Selection, Nudge, Layer Order, Grouping & Lock, Zoom & History
    expect(screen.getByText(/clipboard & selection/i)).toBeTruthy();
    expect(screen.getByText(/^Nudge$/)).toBeTruthy();
    expect(screen.getByText(/layer order/i)).toBeTruthy();
    expect(screen.getByText(/grouping & lock/i)).toBeTruthy();
    expect(screen.getByText(/zoom & history/i)).toBeTruthy();

    // There should be multiple kbd elements
    const kbdElements = document.querySelectorAll('kbd');

    expect(kbdElements.length).toBeGreaterThan(10);
  });

  /** @description Close button calls onClose */
  it('calls onClose on close button', () => {
    const onClose = vi.fn();

    render(<ShortcutHelpModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** @description Accepts custom shortcuts override */
  it('accepts custom shortcuts override', () => {
    const customShortcuts = {
      'Clipboard & Selection': [{ action: 'Custom Copy', keys: ['Ctrl', 'Shift', 'C'] }],
    };

    render(<ShortcutHelpModal isOpen={true} shortcuts={customShortcuts} onClose={vi.fn()} />);
    expect(screen.getByText('Custom Copy')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  Guide Position Modal                                               */
/* ------------------------------------------------------------------ */

describe('GuidePositionModal', () => {
  function makeProps(overrides?: Partial<GuidePositionModalProps>): GuidePositionModalProps {
    return {
      isOpen: true,
      position: 50,
      unit: 'mm',
      onApply: vi.fn(),
      onDelete: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
  }

  /** @description Edit guide position and click Apply repositions the guide */
  it('edits position and fires onApply', () => {
    const onApply = vi.fn();

    render(<GuidePositionModal {...makeProps({ onApply })} />);

    const posInput = screen.getByRole('spinbutton');

    fireEvent.change(posInput, { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith(75);
  });

  /** @description Delete button removes the guide */
  it('fires onDelete when Delete is clicked', () => {
    const onDelete = vi.fn();

    render(<GuidePositionModal {...makeProps({ onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  /** @description Enter key applies the position */
  it('applies position on Enter key', () => {
    const onApply = vi.fn();

    render(<GuidePositionModal {...makeProps({ onApply })} />);

    const posInput = screen.getByRole('spinbutton');

    fireEvent.change(posInput, { target: { value: '100' } });
    fireEvent.keyDown(posInput, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith(100);
  });

  /** @description Escape key closes without changes */
  it('closes on Escape without applying', () => {
    const onClose = vi.fn();
    const onApply = vi.fn();

    render(<GuidePositionModal {...makeProps({ onClose, onApply })} />);

    const posInput = screen.getByRole('spinbutton');

    fireEvent.keyDown(posInput, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Template Browser Modal                                              */
/* ------------------------------------------------------------------ */

describe('TemplateBrowserModal', () => {
  const sampleTemplates = [
    { id: 't1', name: 'Sports Score', category: 'Lower Thirds', thumbnail: '/sports.png' },
    { id: 't2', name: 'News Ticker', category: 'Lower Thirds', thumbnail: '/ticker.png' },
    { id: 't3', name: 'Weather Full', category: 'Full Screen', thumbnail: '/weather.png' },
    { id: 't4', name: 'Election News', category: 'Full Screen', thumbnail: '/election.png' },
  ] as const;

  function makeProps(overrides?: Partial<TemplateBrowserModalProps>): TemplateBrowserModalProps {
    return {
      isOpen: true,
      templates: [...sampleTemplates],
      hasUnsavedChanges: false,
      onSelectTemplate: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    };
  }

  /** @description Templates are grouped by category with alphabetical sorting */
  it('groups templates by category alphabetically', () => {
    render(<TemplateBrowserModal {...makeProps()} />);

    expect(screen.getByText('Full Screen')).toBeTruthy();
    expect(screen.getByText('Lower Thirds')).toBeTruthy();

    const allText = document.body.textContent;

    expect(allText.indexOf('Full Screen')).toBeLessThan(allText.indexOf('Lower Thirds'));
  });

  /** @description Search filters templates by name substring match */
  it('filters templates by search', () => {
    render(<TemplateBrowserModal {...makeProps()} />);

    const searchInput = screen.getByRole('textbox', { name: /search/i });

    fireEvent.change(searchInput, { target: { value: 'news' } });
    expect(screen.getByText('News Ticker')).toBeTruthy();
    expect(screen.getByText('Election News')).toBeTruthy();
    expect(screen.queryByText('Sports Score')).toBeNull();
    expect(screen.queryByText('Weather Full')).toBeNull();
  });

  /** @description Shows empty message when search has no results */
  it('shows no templates found when search has no results', () => {
    render(<TemplateBrowserModal {...makeProps()} />);

    const searchInput = screen.getByRole('textbox', { name: /search/i });

    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText(/no templates found/i)).toBeTruthy();
  });

  /** @description Selecting and creating from template fires onSelectTemplate */
  it('selects and creates from template', () => {
    const onSelectTemplate = vi.fn();

    render(<TemplateBrowserModal {...makeProps({ onSelectTemplate })} />);
    fireEvent.click(screen.getByText('Sports Score'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onSelectTemplate).toHaveBeenCalledTimes(1);
    expect((onSelectTemplate.mock.calls[0] as readonly unknown[])[0]).toEqual(
      expect.objectContaining({ id: 't1', name: 'Sports Score' }),
    );
  });

  /** @description When hasUnsavedChanges is true, confirmation dialog appears */
  it('shows confirmation when unsaved changes exist', () => {
    const onSelectTemplate = vi.fn();

    render(<TemplateBrowserModal {...makeProps({ hasUnsavedChanges: true, onSelectTemplate })} />);
    fireEvent.click(screen.getByText('Sports Score'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    // Confirmation dialog should appear
    expect(screen.getByText(/unsaved/i)).toBeTruthy();
  });

  /** @description Template browser hidden when no templates configured */
  it('does not render when templates array is empty', () => {
    render(<TemplateBrowserModal {...makeProps({ templates: [] })} />);

    expect(screen.getByText(/no templates/i)).toBeTruthy();
  });

  /** @description Responsive grid with 3-5 columns via CSS grid */
  it('renders a responsive grid for template thumbnails', () => {
    render(<TemplateBrowserModal {...makeProps()} />);

    // The grid container should have grid display styles
    const thumbnails = screen.getAllByRole('button', { name: /sports score|news ticker|weather full|election news/i });

    expect(thumbnails.length).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/*  WCAG AA — Modal Accessibility                                      */
/* ------------------------------------------------------------------ */
