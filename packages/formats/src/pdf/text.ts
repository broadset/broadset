/** Fallback character width in PDF points when font measurement fails. */
const FALLBACK_CHAR_WIDTH_PT = 8;

/**
 * Wrap text at word boundaries respecting maximum width.
 * Explicit newlines are preserved including empty lines.
 * Falls back to per-character measurement when full-string measurement throws.
 */
function safeMeasure(candidate: string, measure: (t: string) => number): number {
  try {
    return measure(candidate);
  } catch {
    return measurePerChar(candidate, measure);
  }
}

function wrapParagraph(paragraph: string, maxWidth: number, measure: (t: string) => number): readonly string[] {
  if (paragraph === '') return [''];

  const words = paragraph.split(/\s+/).filter(Boolean);

  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine === '' ? word : `${currentLine} ${word}`;
    const width = safeMeasure(candidate, measure);

    if (width <= maxWidth || currentLine === '') {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine !== '') lines.push(currentLine);

  return lines;
}

export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): readonly string[] {
  return text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}

function measurePerChar(text: string, measure: (t: string) => number): number {
  let total = 0;

  for (const ch of text) {
    try {
      total += measure(ch);
    } catch {
      total += FALLBACK_CHAR_WIDTH_PT;
    }
  }

  return total;
}
