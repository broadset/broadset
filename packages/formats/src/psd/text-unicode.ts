/**
 * UAX #9 (bidi) and UAX #14 (line-break) detection helpers for PSD
 * text. Mirrors `pdf/bidi-reorder.ts` and `pdf/uax14-linebreak.ts` in
 * intent — but PSD differs from PDF in one critical way: Photoshop's
 * text engine DOES apply bidi reordering and ICU line-breaking at
 * render time, so the bytes Broadset writes must stay in *logical*
 * order. The exporter therefore does NOT visually reorder runs the
 * way the PDF exporter does.
 *
 * What we DO need:
 *   - detect RTL content so preflight can flag it (Photoshop's text
 *     engine is the rendering authority; round-trip fidelity depends
 *     on its UAX #9 implementation, not ours);
 *   - detect CJK / non-whitespace-script content so preflight can
 *     flag it (line wrapping inside Photoshop relies on ICU; round-
 *     tripping the wrap points is best-effort);
 *   - expose these checks as a single `analyseTextUnicodeProfile`
 *     helper so preflight + future text-shaping passes share one
 *     source of truth.
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
