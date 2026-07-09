import { wrapTextWithLineBreaks } from './uax14-linebreak';

/**
 * Wrap text into lines that fit `maxWidth` per the caller-provided
 * `measure` function. When the export pipeline has awaited
 * `prepareLineBreaker()` upstream, wrapping uses UAX #14 line-break
 * opportunities so CJK / Arabic / Khmer (scripts without whitespace
 * word separators) wrap at the right boundaries. Without the prepare
 * call, falls back to whitespace splitting.
 *
 * Mandatory breaks (hard newlines) always force a new line. Soft
 * breaks wrap when the candidate exceeds `maxWidth`.
 */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): readonly string[] {
  return wrapTextWithLineBreaks(text, maxWidth, measure);
}
