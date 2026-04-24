/**
 * P7.1 — SVG public API shape.
 *
 * The Phase 7 plan fixes the SVG module's public surface to four
 * entry points — `exportSvgString`, `exportSvgDocument`,
 * `importSvgDocument`, `canRoundTrip` — plus the typed option and
 * metadata surface. This test pins the barrel so later phases cannot
 * silently drop or rename any of them.
 *
 * Future loops reading this suite: if you need to add a new symbol
 * to the SVG barrel, add a test here first — the red/green loop
 * makes the API contract explicit.
 */
import { createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import * as svgBarrel from './index';

describe('SVG public API', () => {
  /**
   * @description The four headline entry points MUST be exported from
   * the barrel. Missing one breaks `import-document.ts` wiring.
   */
  it('exports the four headline functions', () => {
    expect(typeof svgBarrel.exportSvgString).toBe('function');
    expect(typeof svgBarrel.exportSvgDocument).toBe('function');
    expect(typeof svgBarrel.importSvgDocument).toBe('function');
    expect(typeof svgBarrel.canRoundTrip).toBe('function');
  });

  /**
   * @description The typed options and Zod schemas MUST be exported
   * so demo wiring (`formatBridge.ts`) and future format-modals can
   * validate untyped input.
   */
  it('exports the typed option and schema surface', () => {
    expect(svgBarrel.fontEmbedChoiceSchema).toBeDefined();
    expect(svgBarrel.unitSystemSchema).toBeDefined();
    expect(svgBarrel.svgImportOptionsSchema).toBeDefined();
    expect(svgBarrel.svgExportOptionsSchema).toBeDefined();
    expect(svgBarrel.broadsetRdfPacketSchema).toBeDefined();
    expect(svgBarrel.elementTagAttrsSchema).toBeDefined();
    expect(svgBarrel.svgRoundTripMetadataSchema).toBeDefined();
    expect(svgBarrel.svgSanitizationReportSchema).toBeDefined();
    expect(svgBarrel.svgExtensionsSchema).toBeDefined();
    expect(svgBarrel.svgPreservedDataSchema).toBeDefined();
    expect(svgBarrel.SVG_BROADSET_NAMESPACE).toBe('https://broadset.io/ns/xmp/1.0/');
  });

  /**
   * @description `exportSvgString` on an empty document MUST return a
   * syntactically valid SVG root. This is the regression gate for
   * later parity work — nothing about the Phase 7.1 barrel should
   * break callers that expect a string back.
   */
  it('exportSvgString produces a string starting with <svg', () => {
    const doc = createEmptyBroadsetDocument();
    const svg = svgBarrel.exportSvgString(doc);

    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  /**
   * @description `exportSvgDocument` MUST return `{ svg, warnings }`
   * where `svg` matches the output of `exportSvgString` and
   * `warnings` is a readable-empty array in the Phase 7.1 baseline.
   */
  it('exportSvgDocument returns the string plus a warnings array', () => {
    const doc = createEmptyBroadsetDocument();
    const result = svgBarrel.exportSvgDocument(doc);

    expect(result.svg).toBe(svgBarrel.exportSvgString(doc));
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  /**
   * @description `importSvgDocument` on a minimal SVG MUST produce a
   * `BroadsetDocument` with a canvas and an empty elements array
   * (the baseline element extractor drops everything through the
   * fallback path, which is the behaviour the existing `import.ts`
   * already has).
   */
  it('importSvgDocument returns a document + warnings', () => {
    const minimal = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"/>';
    const { document, warnings } = svgBarrel.importSvgDocument(minimal);

    expect(document.canvas.width).toBe(200);
    expect(document.canvas.height).toBe(150);
    expect(Array.isArray(warnings)).toBe(true);
  });

  /**
   * @description `canRoundTrip` on an empty document MUST return
   * `{ canRoundTrip: true, reasons: [] }` — zero elements means
   * nothing blocks export. Later phases extend with richer preflight
   * checks.
   */
  it('canRoundTrip passes for an empty document', () => {
    const doc = createEmptyBroadsetDocument();
    const result = svgBarrel.canRoundTrip(doc);

    expect(result.canRoundTrip).toBe(true);
    expect(result.reasons.length).toBe(0);
  });
});
