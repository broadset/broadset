/**
 * Build a masked SVG fallback source for clipped elements.
 * Wraps content in a <clipPath> definition for preserveAspectRatio support.
 */
export function buildMaskedSvgSource(
  width: number,
  height: number,
  clipPathValue: string,
  innerContent: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" preserveAspectRatio="xMidYMid meet">`,
    '  <defs>',
    '    <clipPath id="clip0">',
    `      <rect width="${String(width)}" height="${String(height)}" style="clip-path: ${clipPathValue}"/>`,
    '    </clipPath>',
    '  </defs>',
    '  <g clip-path="url(#clip0)">',
    `    ${innerContent}`,
    '  </g>',
    '</svg>',
  ].join('\n');
}
