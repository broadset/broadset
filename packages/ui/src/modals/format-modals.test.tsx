/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormatExportOptionsModal, type FormatExportOptionsValue, FormatImportWarningsModal } from './index';

/**
 * Phase 5 interleave I5.1 — shared format UI modals. The PSD track
 * consumes both; later PDF / SVG / PPTX tracks reuse them unchanged
 * under the I6.1 / I7.1 / I8.1 interleaves.
 */

describe('FormatImportWarningsModal', () => {
  /**
   * @description The modal does not render when closed — callers can
   * mount it unconditionally and toggle visibility via `isOpen`.
   */
  it('does not render when closed', () => {
    const { container } = render(
      <FormatImportWarningsModal
        isOpen={false}
        formatLabel="PSD"
        warnings={['dropped']}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /**
   * @description When warnings are present the modal lists them and
   * surfaces a count header so users see immediately how much was
   * skipped.
   */
  it('lists every warning when the modal is open', () => {
    render(
      <FormatImportWarningsModal
        isOpen={true}
        formatLabel="PSD"
        warnings={['Dropped bevel effect on "Hero"', 'Unknown layer type on "Notes"']}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 warnings/i)).toBeTruthy();
    expect(screen.getByText(/Dropped bevel effect/i)).toBeTruthy();
    expect(screen.getByText(/Unknown layer type/i)).toBeTruthy();
  });

  /**
   * @description Clicking "Continue" acknowledges the warnings so the
   * caller can proceed with the imported document per IO-D-14
   * (warn-and-proceed).
   */
  it('calls onAcknowledge when Continue is clicked', () => {
    const onAcknowledge = vi.fn();

    render(
      <FormatImportWarningsModal
        isOpen={true}
        formatLabel="PSD"
        warnings={['w1']}
        onClose={vi.fn()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /acknowledge warnings and continue/i }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});

describe('FormatExportOptionsModal', () => {
  const defaults: FormatExportOptionsValue = {
    colorSpace: 'rgb',
    bitDepth: 8,
    embedIccProfile: true,
    linkSmartObjects: true,
    preserveVisibility: true,
  };

  /**
   * @description Only the `supportedFields` controls render. PSD
   * supports every field; SVG (later) will support only a subset so
   * this invariant matters cross-format.
   */
  it('renders only the controls the format declares support for', () => {
    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="PSD"
        supportedFields={new Set(['colorSpace'])}
        defaults={defaults}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/embed icc profile/i)).toBeNull();
    expect(screen.queryByLabelText(/keep smart objects linked/i)).toBeNull();
    expect(screen.queryByLabelText(/preserve hidden elements/i)).toBeNull();
  });

  /**
   * @description Clicking Export calls `onConfirm` with the current
   * options value. Defaults are returned when the user makes no
   * edits so the caller always receives a complete options object.
   */
  it('calls onConfirm with the current options on Export', () => {
    const onConfirm = vi.fn();

    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="PSD"
        supportedFields={new Set(['colorSpace', 'bitDepth', 'embedIccProfile', 'linkSmartObjects', 'preserveVisibility'])}
        defaults={defaults}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm export options/i }));
    expect(onConfirm).toHaveBeenCalledWith(defaults);
  });

  /**
   * @description Clicking Cancel calls `onCancel` without producing
   * an options object — the export action is aborted.
   */
  it('calls onCancel on Cancel', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="PSD"
        supportedFields={new Set(['colorSpace'])}
        defaults={defaults}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel export options/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
