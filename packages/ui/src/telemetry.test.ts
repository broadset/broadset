import { describe, expect, it } from 'vitest';

import type { PreflightFinding } from './modals/format-preflight';
import {
  createAggregatingTelemetrySink,
  emitExportPreflightEvents,
  noopTelemetrySink,
} from './telemetry';

describe('telemetry sinks', () => {
  it('noopTelemetrySink swallows every event without throwing', () => {
    expect(() => {
      noopTelemetrySink.emit({ kind: 'export-completed', formatLabel: 'pdf', hadFindings: false });
      noopTelemetrySink.emit({
        kind: 'export-preflight',
        formatLabel: 'svg',
        code: 'font-embed-skipped',
        severity: 'warning',
      });
    }).not.toThrow();
  });

  it('aggregating sink counts events keyed by (kind, formatLabel, ...)', () => {
    const sink = createAggregatingTelemetrySink();

    sink.emit({ kind: 'export-preflight', formatLabel: 'pptx', code: 'font-embed-skipped', severity: 'warning' });
    sink.emit({ kind: 'export-preflight', formatLabel: 'pptx', code: 'font-embed-skipped', severity: 'warning' });
    sink.emit({ kind: 'export-preflight', formatLabel: 'pptx', code: 'shadow-truncated', severity: 'warning' });
    sink.emit({ kind: 'export-completed', formatLabel: 'pptx', hadFindings: true });

    expect(sink.counts.get('export-preflight:pptx:warning:font-embed-skipped')).toBe(2);
    expect(sink.counts.get('export-preflight:pptx:warning:shadow-truncated')).toBe(1);
    expect(sink.counts.get('export-completed:pptx:true')).toBe(1);
  });

  it('reset clears aggregated counts', () => {
    const sink = createAggregatingTelemetrySink();

    sink.emit({ kind: 'export-completed', formatLabel: 'pdf', hadFindings: false });
    expect(sink.counts.size).toBe(1);

    sink.reset();
    expect(sink.counts.size).toBe(0);
  });

  it('emitExportPreflightEvents emits one event per finding plus one rollup', () => {
    const sink = createAggregatingTelemetrySink();
    const findings: readonly PreflightFinding[] = [
      { code: 'missing-font', message: 'Inter not embedded', severity: 'warning' },
      { code: 'cmyk-downgrade', message: 'CMYK downgraded to RGB', severity: 'warning' },
    ];

    emitExportPreflightEvents(sink, 'psd', findings);

    expect(sink.counts.get('export-preflight:psd:warning:missing-font')).toBe(1);
    expect(sink.counts.get('export-preflight:psd:warning:cmyk-downgrade')).toBe(1);
    expect(sink.counts.get('export-completed:psd:true')).toBe(1);
  });

  it('empty findings still emits export-completed with hadFindings=false', () => {
    const sink = createAggregatingTelemetrySink();

    emitExportPreflightEvents(sink, 'svg', []);

    expect(sink.counts.size).toBe(1);
    expect(sink.counts.get('export-completed:svg:false')).toBe(1);
  });
});
