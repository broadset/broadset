import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptxWithReport } from './import';

/**
 * @description Performance + memory regression gates for the PPTX
 * importer + exporter.
 *
 * The Importer Security Contract caps input size at 200 MiB and
 * mandates bounded execution time. These tests anchor a realistic
 * upper bound at much smaller sizes — if a regression makes import
 * slower than O(n) in element count, the bound is what catches it
 * before someone tries a 50 MB customer deck and the demo hangs.
 *
 * The repeated-import test pins the steady-state heap delta after
 * 50 round-trips of a single document. Elements that retain
 * references to per-import scratch (XML AST nodes, canvas style
 * caches, fontkit handles) would drift the steady-state up linearly
 * with iterations — this test fails when that drift exceeds a
 * generous threshold.
 *
 * Both tests are skip-clean on environments that lack
 * `globalThis.gc` (Node without --expose-gc) — set
 * `BROADSET_GC_AVAILABLE=1` and run via `node --expose-gc` to opt in.
 */

const PERF_ELEMENT_COUNT = 1_000;
const PERF_IMPORT_BUDGET_MS = 5_000;
const PERF_EXPORT_BUDGET_MS = 3_000;
const MEMORY_REPEAT_COUNT = 50;
const MEMORY_DELTA_BUDGET_BYTES = 50 * 1024 * 1024; // 50 MiB

function buildLargeDocument(elementCount: number): ReturnType<typeof createEmptyBroadsetDocument> {
  const baseDoc = createEmptyBroadsetDocument();
  const elements = Array.from({ length: elementCount }, (_, i) =>
    createDefaultElement('rectangle', {
      id: `rect-${String(i)}`,
      name: `Rectangle ${String(i)}`,
      position: { x: i % 200, y: Math.floor(i / 200) * 30 },
      width: 30,
      height: 20,
    }),
  );

  return { ...baseDoc, elements };
}

interface MemoryReading {
  readonly heapUsed: number;
}

function readHeap(): MemoryReading {
  return { heapUsed: process.memoryUsage().heapUsed };
}

describe('PPTX importer + exporter performance', () => {
  it(`exports a ${String(PERF_ELEMENT_COUNT)}-element document within ${String(PERF_EXPORT_BUDGET_MS)} ms`, () => {
    const doc = buildLargeDocument(PERF_ELEMENT_COUNT);
    const start = process.hrtime.bigint();
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(
      elapsedMs,
      `export took ${elapsedMs.toFixed(0)} ms — investigate before raising the budget`,
    ).toBeLessThan(PERF_EXPORT_BUDGET_MS);
  });

  it(`imports a ${String(PERF_ELEMENT_COUNT)}-element document within ${String(PERF_IMPORT_BUDGET_MS)} ms`, () => {
    const doc = buildLargeDocument(PERF_ELEMENT_COUNT);
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const start = process.hrtime.bigint();
    const report = importPptxWithReport(bytes);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    expect(report.document.elements.length).toBeGreaterThan(0);
    expect(
      elapsedMs,
      `import took ${elapsedMs.toFixed(0)} ms — investigate before raising the budget`,
    ).toBeLessThan(PERF_IMPORT_BUDGET_MS);
  });
});

describe('PPTX importer memory steady-state', () => {
  /**
   * @description After N repeated import round-trips of the same
   * document, the heap delta must stay bounded — drift means an
   * importer-internal cache or AST node retention is leaking. The
   * threshold is generous (50 MiB) to account for V8 GC scheduling
   * and one-time module initialisation; a real leak grows linearly
   * with iterations and blows past it.
   */
  it(`does not leak >${String(MEMORY_DELTA_BUDGET_BYTES / 1024 / 1024)} MiB after ${String(MEMORY_REPEAT_COUNT)} import round-trips`, () => {
    if (typeof globalThis.gc !== 'function') {
      // No --expose-gc; we can't trigger a deterministic GC, so the
      // measurement is too noisy. Skip cleanly rather than flake.
      expect(typeof globalThis.gc).toBe('undefined');

      return;
    }

    const baseDoc = buildLargeDocument(100);
    const bytes = exportPptxBytes(baseDoc, { preserveBroadsetMetadata: false });

    // Warm-up: prime any one-time module initialisation.
    importPptxWithReport(bytes);
    globalThis.gc();

    const before = readHeap();

    for (let i = 0; i < MEMORY_REPEAT_COUNT; i += 1) {
      importPptxWithReport(bytes);
    }

    globalThis.gc();

    const after = readHeap();
    const delta = after.heapUsed - before.heapUsed;

    expect(
      delta,
      `heap grew by ${(delta / 1024 / 1024).toFixed(1)} MiB after ${String(MEMORY_REPEAT_COUNT)} imports — possible leak`,
    ).toBeLessThan(MEMORY_DELTA_BUDGET_BYTES);
  });
});
