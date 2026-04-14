/** Fallback character width in PDF points when font measurement fails. */
const FALLBACK_CHAR_WIDTH_PT = 8;

/**
 * Wrap text at word boundaries respecting maximum width.
 * Explicit newlines are preserved including empty lines.
 * Falls back to per-character measurement when full-string measurement throws.
 */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): readonly string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine === '' ? word : `${currentLine} ${word}`;

      let width: number;

      try {
        width = measure(candidate);
      } catch {
        width = measurePerChar(candidate, measure);
      }

      if (width <= maxWidth || currentLine === '') {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine !== '') {
      lines.push(currentLine);
    }
  }

  return lines;
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
