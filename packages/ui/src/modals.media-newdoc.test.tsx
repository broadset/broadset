/** @jest-environment jsdom */

import './modals-test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { MediaLibraryModalProps, NewDocumentModalProps } from './modals';

describe('MediaLibraryModal', () => {
  const sampleAssets = [
    { id: 'a1', name: 'Logo', url: '/logo.png', category: 'Logos' },
    { id: 'a2', name: 'Background', url: '/bg.jpg', category: 'Backgrounds' },
    { id: 'a3', name: 'News Logo', url: '/news.png', category: 'Logos' },
  ] as const;

  function makeProps(overrides?: Partial<MediaLibraryModalProps>): MediaLibraryModalProps {
    return {
      isOpen: true,
      assets: [...sampleAssets],
      categories: ['All', 'Logos', 'Backgrounds'],
      onSelect: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
  }

  /** @description Search input filters assets by name substring match */
  it('filters assets by search query', async () => {
    const { MediaLibraryModal } = await import('./modals');

    render(<MediaLibraryModal {...makeProps()} />);

    const searchInput = screen.getByRole('textbox', { name: /search/i });

    fireEvent.change(searchInput, { target: { value: 'Logo' } });
    // "Logo" and "News Logo" should remain; "Background" should not
    expect(screen.getByText('Logo')).toBeTruthy();
    expect(screen.getByText('News Logo')).toBeTruthy();
    expect(screen.queryByText('Background')).toBeNull();
  });

  /** @description Category tabs filter assets by category */
  it('filters assets by category tab', async () => {
    const { MediaLibraryModal } = await import('./modals');

    render(<MediaLibraryModal {...makeProps()} />);

    // Simulate category tab selection to "Backgrounds"
    const tabsInput = screen.getByTestId('tabs-selection');

    fireEvent.change(tabsInput, { target: { value: 'Backgrounds' } });
    expect(screen.getByText('Background')).toBeTruthy();
    // "Logo" as an asset button (aria-label) should not exist
    expect(screen.queryByRole('button', { name: 'Logo' })).toBeNull();
  });

  /** @description Selecting asset and confirming fires onSelect with the asset */
  it('selects an asset and confirms', async () => {
    const { MediaLibraryModal } = await import('./modals');
    const onSelect = jest.fn();

    render(<MediaLibraryModal {...makeProps({ onSelect })} />);
    fireEvent.click(screen.getByText('Logo'));

    const selectBtn = screen.getByRole('button', { name: /select/i });

    expect((selectBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(selectBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0] as readonly unknown[])[0]).toEqual(
      expect.objectContaining({ id: 'a1', name: 'Logo' }),
    );
  });

  /** @description Select button is disabled when nothing is selected */
  it('disables Select button when nothing is selected', async () => {
    const { MediaLibraryModal } = await import('./modals');

    render(<MediaLibraryModal {...makeProps()} />);

    const selectBtn = screen.getByRole('button', { name: /select/i });

    expect((selectBtn as HTMLButtonElement).disabled).toBe(true);
  });

  /** @description Upload button is visible only when onUploadRequest is provided */
  it('shows upload button only when onUploadRequest is provided', async () => {
    const { MediaLibraryModal } = await import('./modals');
    const { rerender } = render(<MediaLibraryModal {...makeProps()} />);

    expect(screen.queryByRole('button', { name: /upload/i })).toBeNull();
    rerender(<MediaLibraryModal {...makeProps({ onUploadRequest: jest.fn() })} />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeTruthy();
  });

  /** @description Shows empty state when no assets are available */
  it('shows empty state when no assets', async () => {
    const { MediaLibraryModal } = await import('./modals');

    render(<MediaLibraryModal {...makeProps({ assets: [] })} />);
    expect(screen.getByText(/no media/i)).toBeTruthy();
  });

  /** @description Double-clicking an asset selects and confirms in one action */
  it('double-click on asset calls onSelect directly', async () => {
    const { MediaLibraryModal } = await import('./modals');
    const onSelect = jest.fn();

    render(<MediaLibraryModal {...makeProps({ onSelect })} />);

    const logoBtn = screen.getByRole('button', { name: 'Logo' });

    // First click — selects; mock Date.now to control timing
    const now = jest.spyOn(Date, 'now');

    now.mockReturnValue(1000);
    fireEvent.click(logoBtn);
    expect(onSelect).not.toHaveBeenCalled();

    // Second click within 400 ms — should trigger onSelect directly
    now.mockReturnValue(1200);
    fireEvent.click(logoBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0] as readonly unknown[])[0]).toEqual(
      expect.objectContaining({ id: 'a1', name: 'Logo' }),
    );

    now.mockRestore();
  });
});

/* ------------------------------------------------------------------ */
/*  New Document Modal                                                  */
/* ------------------------------------------------------------------ */

describe('NewDocumentModal', () => {
  const samplePresets = [
    {
      name: 'HD 1080p',
      width: 1920,
      height: 1080,
      unit: 'px' as const,
      mode: 'broadcast' as const,
      category: 'Broadcast',
    },
    {
      name: 'SD 720p',
      width: 1280,
      height: 720,
      unit: 'px' as const,
      mode: 'broadcast' as const,
      category: 'Broadcast',
    },
    { name: 'A4 Portrait', width: 210, height: 297, unit: 'mm' as const, mode: 'print' as const, category: 'Print' },
    {
      name: 'Social Card',
      width: 1200,
      height: 628,
      unit: 'px' as const,
      mode: 'none' as const,
      category: 'Social Media',
    },
  ] as const;

  function makeProps(overrides?: Partial<NewDocumentModalProps>): NewDocumentModalProps {
    return {
      isOpen: true,
      presets: [...samplePresets],
      onCreateDocument: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
  }

  /** @description Preset selection and Create fires onCreateDocument with mode */
  it('creates document from selected preset', async () => {
    const { NewDocumentModal } = await import('./modals');
    const onCreateDocument = jest.fn();

    render(<NewDocumentModal {...makeProps({ onCreateDocument })} />);

    // Click the HD 1080p row
    const row = screen.getByText('HD 1080p').closest('tr');

    if (row === null) throw new Error('Expected row to exist');
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onCreateDocument).toHaveBeenCalledTimes(1);

    const callArg = (onCreateDocument.mock.calls[0] as readonly unknown[])[0];

    expect(callArg).toEqual(expect.objectContaining({ name: 'HD 1080p', mode: 'broadcast' }));
  });

  /** @description Custom presets show in their categories */
  it('shows custom presets in custom categories', async () => {
    const { NewDocumentModal } = await import('./modals');
    const customPresets = [
      {
        name: 'Custom Canvas',
        width: 500,
        height: 500,
        unit: 'px' as const,
        mode: 'none' as const,
        category: 'Custom',
      },
    ];

    render(<NewDocumentModal {...makeProps({ presets: [...samplePresets, ...customPresets] })} />);
    // Custom category should exist
    expect(screen.getByText('Custom Canvas')).toBeTruthy();
  });

  /** @description Without a selection, Create button is disabled */
  it('disables Create without selection', async () => {
    const { NewDocumentModal } = await import('./modals');

    render(<NewDocumentModal {...makeProps()} />);

    const createBtn = screen.getByRole('button', { name: /create/i });

    expect((createBtn as HTMLButtonElement).disabled).toBe(true);
  });

  /** @description Category tabs filter presets by category */
  it('filters presets by category tab', async () => {
    const { NewDocumentModal } = await import('./modals');

    render(<NewDocumentModal {...makeProps()} />);

    const tabsInput = screen.getByTestId('tabs-selection');

    fireEvent.change(tabsInput, { target: { value: 'Print' } });
    expect(screen.getByText('A4 Portrait')).toBeTruthy();
    expect(screen.queryByText('HD 1080p')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Shortcut Help Modal                                                */
/* ------------------------------------------------------------------ */
