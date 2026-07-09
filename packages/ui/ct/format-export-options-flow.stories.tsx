import { useState } from 'react';

import { ExportModal } from '../src/modals/core-modals';

/**
 * Phase 1.1 (cross-format-io-improvement-plan) — CT harness for the
 * FormatExportOptionsModal wiring inside ExportModal.
 *
 * The harness mounts the real `ExportModal` and records every
 * `onExport` call so the test can assert that:
 *
 *  - clicking a format button selects that exporter,
 *  - clicking "Options…" opens the FormatExportOptionsModal,
 *  - confirming the options modal commits the values into
 *    ExportModal's `formatOptions` state,
 *  - clicking the outer "Export" button forwards the format-scoped
 *    options block (`svgOptions` / `psdOptions` / `pdfOptions` /
 *    `pptxOptions`) into the `onExport` payload.
 *
 * The harness mounts the real ExportModal so dropdown interactions
 * exercise the canonical HeroUI `Select.Trigger` / `Select.Popover` /
 * `ListBox` shape used by FormatExportOptionsModal. The default-value
 * round trip plus at least one Select-driven value change are both
 * covered by the CT spec.
 */

interface ExportCallRecord {
  readonly exporter: string;
  readonly data: Readonly<Record<string, unknown>>;
}

interface FormatHarnessProps {
  readonly format: 'pdf' | 'psd' | 'pptx' | 'svg';
}

export function ExportModalFormatOptionsHarness({ format }: FormatHarnessProps): React.JSX.Element {
  const [calls, setCalls] = useState<readonly ExportCallRecord[]>([]);

  return (
    <div>
      <ExportModal
        isOpen={true}
        enabledExporters={[format]}
        dynamicData={{}}
        onExport={(exporter, data) => {
          setCalls((prev) => [...prev, { exporter, data }]);
        }}
        onClose={() => undefined}
      />
      <output aria-label="export-call-count">{String(calls.length)}</output>
      <output aria-label="export-call-payload">{JSON.stringify(calls[calls.length - 1] ?? null)}</output>
    </div>
  );
}
