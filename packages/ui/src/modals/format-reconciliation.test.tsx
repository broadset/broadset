/** @vitest-environment jsdom */

import './test-helpers';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type FormatReconciliationData, FormatReconciliationModal, type ReconciliationChoice } from './index';

/**
 * Phase 8 — `FormatReconciliationModal` surfaces the four reconcile
 * buckets (modifications / additions / deletions / recoveredByHash)
 * for a Broadset-exported file that was edited externally before
 * being re-imported.
 */

const EMPTY_DATA: FormatReconciliationData = {
  modifications: [],
  additions: [],
  deletions: [],
  recoveredByHash: [],
};

describe('FormatReconciliationModal', () => {
  /**
   * @description Hidden when `isOpen=false` — callers can mount it
   * unconditionally and toggle via `isOpen`.
   */
  it('does not render when closed', () => {
    const { container } = render(
      <FormatReconciliationModal
        isOpen={false}
        formatLabel="PPTX"
        data={EMPTY_DATA}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  /**
   * @description Empty buckets render the "no external changes"
   * heading, the four bucket triggers, and no list items. The modal
   * stays useful for "everything matches" round-trips so users see
   * the reconcile pass succeeded.
   */
  it('renders all four bucket sections with empty hints when nothing changed', () => {
    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={EMPTY_DATA}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByText(/no external changes detected/i)).toBeTruthy();
    expect(screen.getByTestId('format-reconciliation-bucket-modifications')).toBeTruthy();
    expect(screen.getByTestId('format-reconciliation-bucket-additions')).toBeTruthy();
    expect(screen.getByTestId('format-reconciliation-bucket-deletions')).toBeTruthy();
    expect(screen.getByTestId('format-reconciliation-bucket-recoveredByHash')).toBeTruthy();
  });

  /**
   * @description Non-empty buckets carry a per-bucket count in the
   * trigger label and a list of element summaries inside the panel.
   */
  it('lists element summaries inside each non-empty bucket', () => {
    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={{
          ...EMPTY_DATA,
          modifications: [
            { id: 'rect-1', name: 'Header rectangle', description: 'position changed' },
            { id: 'text-1', name: 'Caption' },
          ],
          deletions: [{ id: 'qr-1', name: 'QR code' }],
        }}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByText(/3 external changes detected/i)).toBeTruthy();
    expect(screen.getByText(/Modified externally \(2\)/i)).toBeTruthy();
    expect(screen.getByText(/Removed externally \(1\)/i)).toBeTruthy();
    expect(screen.getByText('Header rectangle')).toBeTruthy();
    expect(screen.getByText('Caption')).toBeTruthy();
    expect(screen.getByText('QR code')).toBeTruthy();
    expect(screen.getByText('position changed')).toBeTruthy();
  });

  /**
   * @description Companion warnings render inside a `<details>` so
   * they're available without overwhelming the primary diff view.
   */
  it('renders companion warnings under a collapsed details section', () => {
    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={EMPTY_DATA}
        warnings={['Some animation effect dropped on export']}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByText(/other import warnings \(1\)/i)).toBeTruthy();
    expect(screen.getByText(/animation effect dropped/i)).toBeTruthy();
  });

  /**
   * @description Continue calls onAcknowledge so the caller can
   * proceed with the reconciled document.
   */
  it('calls onAcknowledge when Continue is clicked', () => {
    const onAcknowledge = vi.fn();

    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={EMPTY_DATA}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /acknowledge round-trip review and continue/i }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  /**
   * @description Phase 4.9 — every modification renders a "Use visual /
   * Use preserved" radio pair, defaulting to "Use visual" so today's
   * silent behaviour is preserved when the user just clicks Continue.
   */
  it('renders a Use visual / Use preserved radio for each modification, defaulting to visual', () => {
    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={{
          ...EMPTY_DATA,
          modifications: [
            { id: 'rect-1', name: 'Header rectangle', description: 'position changed' },
            { id: 'text-1', name: 'Caption' },
          ],
        }}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
      />,
    );

    const useVisualRect = screen.getByRole('radio', { name: /use visual version of header rectangle/i });
    const usePreservedRect = screen.getByRole('radio', { name: /use preserved version of header rectangle/i });
    const useVisualCaption = screen.getByRole('radio', { name: /use visual version of caption/i });

    expect((useVisualRect as HTMLInputElement).checked).toBe(true);
    expect((usePreservedRect as HTMLInputElement).checked).toBe(false);
    expect((useVisualCaption as HTMLInputElement).checked).toBe(true);
  });

  /**
   * @description Phase 4.9 — when the user picks "Use preserved" for a
   * modification and clicks Continue, `onAcknowledgeWithChoices` fires
   * with that element id mapped to `'preserved'`. Untouched
   * modifications default to `'visual'` in the same payload so the demo
   * doesn't have to fill defaults itself.
   */
  it('reports per-modification choices via onAcknowledgeWithChoices on Continue', () => {
    const onAcknowledgeWithChoices = vi.fn();

    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={{
          ...EMPTY_DATA,
          modifications: [
            { id: 'rect-1', name: 'Header rectangle' },
            { id: 'text-1', name: 'Caption' },
          ],
        }}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
        onAcknowledgeWithChoices={onAcknowledgeWithChoices}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /use preserved version of header rectangle/i }));
    fireEvent.click(screen.getByRole('button', { name: /acknowledge round-trip review and continue/i }));

    expect(onAcknowledgeWithChoices).toHaveBeenCalledTimes(1);

    const choices = onAcknowledgeWithChoices.mock.calls[0]?.[0] as ReadonlyMap<string, ReconciliationChoice>;

    expect(choices.get('rect-1')).toBe('preserved');
    expect(choices.get('text-1')).toBe('visual');
  });

  /**
   * @description Phase 4.9 — with no modifications, the choice UI does
   * not render but Continue still works and reports an empty choices
   * map (so callers can call `applyReconciliationChoices` unconditionally).
   */
  it('produces an empty choices map and still acknowledges when no modifications', () => {
    const onAcknowledgeWithChoices = vi.fn();

    render(
      <FormatReconciliationModal
        isOpen={true}
        formatLabel="PPTX"
        data={EMPTY_DATA}
        warnings={[]}
        onClose={vi.fn()}
        onAcknowledge={vi.fn()}
        onAcknowledgeWithChoices={onAcknowledgeWithChoices}
      />,
    );

    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /acknowledge round-trip review and continue/i }));

    expect(onAcknowledgeWithChoices).toHaveBeenCalledTimes(1);

    const choices = onAcknowledgeWithChoices.mock.calls[0]?.[0] as ReadonlyMap<string, ReconciliationChoice>;

    expect(choices.size).toBe(0);
  });
});
