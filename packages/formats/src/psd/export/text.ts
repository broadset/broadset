import type { BroadsetElement, TextBody } from '@broadset/model';
import { resolveContentAsPlainString, resolveStyleColor } from '@broadset/model';
import type { Layer, TextStyle, TextStyleRun } from 'ag-psd';

import { parseHexColor } from '../color-utils';

export function isTextBody(value: unknown): value is TextBody {
  if (typeof value !== 'object' || value === null) return false;

  const maybeBody = value as { readonly paragraphs?: unknown };

  return Array.isArray(maybeBody.paragraphs);
}

export interface ComposedText {
  readonly text: string;
  readonly styleRuns: readonly TextStyleRun[];
}

/**
 * Canonical PSD paragraph separator. Photoshop reads `\r` as a hard
 * line break inside a text layer's composed string.
 */
const PSD_PARAGRAPH_SEPARATOR = '\r';

function styleFromRunOverrides(
  overrides: Readonly<Record<string, unknown>> | undefined,
  fallback: TextStyle,
): TextStyle {
  const style: TextStyle = { ...fallback };

  if (overrides === undefined) return style;

  const fontSize = overrides['fontSize'];

  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    style.fontSize = fontSize;
  }

  const fontColor = overrides['fontColor'];

  if (typeof fontColor === 'string') {
    const color = parseHexColor(fontColor);

    if (color !== undefined) style.fillColor = color;
  }

  const decoration = overrides['textDecoration'];

  if (decoration === 'underline') style.underline = true;
  if (decoration === 'line-through') style.strikethrough = true;

  const letterSpacing = overrides['letterSpacing'];

  if (typeof letterSpacing === 'number' && Number.isFinite(letterSpacing)) {
    style.tracking = letterSpacing;
  }

  return style;
}

export function composeTextFromBody(body: TextBody, fallback: TextStyle): ComposedText {
  const parts: string[] = [];
  const runs: TextStyleRun[] = [];

  body.paragraphs.forEach((para, index) => {
    if (index > 0) {
      parts.push(PSD_PARAGRAPH_SEPARATOR);
      runs.push({ length: PSD_PARAGRAPH_SEPARATOR.length, style: { ...fallback } });
    }

    for (const r of para.runs) {
      if (r.text.length === 0) continue;
      parts.push(r.text);
      runs.push({
        length: r.text.length,
        style: styleFromRunOverrides(r.props?.style, fallback),
      });
    }
  });

  return { text: parts.join(''), styleRuns: runs };
}

export function applyTextContent(layer: Layer, el: BroadsetElement): void {
  const fontSize = el.style.fontSize ?? 12;
  const fontColorCss = resolveStyleColor(el.style.fontColor, { resolveTheme: false });
  const color = fontColorCss ? parseHexColor(fontColorCss) : undefined;
  const fallbackStyle: TextStyle = color ? { fontSize, fillColor: color } : { fontSize };

  if (isTextBody(el.content)) {
    const composed = composeTextFromBody(el.content, fallbackStyle);

    layer.text = {
      text: composed.text,
      style: fallbackStyle,
      styleRuns: [...composed.styleRuns],
    };

    return;
  }

  const plainText = resolveContentAsPlainString(el.content);

  layer.text = {
    text: plainText,
    style: fallbackStyle,
    styleRuns: [{ length: plainText.length, style: { ...fallbackStyle } }],
  };
}
