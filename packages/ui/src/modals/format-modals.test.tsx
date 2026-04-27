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

describe('Cross-format reuse (I6.1 / I7.1 / I8.1)', () => {
  /**
   * @description The shared modal is format-agnostic — it renders
   * correctly with PDF, SVG, and PPTX labels so PDF / SVG / PPTX
   * tracks reuse it unchanged under interleaves I6.1 / I7.1 / I8.1.
   */
  it.each(['PDF', 'SVG', 'PPTX'])('renders the shared import-warnings modal for %s', (label) => {
    render(
      <FormatImportWarningsModal
        isOpen={true}
        formatLabel={label}
        warnings={['one', 'two']}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getAllByLabelText(`${label} import warnings`).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 warnings/i)).toBeTruthy();
  });

  /**
   * @description Each format track declares its own `supportedFields`
   * set so PDF (which cares about `colorSpace`/`embedIccProfile`),
   * SVG (no color-mode choice), and PPTX (picture / theme-driven)
   * all get a narrowed UI without a one-off modal per format.
   */
  it('renders the shared export-options modal with PDF-specific fields', () => {
    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="PDF"
        supportedFields={new Set(['colorSpace', 'embedIccProfile'])}
        defaults={{
          colorSpace: 'cmyk',
          bitDepth: 8,
          embedIccProfile: true,
          linkSmartObjects: true,
          preserveVisibility: true,
          fontEmbedding: 'embed',
          includeMetadata: true,
          includeElementTagging: true,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // Selects render as <select> with <option value="..."> children — use role to find them.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/embed icc profile/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/keep smart objects linked/i)).toBeNull();
    expect(screen.queryByLabelText(/preserve hidden elements/i)).toBeNull();
    expect(screen.queryByLabelText(/font embedding/i)).toBeNull();
    expect(screen.queryByLabelText(/include document metadata/i)).toBeNull();
  });

  /**
   * @description P7.6 — the SVG track opts into `fontEmbedding`,
   * `includeMetadata`, `includeElementTagging`, and skips the
   * PSD/PDF-specific fields (colour space / bit depth / ICC /
   * smart objects). Each SVG control renders with its labelled
   * HeroUI component per the HeroUI mandate.
   */
  it('renders the SVG-specific supported fields when declared', () => {
    render(
      <FormatExportOptionsModal
        isOpen={true}
        formatLabel="SVG"
        supportedFields={new Set(['fontEmbedding', 'includeMetadata', 'includeElementTagging'])}
        defaults={{
          colorSpace: 'rgb',
          bitDepth: 8,
          embedIccProfile: false,
          linkSmartObjects: false,
          preserveVisibility: true,
          fontEmbedding: 'embed',
          includeMetadata: true,
          includeElementTagging: true,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    // HeroUI's Select renders aria-label on the wrapping listbox,
    // not the native <select>, so the font-embedding control is
    // verified via its option values rather than label lookup.
    const options = screen.getAllByRole('option');
    const optionValues = options.map((el) => (el as HTMLOptionElement).value);

    expect(optionValues).toContain('embed');
    expect(optionValues).toContain('reference');
    expect(optionValues).toContain('flatten');

    expect(screen.getAllByLabelText(/include document metadata/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/include per-element tagging/i).length).toBeGreaterThan(0);
    // SVG-specific supportedFields — PDF/PSD options MUST NOT appear.
    expect(screen.queryByLabelText(/embed icc profile/i)).toBeNull();
    expect(screen.queryByLabelText(/keep smart objects linked/i)).toBeNull();
  });
});

describe('FormatExportOptionsModal', () => {
  const defaults: FormatExportOptionsValue = {
    colorSpace: 'rgb',
    bitDepth: 8,
    embedIccProfile: true,
    linkSmartObjects: true,
    preserveVisibility: true,
    fontEmbedding: 'embed',
    includeMetadata: true,
    includeElementTagging: true,
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
