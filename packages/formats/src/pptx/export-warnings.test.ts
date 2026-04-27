import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxWithReport, exportPptxWithReportAsync } from './export';

/**
 * @description Exporter warnings sink — closes the spec gap that
 * silent fidelity-loss drops on export had no surface area. Each
 * warning code MUST fire when the matching condition appears in the
 * source document, and MUST NOT fire on clean documents.
 */
describe('PPTX exporter — warnings sink', () => {
  /**
   * @description Inset shadows now round-trip through `<a:innerShdw>`,
   * so an inset-only `boxShadow` MUST emit cleanly with NO warnings —
   * P3 closed the previous fidelity gap. This test guards against a
   * regression that would silently revert insets to opaque drops.
   */
  it('emits inset boxShadow as <a:innerShdw> with no warning', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'inset-shadow',
          width: 100,
          height: 50,
          style: { boxShadow: 'inset 4px 4px 8px black', opacity: 1 },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });

    expect(report.warnings).toEqual([]);

    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const slide = readTextPart(readOoxmlPackage(report.bytes), 'ppt/slides/slide1.xml') ?? '';

    expect(slide).toContain('<a:innerShdw');
  });

  /**
   * @description OOXML's `<a:outerShdw>` carries one shadow only.
   * Multi-value lists MUST emit the first emit-eligible entry and
   * surface a `shadow-truncated` warning naming the source element.
   */
  it('emits shadow-truncated when boxShadow is a multi-value list', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'multi-shadow',
          width: 100,
          height: 50,
          style: { boxShadow: '4px 4px 8px black, 8px 8px 12px red', opacity: 1 },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });

    const warning = report.warnings.find((w) => w.code === 'shadow-truncated');

    expect(warning).toBeDefined();
    expect(warning?.elementId).toBe('multi-shadow');
  });

  /**
   * @description Box-shadow strings the parser cannot resolve (no
   * recognisable colour, malformed length unit) MUST surface
   * `shadow-dropped` rather than silently emitting nothing.
   */
  it('emits shadow-dropped when boxShadow is unparseable', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'bad-shadow',
          width: 100,
          height: 50,
          style: { boxShadow: '4px 4px 8px not-a-real-colour-name', opacity: 1 },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });

    const warning = report.warnings.find((w) => w.code === 'shadow-dropped');

    expect(warning).toBeDefined();
    expect(warning?.elementId).toBe('bad-shadow');
  });

  /**
  * @description Animations that don't match the supported PPTX timing
  * heuristics drop per IO-D-16. The exporter MUST surface
   * `animation-preset-unsupported` so callers can tell the user that
   * non-preset animations stay in the `.bsp` source-of-truth.
   */
  it('emits animation-preset-unsupported when animation is not a preset', () => {
    const base = createEmptyBroadsetDocument();
    const el = createDefaultElement('rectangle', { id: 'colour-anim' });
    const doc = {
      ...base,
      elements: [el],
      animations: [
        {
          elementId: 'colour-anim',
          config: {
            timelines: [
              {
                id: 'tl-1',
                name: 'ColorFade',
                durationMs: 500,
                keyframes: [
                  { name: 'a', action: 'none' as const, offsetMs: 0, properties: { color: { type: 'color' as const, value: '#ff0000', easing: 'linear' as const } } },
                  { name: 'b', action: 'none' as const, offsetMs: 500, properties: { color: { type: 'color' as const, value: '#00ff00', easing: 'linear' as const } } },
                ],
              },
            ],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });

    const warning = report.warnings.find((w) => w.code === 'animation-preset-unsupported');

    expect(warning).toBeDefined();
    expect(warning?.elementId).toBe('colour-anim');
  });

  /**
   * @description A clean document — no inset shadows, no multi-value
   * lists, only mappable animations — MUST export with zero warnings
   * so existing callers (UI toast logic) don't see false positives.
   */
  it('emits no warnings on a clean document', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'plain',
          width: 100,
          height: 50,
          style: { boxShadow: '4px 4px 8px black', opacity: 1 },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });

    expect(report.warnings).toEqual([]);
  });

  /**
   * @description The async report path mirrors the sync one — same
   * warning shape, same codes. Verifying the async surface keeps the
   * two entry points in lockstep so callers can pick whichever
   * matches their ledger needs without branching on warning shape.
   */
  /**
   * @description T10 — three shadows with mixed inset+outer ordering.
   * The exporter MUST keep the first outer + first inner and surface
   * exactly one `shadow-truncated` warning naming the source element.
   * Without this guard the truncation logic could silently drop the
   * inner half of a layered effect.
   */
  it('keeps first outer + first inner from a 3-entry mixed list', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'three-mixed',
          width: 100,
          height: 50,
          // outer red, inner black, then a second outer that MUST be
          // truncated (OOXML carries one outer + one inner per shape).
          style: {
            boxShadow: '4px 4px 8px red, inset 2px 2px 4px black, 16px 16px 16px blue',
            opacity: 1,
          },
        }),
      ],
    };
    const report = exportPptxWithReport(doc, { preserveBroadsetMetadata: false });
    const truncated = report.warnings.filter((w) => w.code === 'shadow-truncated');

    expect(truncated).toHaveLength(1);
    expect(truncated[0]?.elementId).toBe('three-mixed');

    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const slide = readTextPart(readOoxmlPackage(report.bytes), 'ppt/slides/slide1.xml') ?? '';

    // Both outer and inner emit; the second outer is dropped.
    expect((slide.match(/<a:outerShdw/g) ?? []).length).toBe(1);
    expect((slide.match(/<a:innerShdw/g) ?? []).length).toBe(1);
  });

  it('surfaces the same warnings through exportPptxWithReportAsync', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', {
          id: 'multi-async',
          width: 100,
          height: 50,
          style: { boxShadow: '4px 4px 8px black, 8px 8px 12px red, 16px 16px 16px blue', opacity: 1 },
        }),
      ],
    };
    const report = await exportPptxWithReportAsync(doc, { preserveBroadsetMetadata: false });

    expect(report.warnings.some((w) => w.code === 'shadow-truncated')).toBe(true);
    expect(report.bytes.byteLength).toBeGreaterThan(0);
  });
});
