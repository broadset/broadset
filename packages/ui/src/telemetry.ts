import type { PreflightFinding } from './modals/format-preflight';

/**
 * Structured telemetry event the demo (or any host application)
 * emits to a sink. Today the only event surface is per-format
 * preflight findings — the codes drive prioritisation of follow-up
 * gap closures (e.g., should we invest in PSD CMYK first, or PPTX
 * shape-fidelity?).
 *
 * Closes pptx-known-gaps B1 and generalises across all four format
 * tracks: any host that wires {@link TelemetrySink} sees the same
 * shape regardless of which exporter ran.
 *
 * **No payload bytes are emitted.** Only the `code`, `severity`, and
 * an optional anonymised `formatLabel` ride through. Document
 * content, element ids, and free-form `message` / `hint` strings stay
 * local to the host — the sink's job is COUNTS, not inspection.
 */

export type TelemetryEvent =
  | {
      readonly kind: 'export-preflight';
      /** Format the export targeted (`'pdf'`, `'psd'`, `'pptx'`, `'svg'`). */
      readonly formatLabel: string;
      /** The finding's `code`, e.g. `'font-embed-skipped'`, `'shadow-truncated'`. */
      readonly code: string;
      /** Severity bucket ('info' / 'warning' / 'error'). */
      readonly severity: 'info' | 'warning' | 'error';
    }
  | {
      readonly kind: 'export-completed';
      readonly formatLabel: string;
      /** Whether the export produced any findings. */
      readonly hadFindings: boolean;
    };

export interface TelemetrySink {
  readonly emit: (event: TelemetryEvent) => void;
}

/**
 * Default sink: drops every event. Production deployments without a
 * telemetry pipeline configured see no behavioural change vs the
 * pre-Phase 5.4 state.
 */
export const noopTelemetrySink: TelemetrySink = {
  emit: () => {
    /* intentional no-op */
  },
};

/**
 * In-memory aggregating sink for development + tests. Counts events
 * by `(kind, formatLabel, code)` so callers can inspect the running
 * tally without persistence. Intended for `npm run dev` debugging
 * and unit tests — not for production.
 */
export interface AggregatingTelemetrySink extends TelemetrySink {
  readonly counts: ReadonlyMap<string, number>;
  readonly reset: () => void;
}

export function createAggregatingTelemetrySink(): AggregatingTelemetrySink {
  const counts = new Map<string, number>();

  return {
    emit: (event) => {
      const key =
        event.kind === 'export-preflight'
          ? `${event.kind}:${event.formatLabel}:${event.severity}:${event.code}`
          : `${event.kind}:${event.formatLabel}:${String(event.hadFindings)}`;

      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    counts,
    reset: () => {
      counts.clear();
    },
  };
}

/**
 * Convenience: emit one `'export-preflight'` event per finding plus
 * one trailing `'export-completed'` event with the rollup. Hosts call
 * this once after each export's preflight resolves.
 */
export function emitExportPreflightEvents(
  sink: TelemetrySink,
  formatLabel: string,
  findings: readonly PreflightFinding[],
): void {
  for (const finding of findings) {
    sink.emit({
      kind: 'export-preflight',
      formatLabel,
      code: finding.code,
      severity: finding.severity,
    });
  }

  sink.emit({
    kind: 'export-completed',
    formatLabel,
    hadFindings: findings.length > 0,
  });
}
