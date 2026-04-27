import { Accordion, Button } from '@heroui/react';
import type { JSX } from 'react';

import { ModalShell } from './modal-shell';

/**
 * Phase 8 reconciliation diff modal — a richer surface than the
 * flat-string `FormatImportWarningsModal` for the case where a
 * Broadset-exported file has been edited externally (PowerPoint /
 * Keynote / Google Slides / etc.). Renders the four reconcile
 * buckets (modifications / additions / deletions / recoveredByHash)
 * with per-bucket counts and an expandable per-element list inside
 * each.
 *
 * The prop shape mirrors the `_shared/reconcile/` engine's output but
 * is declared structurally so this modal stays decoupled from the
 * formats package's runtime types — the demo (which has formats as a
 * direct dep) wires the modal up via the live `ReconcileResult`.
 */

export interface FormatReconciliationElementSummary {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

export interface FormatReconciliationData {
  readonly modifications: readonly FormatReconciliationElementSummary[];
  readonly additions: readonly FormatReconciliationElementSummary[];
  readonly deletions: readonly FormatReconciliationElementSummary[];
  readonly recoveredByHash: readonly FormatReconciliationElementSummary[];
}

export interface FormatReconciliationModalProps {
  readonly isOpen: boolean;
  readonly formatLabel: string;
  readonly data: FormatReconciliationData;
  readonly warnings: readonly string[];
  readonly onClose: () => void;
  readonly onAcknowledge: () => void;
}

interface BucketDescriptor {
  readonly key: 'modifications' | 'additions' | 'deletions' | 'recoveredByHash';
  readonly title: string;
  readonly emptyHint: string;
}

const BUCKETS: readonly BucketDescriptor[] = [
  {
    key: 'modifications',
    title: 'Modified externally',
    emptyHint: 'No elements were modified outside Broadset.',
  },
  {
    key: 'additions',
    title: 'Added externally',
    emptyHint: 'No new elements were added outside Broadset.',
  },
  {
    key: 'deletions',
    title: 'Removed externally',
    emptyHint: 'No elements were removed outside Broadset.',
  },
  {
    key: 'recoveredByHash',
    title: 'Identity recovered by content hash',
    emptyHint: 'No elements lost their shape-name tag during external editing.',
  },
];

function totalChanges(data: FormatReconciliationData): number {
  return data.modifications.length + data.additions.length + data.deletions.length + data.recoveredByHash.length;
}

function formatHeading(total: number): string {
  if (total === 0) return 'No external changes detected';

  const suffix = total === 1 ? '' : 's';

  return `${String(total)} external change${suffix} detected`;
}

export function FormatReconciliationModal({
  isOpen,
  formatLabel,
  data,
  warnings,
  onClose,
  onAcknowledge,
}: FormatReconciliationModalProps): JSX.Element {
  const total = totalChanges(data);
  const title = `${formatLabel} round-trip review`;
  const heading = formatHeading(total);

  return (
    <ModalShell isOpen={isOpen} size="lg" title={title} onClose={onClose}>
      <div
        aria-labelledby="format-reconciliation-heading"
        data-testid="format-reconciliation-body"
        style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <p id="format-reconciliation-heading" style={{ fontWeight: 600 }}>
          {heading}
        </p>

        <Accordion data-testid="format-reconciliation-accordion">
          {BUCKETS.map((bucket) => {
            const items = data[bucket.key];
            const heading2 = items.length === 0 ? bucket.title : `${bucket.title} (${String(items.length)})`;

            return (
              <Accordion.Item key={bucket.key}>
                <Accordion.Heading>
                  <Accordion.Trigger
                    data-testid={`format-reconciliation-bucket-${bucket.key}`}
                    aria-label={heading2}
                  >
                    {heading2}
                  </Accordion.Trigger>
                </Accordion.Heading>

                <Accordion.Panel>
                  {items.length === 0 ? (
                    <p style={{ margin: 0, opacity: 0.7 }}>{bucket.emptyHint}</p>
                  ) : (
                    <ul
                      aria-label={bucket.title}
                      data-testid={`format-reconciliation-list-${bucket.key}`}
                      style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                    >
                      {items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.name ?? item.id}</strong>
                          {item.description !== undefined && item.description.length > 0 ? (
                            <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>{item.description}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>

        {warnings.length > 0 ? (
          <details data-testid="format-reconciliation-warnings-details">
            <summary>Other import warnings ({String(warnings.length)})</summary>
            <ul style={{ margin: '0.5rem 0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {warnings.map((warning, index) => (
                <li key={`${String(index)}-${warning}`}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button onPress={onAcknowledge} aria-label="Acknowledge round-trip review and continue">
            Continue
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
