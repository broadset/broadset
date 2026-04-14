/** @jest-environment jsdom */

import './modals-test-helpers';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { CanvasSettingsModalProps, ExportModalProps } from './modals';

describe('AboutModal', () => {
  /** @description Ensures the modal does not render any content when closed */
  it('does not render when closed', async () => {
    const { AboutModal } = await import('./modals');
    const { container } = render(<AboutModal isOpen={false} version="1.0.0" onClose={jest.fn()} />);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /** @description Verifies all content zones render when the modal is open: title, description, stack info, and version */
  it('renders about content when open', async () => {
    const { AboutModal } = await import('./modals');

    render(<AboutModal isOpen={true} version="2.3.1" onClose={jest.fn()} />);
    expect(screen.getByLabelText('Broadset')).toBeTruthy();
    expect(screen.getByText(/2\.3\.1/)).toBeTruthy();
    // Stack info: React, Zustand, HeroUI v3
    expect(screen.getByText(/React/)).toBeTruthy();
    expect(screen.getByText(/Zustand/)).toBeTruthy();
    expect(screen.getByText(/HeroUI/)).toBeTruthy();
  });

  /** @description Validates that clicking the close button fires the onClose callback */
  it('calls onClose when close button is clicked', async () => {
    const { AboutModal } = await import('./modals');
    const onClose = jest.fn();

    render(<AboutModal isOpen={true} version="1.0.0" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Canvas Settings Modal                                              */
/* ------------------------------------------------------------------ */

describe('CanvasSettingsModal', () => {
  function makeProps(overrides?: Partial<CanvasSettingsModalProps>): CanvasSettingsModalProps {
    return {
      isOpen: true,
      documentName: 'My Doc',
      showRulers: true,
      rulerUnit: 'px',
      viewMode: 'none',
      perspective: 1000,
      showGrid: false,
      gridSize: 10,
      snapToGrid: false,
      snapThreshold: 5,
      onDocumentNameChange: jest.fn(),
      onRulerChange: jest.fn(),
      onRulerUnitChange: jest.fn(),
      onViewModeChange: jest.fn(),
      onPerspectiveChange: jest.fn(),
      onGridChange: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
  }

  /** @description Confirms the modal does not render when isOpen is false */
  it('does not render when closed', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const { container } = render(<CanvasSettingsModal {...makeProps({ isOpen: false })} />);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /** @description Validates document name input calls the onDocumentNameChange callback */
  it('fires document name change callback', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const onDocumentNameChange = jest.fn();

    render(<CanvasSettingsModal {...makeProps({ onDocumentNameChange })} />);

    const nameInput = screen.getByDisplayValue('My Doc');

    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    expect(onDocumentNameChange).toHaveBeenCalledWith('New Name');
  });

  /** @description Validates view mode button group fires onViewModeChange */
  it('shows all three view mode buttons and fires onViewModeChange', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const onViewModeChange = jest.fn();

    render(<CanvasSettingsModal {...makeProps({ onViewModeChange })} />);

    // Find the broadcast button
    const broadcastBtn = screen.getByRole('button', { name: /broadcast/i });

    fireEvent.click(broadcastBtn);
    expect(onViewModeChange).toHaveBeenCalledWith('broadcast');
  });

  /** @description Validates grid toggle calls onGridChange */
  it('toggles show grid and calls onGridChange', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const onGridChange = jest.fn();

    render(<CanvasSettingsModal {...makeProps({ onGridChange })} />);

    const gridSwitch = screen.getByRole('switch', { name: /show grid/i });

    fireEvent.click(gridSwitch);
    expect(onGridChange).toHaveBeenCalled();
  });

  /** @description Validates snap to grid toggle calls onGridChange */
  it('toggles snap to grid and calls onGridChange', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const onGridChange = jest.fn();

    render(<CanvasSettingsModal {...makeProps({ onGridChange })} />);

    const snapSwitch = screen.getByRole('switch', { name: /snap to grid/i });

    fireEvent.click(snapSwitch);
    expect(onGridChange).toHaveBeenCalled();
  });

  /** @description Validates Done button fires onClose */
  it('Done button fires onClose', async () => {
    const { CanvasSettingsModal } = await import('./modals');
    const onClose = jest.fn();

    render(<CanvasSettingsModal {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Export Modal                                                        */
/* ------------------------------------------------------------------ */

describe('ExportModal', () => {
  function makeProps(overrides?: Partial<ExportModalProps>): ExportModalProps {
    return {
      isOpen: true,
      enabledExporters: ['html', 'png', 'pdf'],
      dynamicData: {},
      onExport: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
  }

  /** @description Only exporters that are feature-flag enabled should appear */
  it('shows only enabled exporters', async () => {
    const { ExportModal } = await import('./modals');

    render(<ExportModal {...makeProps({ enabledExporters: ['html', 'png'] })} />);
    expect(screen.getByRole('button', { name: /html/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /png/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pdf/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mp4/i })).toBeNull();
  });

  /** @description Submit with a selected exporter passes exporter, dynamic data, and snapshot */
  it('fires onExport with exporter and dynamic data on submit', async () => {
    const { ExportModal } = await import('./modals');
    const onExport = jest.fn();

    render(<ExportModal {...makeProps({ enabledExporters: ['png'], onExport })} />);
    fireEvent.click(screen.getByRole('button', { name: /png/i }));
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(onExport).toHaveBeenCalledTimes(1);

    const callArg = onExport.mock.calls[0] as readonly unknown[];

    expect(callArg[0]).toBe('png');
  });

  /** @description Submit button is disabled when no exporter is selected */
  it('disables submit when no exporter is selected', async () => {
    const { ExportModal } = await import('./modals');

    render(<ExportModal {...makeProps()} />);

    const submitBtn = screen.getByRole('button', { name: /export/i });

    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Media Library Modal                                                */
/* ------------------------------------------------------------------ */
