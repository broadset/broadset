/**
 * Cheap UAX #9 (bidi) and UAX #14 (line-break) detection helpers for
 * any format whose preflight needs to flag RTL or CJK content. The
 * detectors are regex-based codepoint-range checks — they tell you
 * the script is *present*, not how to wrap or reorder it. Formats
 * that need actual reordering (PDF — readers don't apply UAX #9 to
 * `Tj` / `TJ`) or line-breaking (PDF emitter for non-whitespace
 * scripts) still own format-specific implementations on top of the
 * `_shared/text-layout` `breakLines` / `analyzeBidi` primitives.
 *
 * Used by: PSD preflight (Photoshop is the rendering authority and
 * does its own ICU pass — Broadset only needs to flag content that
 * round-trips through that pipeline). Reusable by PPTX / SVG
 * preflight when those tracks gain RTL / CJK awareness.
 */

/**
 * UAX #9 strong-RTL Unicode ranges expressed as explicit code-point
 * escapes. Covers Hebrew (0590-05FF), Arabic / Syriac / Thaana / NKo
 * / Samaritan / Mandaic (0600-08FF), Arabic Presentation Forms-A
 * (FB1D-FDFF) and Forms-B (FE70-FEFF). Inline literal characters
 * trigger no-irregular-whitespace.
 */
const RTL_RANGES_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

/**
 * CJK ideograph + kana + hangul ranges: Hiragana / Katakana
 * (3040-30FF), CJK Unified Ideographs Extension A (3400-4DBF), CJK
 * Unified Ideographs (4E00-9FFF), Hangul Syllables (AC00-D7AF), CJK
 * Compatibility Ideographs (F900-FAFF). Code-point escapes only.
 */
const CJK_RANGES_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u;

export interface TextUnicodeProfile {
  readonly hasRtl: boolean;
  readonly hasCjk: boolean;
}

export function analyseTextUnicodeProfile(text: string): TextUnicodeProfile {
  return {
    hasRtl: RTL_RANGES_RE.test(text),
    hasCjk: CJK_RANGES_RE.test(text),
  };
}

export function containsRtlCharacters(text: string): boolean {
  return RTL_RANGES_RE.test(text);
}

export function containsCjkCharacters(text: string): boolean {
  return CJK_RANGES_RE.test(text);
}
