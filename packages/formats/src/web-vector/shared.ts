/**
 * XML-entity escape. Local copy for the HTML-standalone exporter so
 * web-vector does not reach into the `svg/` module. Same behaviour as
 * `packages/formats/src/svg/shared.ts`.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
