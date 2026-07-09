/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormatPreflightModal, type PreflightFinding } from './index';

/**
 * Phase 1.3 of the cross-format-io improvement plan — the
 * `FormatPreflightModal` surfaces structured per-format export
 * findings (PPTX `PptxExportWarning`, PSD/SVG prose mapped to
 * `'preflight'` codes) grouped by severity. Mirrors the test layout
 * used by `format-modals.test.tsx` and `format-reconciliation.test.tsx`.
 */

const FINDINGS: readonly PreflightFinding[] = [
  { code: 'missing-font', message: 'Inter not embedded', severity: 'warning' },
  {
    code: 'cmyk-downgrade',
    message: 'CMYK downgraded to RGB',
    severity: 'warning',
    elementId: 'el-7',
    hint: 'Embed an ICC profile to preserve CMYK',
  },
  { code: 'document-too-large', message: '>200 MiB input', severity: 'error' },
];

describe('FormatPreflightModal', () => {
  /**
   * @description The modal does not render when closed — callers can
   * mount it unconditionally and toggle visibility via `isOpen`, the
   * same pattern other format modals use.
   */
  it('does not render when closed', () => {
    const { container } = render(
      <FormatPreflightModal isOpen={false} formatLabel="PSD" findings={FINDINGS} onClose={vi.fn()} />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /**
   * @description Empty findings render the "no findings" heading and
   * suppress the accordion entirely so the modal still tells the user
   * the export completed cleanly.
   */
  it('renders the empty state when no findings are reported', () => {
    render(<FormatPreflightModal isOpen={true} formatLabel="PSD" findings={[]} onClose={vi.fn()} />);

    expect(screen.getByText(/no findings/i)).toBeTruthy();
    expect(screen.queryByTestId('format-preflight-accordion')).toBeNull();
  });

  /**
   * @description Findings group by severity (errors first, then
   * warnings, then info), each section carries its count, and only
   * the severities present in the input render — missing severities
   * are suppressed.
   */
  it('groups findings by severity and shows per-section counts', () => {
    render(<FormatPreflightModal isOpen={true} formatLabel="PSD" findings={FINDINGS} onClose={vi.fn()} />);

    expect(screen.getByText(/3 findings/i)).toBeTruthy();
    expect(screen.getByText(/Errors \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/Warnings \(2\)/i)).toBeTruthy();
    expect(screen.queryByText(/Info \(/i)).toBeNull();
  });

  /**
   * @description Each finding renders its code, message, optional
   * element id, and optional hint so users can act on the underlying
   * cause rather than guessing from prose.
   */
  it('renders the code, message, element id, and hint for each finding', () => {
    render(<FormatPreflightModal isOpen={true} formatLabel="PSD" findings={FINDINGS} onClose={vi.fn()} />);

    expect(screen.getByText('missing-font')).toBeTruthy();
    expect(screen.getByText(/Inter not embedded/)).toBeTruthy();
    expect(screen.getByText('cmyk-downgrade')).toBeTruthy();
    expect(screen.getByText(/\(el-7\)/)).toBeTruthy();
    expect(screen.getByText(/Embed an ICC profile/)).toBeTruthy();
    expect(screen.getByText('document-too-large')).toBeTruthy();
  });

  /**
   * @description Without `proceedLabel` the modal is post-export and
   * shows a single Close action that calls `onClose`.
   */
  it('shows a single Close action when proceedLabel is omitted', () => {
    const onClose = vi.fn();

    render(<FormatPreflightModal isOpen={true} formatLabel="PSD" findings={FINDINGS} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /close preflight/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /cancel export/i })).toBeNull();
  });

  /**
   * @description With `proceedLabel` the modal is pre-export and
   * shows Cancel + the supplied proceed label, calling `onProceed`
   * when the proceed button is pressed.
   */
  it('renders Cancel + proceedLabel and routes Proceed through onProceed', () => {
    const onClose = vi.fn();
    const onProceed = vi.fn();

    render(
      <FormatPreflightModal
        isOpen={true}
        formatLabel="PDF"
        findings={FINDINGS}
        onClose={onClose}
        onProceed={onProceed}
        proceedLabel="Export anyway"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /export anyway/i }));
    expect(onProceed).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /cancel export/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
