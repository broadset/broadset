import qrcode from 'qrcode-generator';

import { parseSanitizedSvg } from '../../screen-renderer/svg-sanitize';

/**
 * Generate a responsive SVG markup string for the given QR payload. Returns
 * `null` for an empty payload so callers can distinguish "no QR requested"
 * from a real generation failure.
 *
 * Prefer {@link createQrCodeMarkupAsElement} when mounting into live DOM —
 * the element API routes markup through the SVG sanitization boundary and
 * keeps callers off `innerHTML` entirely.
 */
export function createQrCodeMarkup(payload: string): string | null {
  if (payload.trim() === '') {
    return null;
  }

  const qr = qrcode(0, 'M');

  qr.addData(payload);
  qr.make();

  return qr.createSvgTag({
    scalable: true,
    margin: 0,
  });
}

/**
 * Generate a QR code as a parsed and sanitized `<svg>` element ready to
 * mount into the DOM. Returns `null` for empty payloads or when the
 * generated markup fails to parse. Safe builder variant of
 * {@link createQrCodeMarkup} — renderers that mount QR output should use
 * this form so no path goes through `innerHTML`.
 */
export function createQrCodeMarkupAsElement(payload: string): SVGElement | null {
  const markup = createQrCodeMarkup(payload);

  if (markup === null) return null;

  return parseSanitizedSvg(markup);
}
