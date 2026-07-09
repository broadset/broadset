import { Accordion, Button } from '@heroui/react';
import type { JSX } from 'react';

import { color, sp } from '../tokens';
import { ModalShell } from './modal-shell';

/**
 * Phase 1.3 of the cross-format-io improvement plan — structured
 * preflight + validation findings surface for export. Replaces the
 * silent flatten of `PptxExportReport.warnings` (and the prose-only
 * PSD/SVG warnings) into a single toast string by grouping per-format
 * findings by severity (error / warning / info), exposing each
 * finding's machine code, optional element id, and optional hint.
 *
 * The modal is decoupled from any concrete formats package type:
 * callers map their per-format warning shape into the
 * `PreflightFinding` view-model below before opening the modal. This
 * keeps the modal reusable across PPTX (already structured),
 * PSD/SVG (prose, mapped to a generic `'preflight'` code today), and
 * PDF (empty until structured preflight lands in Phase 4.2 / 5.8).
 */

export type PreflightSeverity = 'error' | 'info' | 'warning';

export interface PreflightFinding {
  readonly code: string;
  readonly message: string;
  readonly severity: PreflightSeverity;
  readonly elementId?: string;
  readonly hint?: string;
}

export interface FormatPreflightModalProps {
  readonly isOpen: boolean;
  readonly formatLabel: string;
  readonly findings: readonly PreflightFinding[];
  readonly onClose: () => void;
  readonly onProceed?: () => void;
  /**
   * When omitted the modal is post-export and shows a single Close
   * action. When set the modal is pre-export and shows Cancel +
   * the supplied proceed label, calling `onProceed` when pressed.
   */
  readonly proceedLabel?: string;
}

interface SeverityDescriptor {
  readonly key: PreflightSeverity;
  readonly label: string;
}

/**
 * Render order — errors first, then warnings, then info — so the most
 * actionable findings are always at the top of the accordion.
 */
const SEVERITY_DESCRIPTORS: readonly SeverityDescriptor[] = [
  { key: 'error', label: 'Errors' },
  { key: 'warning', label: 'Warnings' },
  { key: 'info', label: 'Info' },
];

function groupBySeverity(
  findings: readonly PreflightFinding[],
): ReadonlyMap<PreflightSeverity, readonly PreflightFinding[]> {
  const grouped = new Map<PreflightSeverity, PreflightFinding[]>();

  for (const finding of findings) {
    const existing = grouped.get(finding.severity) ?? [];

    existing.push(finding);
    grouped.set(finding.severity, existing);
  }

  return grouped;
}

function buildHeading(count: number): string {
  if (count === 0) return 'No findings — export completed cleanly.';

  const suffix = count === 1 ? '' : 's';

  return `${String(count)} finding${suffix} reported.`;
}

export function FormatPreflightModal({
  isOpen,
  formatLabel,
  findings,
  onClose,
  onProceed,
  proceedLabel,
}: FormatPreflightModalProps): JSX.Element {
  const grouped = groupBySeverity(findings);
  const title = `${formatLabel} preflight`;
  const heading = buildHeading(findings.length);

  return (
    <ModalShell isOpen={isOpen} size="lg" title={title} onClose={onClose}>
      <div
        aria-labelledby="format-preflight-heading"
        data-testid="format-preflight-body"
        style={{ padding: sp('sp-05'), display: 'flex', flexDirection: 'column', gap: sp('sp-04') }}
      >
        <p id="format-preflight-heading" style={{ fontWeight: 600 }}>
          {heading}
        </p>

        {findings.length === 0 ? null : (
          <Accordion data-testid="format-preflight-accordion">
            {SEVERITY_DESCRIPTORS.map((descriptor) => {
              const items = grouped.get(descriptor.key) ?? [];

              if (items.length === 0) return null;

              const sectionHeading = `${descriptor.label} (${String(items.length)})`;

              return (
                <Accordion.Item key={descriptor.key}>
                  <Accordion.Heading>
                    <Accordion.Trigger
                      data-testid={`format-preflight-bucket-${descriptor.key}`}
                      aria-label={sectionHeading}
                    >
                      {sectionHeading}
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <ul
                      aria-label={descriptor.label}
                      data-testid={`format-preflight-list-${descriptor.key}`}
                      style={{
                        margin: 0,
                        paddingLeft: sp('sp-06'),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: sp('sp-02'),
                      }}
                    >
                      {items.map((finding, index) => (
                        <li key={`${finding.code}-${finding.elementId ?? ''}-${String(index)}`}>
                          <strong>{finding.code}</strong>
                          {finding.elementId !== undefined && finding.elementId.length > 0 ?
                            <span style={{ marginLeft: sp('sp-02'), color: color('muted') }}>
                              ({finding.elementId})
                            </span>
                          : null}
                          <span>: {finding.message}</span>
                          {finding.hint !== undefined && finding.hint.length > 0 ?
                            <em style={{ marginLeft: sp('sp-02'), color: color('muted') }}>{finding.hint}</em>
                          : null}
                        </li>
                      ))}
                    </ul>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        )}

        <div style={{ display: 'flex', gap: sp('sp-03'), justifyContent: 'flex-end' }}>
          {proceedLabel === undefined ?
            <Button variant="primary" onPress={onClose} aria-label="Close preflight">
              Close
            </Button>
          : <>
              <Button variant="ghost" onPress={onClose} aria-label="Cancel export">
                Cancel
              </Button>
              <Button
                variant="primary"
                aria-label={proceedLabel}
                onPress={() => {
                  onProceed?.();
                }}
              >
                {proceedLabel}
              </Button>
            </>
          }
        </div>
      </div>
    </ModalShell>
  );
}
