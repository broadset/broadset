import type { BroadsetElement } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { runPreflightDiagnostics } from './editing';
import { makeElement, makePrintDoc, makeScreenDoc } from './editing-test-helpers';

describe('Preflight Diagnostics', () => {
  /** @description A clean document with no issues must produce zero diagnostics. */
  it('reports no issues for a clean document', () => {
    const el = makeElement({
      type: 'rectangle',
      position: { x: 100, y: 100 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});

    expect(issues).toHaveLength(0);
  });

  /** @description Text elements outside the 90% title-safe inset must emit a title-safe warning. */
  it('emits a title-safe warning when a text element extends outside the 90% inset', () => {
    const el = makeElement({
      type: 'text',
      name: 'Title',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el], { width: 1920, height: 1080 });
    const issues = runPreflightDiagnostics(doc, {});
    const titleSafe = issues.filter((i) => i.rule === 'title-safe');

    expect(titleSafe).toHaveLength(1);
    expect(titleSafe[0]?.severity).toBe('warning');
    expect(titleSafe[0]?.elementName).toBe('Title');
  });

  /** @description Large images must emit a dpi-resolution info when rendered size exceeds 500px. */
  it('emits a dpi-resolution info for a large image', () => {
    const el = makeElement({
      type: 'image',
      name: 'Hero Image',
      position: { x: 100, y: 100 },
      width: 600,
      height: 400,
    });
    const doc = makeScreenDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});
    const dpiIssues = issues.filter((i) => i.rule === 'dpi-resolution');

    expect(dpiIssues).toHaveLength(1);
    expect(dpiIssues[0]?.severity).toBe('info');
  });

  /** @description In print mode, elements beyond bleed margin must emit a bleed warning. */
  it('emits a bleed warning in print mode for elements beyond canvas + bleed', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Overflowing Box',
      position: { x: -10, y: -10 },
      width: 50,
      height: 50,
    });
    const doc = makePrintDoc([el]);
    const issues = runPreflightDiagnostics(doc, {});
    const bleedIssues = issues.filter((i) => i.rule === 'bleed');

    expect(bleedIssues).toHaveLength(1);
    expect(bleedIssues[0]?.severity).toBe('warning');
  });

  /** @description In print mode, text below 6pt must emit a small-text warning. */
  it('emits a small-text warning in print mode for text below 6pt', () => {
    const el = makeElement({
      type: 'text',
      name: 'Tiny Label',
      position: { x: 50, y: 50 },
      width: 100,
      height: 20,
    });
    // Set font size below 6
    const elWithSmallFont: BroadsetElement = { ...el, style: { ...el.style, fontSize: 5 } };
    const doc = makePrintDoc([elWithSmallFont]);
    const issues = runPreflightDiagnostics(doc, {});
    const smallTextIssues = issues.filter((i) => i.rule === 'small-text');

    expect(smallTextIssues).toHaveLength(1);
    expect(smallTextIssues[0]?.severity).toBe('warning');
  });

  /** @description In print mode, fluorescent colors must emit a color-mode info. */
  it('emits a color-mode info in print mode for fluorescent colors', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Neon Box',
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
    });
    // Fluorescent / highly saturated green
    const elWithFluo: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#00ff00' },
    };
    const doc = makePrintDoc([elWithFluo]);
    const issues = runPreflightDiagnostics(doc, {});
    const colorIssues = issues.filter((i) => i.rule === 'color-mode');

    expect(colorIssues).toHaveLength(1);
    expect(colorIssues[0]?.severity).toBe('info');
  });

  /** @description Screen-only properties in print mode must emit unsupported-property warnings. */
  it('emits unsupported-property warnings for screen-only properties in print mode', () => {
    const el = makeElement({
      type: 'rectangle',
      name: '3D Box',
      position: { x: 50, y: 50 },
      width: 100,
      height: 100,
    });
    const elWith3D: BroadsetElement = {
      ...el,
      style: { ...el.style, rotateX: 15, rotateY: 30 },
    };
    const doc = makePrintDoc([elWith3D]);
    const issues = runPreflightDiagnostics(doc, {});
    const unsupported = issues.filter((i) => i.rule === 'unsupported-property');

    expect(unsupported).toHaveLength(2);
    expect(unsupported[0]?.severity).toBe('warning');
    expect(unsupported[1]?.severity).toBe('warning');
  });

  /** @description Multiple issues must be returned in deterministic order. */
  it('returns diagnostics in deterministic order', () => {
    const text = makeElement({
      type: 'text',
      name: 'A',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
    });
    const image = makeElement({
      type: 'image',
      name: 'B',
      position: { x: 100, y: 100 },
      width: 600,
      height: 400,
    });
    const doc = makeScreenDoc([text, image]);
    const issues1 = runPreflightDiagnostics(doc, {});
    const issues2 = runPreflightDiagnostics(doc, {});

    expect(issues1.map((i) => i.rule)).toEqual(issues2.map((i) => i.rule));
    expect(issues1.map((i) => i.elementName)).toEqual(issues2.map((i) => i.elementName));
  });

  /** @description A text element using a font not in allowedFonts must emit a missing-font warning. */
  it('emits a missing-font warning for text with unknown font', () => {
    const el = makeElement({
      type: 'text',
      name: 'Custom Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'ObscureFont' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues.length).toBeGreaterThanOrEqual(1);
    expect(fontIssues[0]?.severity).toBe('warning');
  });

  /** @description A text element using a font in allowedFonts must not emit missing-font. */
  it('does not emit missing-font for a font in allowedFonts', () => {
    const el = makeElement({
      type: 'text',
      name: 'Custom Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'Arial' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(0);
  });

  /** @description A text element using a system fallback font must not emit missing-font. */
  it('does not emit missing-font for a fallback system font', () => {
    const el = makeElement({
      type: 'text',
      name: 'System Text',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'sans-serif' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'CustomFont' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(0);
  });

  /** @description SVG elements outside the title-safe area must trigger a title-safe warning. */
  it('emits a title-safe warning for an SVG element outside the 90% inset', () => {
    const el = makeElement({
      type: 'svg',
      name: 'Chart',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
    });
    const doc = makeScreenDoc([el], { width: 1920, height: 1080 });
    const issues = runPreflightDiagnostics(doc, {});
    const titleSafe = issues.filter((i) => i.rule === 'title-safe');

    expect(titleSafe).toHaveLength(1);

    const titleSafeIssue = titleSafe[0];

    expect(titleSafeIssue).toBeDefined();
    expect(titleSafeIssue?.elementName).toBe('Chart');
  });

  /** @description Clock elements with small font size must trigger small-text in print mode. */
  it('emits a small-text warning for a clock element with font below 6pt', () => {
    const el = makeElement({
      type: 'clock',
      name: 'Small Clock',
      position: { x: 100, y: 100 },
      width: 200,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontSize: 4 },
    };
    const doc = makePrintDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, {});
    const smallText = issues.filter((i) => i.rule === 'small-text');

    expect(smallText).toHaveLength(1);

    const smallTextIssue = smallText[0];

    expect(smallTextIssue).toBeDefined();
    expect(smallTextIssue?.elementName).toBe('Small Clock');
  });

  /** @description Ticker elements with unknown font must trigger missing-font warning. */
  it('emits a missing-font warning for a ticker with unknown font', () => {
    const el = makeElement({
      type: 'ticker',
      name: 'News Ticker',
      position: { x: 100, y: 100 },
      width: 400,
      height: 50,
    });
    const elWithFont: BroadsetElement = {
      ...el,
      style: { ...el.style, fontFamily: 'UnknownFont' },
    };
    const doc = makeScreenDoc([elWithFont]);
    const issues = runPreflightDiagnostics(doc, { allowedFonts: [{ family: 'Arial' }] });
    const fontIssues = issues.filter((i) => i.rule === 'missing-font');

    expect(fontIssues).toHaveLength(1);

    const fontIssue = fontIssues[0];

    expect(fontIssue).toBeDefined();
    expect(fontIssue?.elementName).toBe('News Ticker');
  });

  /** @description 3-char hex colors (#0f0) must be detected as fluorescent in print mode. */
  it('detects fluorescent colors in short hex format (#0f0)', () => {
    const el = makeElement({
      type: 'rectangle',
      name: 'Green Box',
      position: { x: 100, y: 100 },
      width: 100,
      height: 100,
    });
    const elWithColor: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#0f0' },
    };
    const doc = makePrintDoc([elWithColor]);
    const issues = runPreflightDiagnostics(doc, {});
    const colorIssues = issues.filter((i) => i.rule === 'color-mode');

    expect(colorIssues).toHaveLength(1);

    const colorIssue = colorIssues[0];

    expect(colorIssue).toBeDefined();
    expect(colorIssue?.elementName).toBe('Green Box');
  });
});
