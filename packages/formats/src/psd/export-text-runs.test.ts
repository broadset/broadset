import './runtime-canvas';

import { paragraph, run, textBody } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { composeTextFromBody, isTextBody } from './export-layer';

/**
 * Phase 5 unit P5.2a — text run export composition. `composeTextFromBody`
 * is the unit that turns a `TextBody` (paragraphs of runs) into the
 * shape PSD text layers need: a single text string plus one
 * `TextStyleRun` per Broadset `Run`, with per-run style overrides
 * merged over the element's fallback style.
 *
 * Tested directly because ag-psd's `readPsd` normalizes line endings
 * and doesn't round-trip `styleRuns` without full text engine data;
 * testing the composition primitive avoids those artefacts.
 */

describe('isTextBody', () => {
  /**
   * @description Narrows a `string | TextBody` content field to its
   * structured branch so callers route through run-aware emission.
   */
  it('narrows a TextBody and rejects a string or null', () => {
    expect(isTextBody(textBody([paragraph([run('hi')])]))).toBe(true);
    expect(isTextBody('hi')).toBe(false);
    expect(isTextBody(null)).toBe(false);
    expect(isTextBody(undefined)).toBe(false);
    expect(isTextBody({ paragraphs: 'not-an-array' })).toBe(false);
  });
});

describe('composeTextFromBody', () => {
  /**
   * @description A single-run paragraph composes to one styleRun
   * whose length matches the run text. Per-run fontSize overrides
   * the fallback size.
   */
  it('emits one styleRun per Run with per-run fontSize override', () => {
    const body = textBody([
      paragraph([run('Hello ', { style: { fontSize: 24 } }), run('world', { style: { fontSize: 48 } })]),
    ]);
    const composed = composeTextFromBody(body, { fontSize: 12 });

    expect(composed.text).toBe('Hello world');
    expect(composed.styleRuns).toHaveLength(2);
    expect(composed.styleRuns[0]?.length).toBe('Hello '.length);
    expect(composed.styleRuns[1]?.length).toBe('world'.length);
    expect(composed.styleRuns[0]?.style.fontSize).toBe(24);
    expect(composed.styleRuns[1]?.style.fontSize).toBe(48);
  });

  /**
   * @description Multiple paragraphs join with `\r` (PSD's paragraph
   * separator). The separator contributes its own styleRun so the
   * total `styleRuns` length covers every character of the output
   * text.
   */
  it('joins paragraphs with \\r and emits separator styleRuns', () => {
    const body = textBody([
      paragraph([run('Line A', { style: { fontSize: 20 } })]),
      paragraph([run('Line B', { style: { fontSize: 30 } })]),
    ]);
    const composed = composeTextFromBody(body, { fontSize: 12 });

    expect(composed.text).toBe('Line A\rLine B');

    const totalLength = composed.styleRuns.reduce((sum, r) => sum + r.length, 0);

    expect(totalLength).toBe(composed.text.length);
  });

  /**
   * @description Run-level `textDecoration` overrides propagate to PSD
   * `underline` / `strikethrough` booleans so Photoshop's underline
   * toggle stays in sync with run styling.
   */
  it('maps run-level textDecoration to PSD underline / strikethrough', () => {
    const body = textBody([
      paragraph([
        run('u', { style: { textDecoration: 'underline' } }),
        run('s', { style: { textDecoration: 'line-through' } }),
        run('p'),
      ]),
    ]);
    const composed = composeTextFromBody(body, { fontSize: 12 });

    expect(composed.styleRuns[0]?.style.underline).toBe(true);
    expect(composed.styleRuns[1]?.style.strikethrough).toBe(true);
    expect(composed.styleRuns[2]?.style.underline).toBeUndefined();
    expect(composed.styleRuns[2]?.style.strikethrough).toBeUndefined();
  });

  /**
   * @description Run-level `fontColor` overrides are parsed as hex and
   * emitted as a PSD `fillColor`.
   */
  it('maps run-level fontColor to PSD fillColor', () => {
    const body = textBody([paragraph([run('red', { style: { fontColor: '#ff0000' } })])]);
    const composed = composeTextFromBody(body, { fontSize: 12 });

    const fillColor = composed.styleRuns[0]?.style.fillColor;

    expect(fillColor).toBeDefined();

    if (fillColor && 'r' in fillColor) {
      expect(fillColor.r).toBe(255);
      expect(fillColor.g).toBe(0);
      expect(fillColor.b).toBe(0);
    }
  });

  /**
   * @description Empty-text runs are skipped so the styleRuns array
   * never carries a zero-length entry — PSD readers expect positive
   * lengths.
   */
  it('skips empty-text runs', () => {
    const body = textBody([paragraph([run('visible'), run('')])]);
    const composed = composeTextFromBody(body, { fontSize: 12 });

    expect(composed.styleRuns).toHaveLength(1);
    expect(composed.styleRuns[0]?.length).toBe('visible'.length);
  });
});
