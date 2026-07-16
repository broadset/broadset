import { Accordion, Button, Radio, RadioGroup } from '@heroui/react';
import { type JSX, useCallback, useMemo, useState } from 'react';

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
 * CFIO.4.9 (plan-progress.md §CFIO) added per-modification
 * "Use preserved / Use visual" radio choices on top: every entry in the
 * modifications bucket gets a radio pair so the user can pick — per
 * element — whether to keep the externally-edited version (default,
 * "Use visual") or revert to the last-Broadset-export version
 * ("Use preserved"). Closes pptx-known-gaps §A1.
 *
 * The prop shape mirrors the `_shared/reconcile/` engine's output but
 * is declared structurally so this modal stays decoupled from the
 * formats package's runtime types — the demo (which has formats as a
 * direct dep) wires the modal up via the live `ReconcileResult`. The
 * choice state is keyed by element id; the demo resolves the actual
 * v1 element references in `onAcknowledgeWithChoices`.
 */

/** Per-modification user choice. Default is `'visual'` — keep the externally-edited element. */
export type ReconciliationChoice = 'preserved' | 'visual';

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
  /**
   * Phase 4.9 — fired when the user clicks Continue after picking a
   * "Use preserved / Use visual" choice for each modified element. The
   * map key is the element id; the value is the user's choice
   * (`'visual'` for entries the user did not explicitly switch). The
   * demo applies these choices via `applyReconciliationChoices` from
   * `@broadset/formats` before calling `loadTemplate`.
   *
   * When omitted, the modal falls back to `onAcknowledge()` so callers
   * that don't yet wire choice resolution keep their existing behaviour
   * (silent "Use visual" for every modification).
   */
  readonly onAcknowledgeWithChoices?: (choices: ReadonlyMap<string, ReconciliationChoice>) => void;
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

const DEFAULT_CHOICE: ReconciliationChoice = 'visual';

function totalChanges(data: FormatReconciliationData): number {
  return data.modifications.length + data.additions.length + data.deletions.length + data.recoveredByHash.length;
}

function formatHeading(total: number): string {
  if (total === 0) return 'No external changes detected';

  const suffix = total === 1 ? '' : 's';

  return `${String(total)} external change${suffix} detected`;
}

function isReconciliationChoice(value: string): value is ReconciliationChoice {
  return value === 'preserved' || value === 'visual';
}

interface ModificationChoiceRowProps {
  readonly item: FormatReconciliationElementSummary;
  readonly choice: ReconciliationChoice;
  readonly onChange: (id: string, choice: ReconciliationChoice) => void;
}

function ModificationChoiceRow({ item, choice, onChange }: ModificationChoiceRowProps): JSX.Element {
  const label = item.name ?? item.id;
  const groupAriaLabel = `Reconciliation choice for ${label}`;

  return (
    <li
      data-testid={`format-reconciliation-modification-${item.id}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
    >
      <div>
        <strong>{label}</strong>
        {item.description !== undefined && item.description.length > 0 ?
          <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>{item.description}</span>
        : null}
      </div>
      <RadioGroup
        aria-label={groupAriaLabel}
        data-testid={`format-reconciliation-choice-${item.id}`}
        value={choice}
        onChange={(next) => {
          if (isReconciliationChoice(next)) onChange(item.id, next);
        }}
      >
        <Radio value="visual" aria-label={`Use visual version of ${label}`}>
          Use visual
        </Radio>
        <Radio value="preserved" aria-label={`Use preserved version of ${label}`}>
          Use preserved
        </Radio>
      </RadioGroup>
    </li>
  );
}

interface BucketSectionProps {
  readonly bucket: BucketDescriptor;
  readonly items: readonly FormatReconciliationElementSummary[];
  readonly choices: ReadonlyMap<string, ReconciliationChoice>;
  readonly onChoiceChange: (id: string, choice: ReconciliationChoice) => void;
}

function BucketSection({ bucket, items, choices, onChoiceChange }: BucketSectionProps): JSX.Element {
  const heading = items.length === 0 ? bucket.title : `${bucket.title} (${String(items.length)})`;

  return (
    <Accordion.Item key={bucket.key}>
      <Accordion.Heading>
        <Accordion.Trigger data-testid={`format-reconciliation-bucket-${bucket.key}`} aria-label={heading}>
          {heading}
        </Accordion.Trigger>
      </Accordion.Heading>

      <Accordion.Panel>
        {items.length === 0 ?
          <p style={{ margin: 0, opacity: 0.7 }}>{bucket.emptyHint}</p>
        : <ul
            aria-label={bucket.title}
            data-testid={`format-reconciliation-list-${bucket.key}`}
            style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
          >
            {items.map((item) =>
              bucket.key === 'modifications' ?
                <ModificationChoiceRow
                  key={item.id}
                  item={item}
                  choice={choices.get(item.id) ?? DEFAULT_CHOICE}
                  onChange={onChoiceChange}
                />
              : <li key={item.id}>
                  <strong>{item.name ?? item.id}</strong>
                  {item.description !== undefined && item.description.length > 0 ?
                    <span style={{ marginLeft: '0.5rem', opacity: 0.75 }}>{item.description}</span>
                  : null}
                </li>,
            )}
          </ul>
        }
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function FormatReconciliationModal({
  isOpen,
  formatLabel,
  data,
  warnings,
  onClose,
  onAcknowledge,
  onAcknowledgeWithChoices,
}: FormatReconciliationModalProps): JSX.Element {
  const total = totalChanges(data);
  const title = `${formatLabel} round-trip review`;
  const heading = formatHeading(total);

  // Choice state lives in the modal so the user can flip radios before
  // committing on Continue. Defaults every modification to `'visual'`
  // (today's silent-default behaviour).
  const [choices, setChoices] = useState<ReadonlyMap<string, ReconciliationChoice>>(() => new Map());

  const handleChoiceChange = useCallback((id: string, choice: ReconciliationChoice): void => {
    setChoices((prev) => {
      const next = new Map(prev);

      next.set(id, choice);

      return next;
    });
  }, []);

  // Resolve the final choices map at acknowledge time so every
  // modification id has an explicit entry — defaults to `'visual'` for
  // ones the user never touched. Lets the demo's
  // `applyReconciliationChoices` skip a separate "default fill" pass.
  const resolveFinalChoices = useCallback((): ReadonlyMap<string, ReconciliationChoice> => {
    const resolved = new Map<string, ReconciliationChoice>();

    for (const item of data.modifications) {
      resolved.set(item.id, choices.get(item.id) ?? DEFAULT_CHOICE);
    }

    return resolved;
  }, [choices, data.modifications]);

  const handleContinue = useCallback((): void => {
    if (onAcknowledgeWithChoices !== undefined) {
      onAcknowledgeWithChoices(resolveFinalChoices());

      return;
    }

    onAcknowledge();
  }, [onAcknowledge, onAcknowledgeWithChoices, resolveFinalChoices]);

  const sections = useMemo(
    () =>
      BUCKETS.map((bucket) => (
        <BucketSection
          key={bucket.key}
          bucket={bucket}
          items={data[bucket.key]}
          choices={choices}
          onChoiceChange={handleChoiceChange}
        />
      )),
    [choices, data, handleChoiceChange],
  );

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

        <Accordion data-testid="format-reconciliation-accordion">{sections}</Accordion>

        {warnings.length > 0 ?
          <Accordion data-testid="format-reconciliation-warnings-details">
            <Accordion.Item key="other-warnings">
              <Accordion.Heading>
                <Accordion.Trigger
                  aria-label="Other import warnings"
                  data-testid="format-reconciliation-warnings-summary"
                >
                  Other import warnings ({String(warnings.length)})
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <ul style={{ margin: '0.5rem 0 0 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {warnings.map((warning, index) => (
                    <li key={`${String(index)}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        : null}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button onPress={handleContinue} aria-label="Acknowledge round-trip review and continue">
            Continue
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
