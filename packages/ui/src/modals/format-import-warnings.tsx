import { Button } from '@heroui/react';
import type { JSX } from 'react';

import { ModalShell } from './modal-shell';

/**
 * Phase 5 interleave I5.1 — shared import-warnings modal. Every format
 * importer (PSD/PDF/SVG/PPTX) reports a list of `warnings` alongside
 * the imported document; this modal surfaces them in a consistent
 * shape so users always see what was skipped and why, per IO-D-18
 * (no silent drops).
 */

export interface FormatImportWarningsModalProps {
  readonly isOpen: boolean;
  readonly formatLabel: string;
  readonly warnings: readonly string[];
  readonly onClose: () => void;
  readonly onAcknowledge: () => void;
}

export function FormatImportWarningsModal({
  isOpen,
  formatLabel,
  warnings,
  onClose,
  onAcknowledge,
}: FormatImportWarningsModalProps): JSX.Element {
  const title = `${formatLabel} import warnings`;
  const suffix = warnings.length === 1 ? '' : 's';
  const heading = warnings.length === 0 ? 'No warnings' : `${String(warnings.length)} warning${suffix}`;

  return (
    <ModalShell isOpen={isOpen} size="md" title={title} onClose={onClose}>
      <div
        aria-labelledby="format-import-warnings-heading"
        data-testid="format-import-warnings-body"
        style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <p id="format-import-warnings-heading" style={{ fontWeight: 600 }}>
          {heading}
        </p>

        {warnings.length > 0 ? (
          <ul
            aria-label={`${formatLabel} import warnings`}
            data-testid="format-import-warnings-list"
            style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
          >
            {warnings.map((warning, index) => (
              <li key={`${String(index)}-${warning}`}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button onPress={onAcknowledge} aria-label="Acknowledge warnings and continue">
            Continue
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
