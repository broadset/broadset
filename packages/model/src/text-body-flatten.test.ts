import { describe, expect, it } from 'vitest';

import { createDefaultElement } from './element';
import {
  paragraph,
  resolveContentAsPlainString,
  run,
  textBody,
  textBodyToPlainString,
} from './text-body';

/**
 * Phase 1 unit #9b — flips `BroadsetElement.content` from the flat
 * `string` shape to `string | TextBody`. Consumers that only need the
 * plain text for HTML output, measurement, validation, or placeholder
 * fallback call {@link resolveContentAsPlainString} to get a stable
 * string view — `TextBody` inputs flatten paragraph-by-paragraph.
 */
describe('textBodyToPlainString', () => {
  /**
   * @description A single-paragraph / single-run TextBody must flatten
   * to the run text with no extra whitespace or newlines. Ensures the
   * simplest "rich-text-as-plain-text" path round-trips cleanly.
   */
  it('flattens a single-paragraph single-run body to the run text', () => {
    const body = textBody([paragraph([run('Hello world')])]);

    expect(textBodyToPlainString(body)).toBe('Hello world');
  });

  /**
   * @description Multi-paragraph bodies are joined with `\n` between
   * paragraphs so downstream consumers that expect plain-text line
   * breaks (PDF `drawText`, CSV export, accessibility fallback) see
   * the paragraph structure without rich-text markers.
   */
  it('joins paragraphs with \\n line separators', () => {
    const body = textBody([paragraph([run('Line one')]), paragraph([run('Line two')])]);

    expect(textBodyToPlainString(body)).toBe('Line one\nLine two');
  });

  /**
   * @description Multi-run paragraphs concatenate run text without
   * inserting separators. Run boundaries are a styling concern — the
   * plain-text projection drops them.
   */
  it('concatenates multi-run paragraph text without separators', () => {
    const body = textBody([paragraph([run('Hello '), run('world'), run('!')])]);

    expect(textBodyToPlainString(body)).toBe('Hello world!');
  });

  /**
   * @description An empty TextBody (no paragraphs) collapses to the
   * empty string so consumers checking `content.trim() === ''` keep
   * working after the field widens to `string | TextBody`.
   */
  it('returns the empty string for an empty TextBody', () => {
    const body = textBody([]);

    expect(textBodyToPlainString(body)).toBe('');
  });

  /**
   * @description A paragraph with no runs contributes an empty line to
   * the flattened output. This preserves visual line breaks authored
   * by a user pressing Enter on an empty line.
   */
  it('preserves empty paragraphs as blank lines', () => {
    const body = textBody([paragraph([run('one')]), paragraph([]), paragraph([run('three')])]);

    expect(textBodyToPlainString(body)).toBe('one\n\nthree');
  });
});

describe('resolveContentAsPlainString', () => {
  /**
   * @description The plain-string path is a no-op — consumers that
   * already hold a string must not pay a conversion cost. Returning the
   * same reference keeps `===` identity stable for memoization callers.
   */
  it('returns a plain string input unchanged', () => {
    expect(resolveContentAsPlainString('abc')).toBe('abc');
    expect(resolveContentAsPlainString('')).toBe('');
  });

  /**
   * @description The TextBody branch delegates to `textBodyToPlainString`.
   * This is the single site that centralizes the dispatch so consumers
   * don't scatter `typeof` checks across the renderer / formats / editor.
   */
  it('flattens a TextBody input via textBodyToPlainString', () => {
    const body = textBody([paragraph([run('First')]), paragraph([run('Second')])]);

    expect(resolveContentAsPlainString(body)).toBe('First\nSecond');
  });
});

describe('BroadsetElement.content accepts TextBody', () => {
  /**
   * @description Phase 1 unit #9b — the `content` field on a text
   * element now accepts a `TextBody` at construction time and the
   * element schema preserves it verbatim. This pins the field widening
   * so future loops rely on the canonical `string | TextBody` shape.
   */
  it('constructs a text element whose content is a TextBody', () => {
    const body = textBody([paragraph([run('Styled text')])]);
    const element = createDefaultElement('text', { content: body });

    expect(typeof element.content).toBe('object');
    expect(element.content).toEqual(body);
  });

  /**
   * @description The plain-string form still works — the widening is
   * additive. Existing fixtures with `content: 'plain'` must continue
   * to persist as strings without being inflated into a TextBody.
   */
  it('preserves a plain-string content on text elements', () => {
    const element = createDefaultElement('text', { content: 'Plain text' });

    expect(element.content).toBe('Plain text');
  });
});
