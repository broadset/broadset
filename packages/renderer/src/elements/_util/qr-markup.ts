import qrcode from 'qrcode-generator';

/**
 * Generate a responsive SVG markup string for the given QR payload. Returns
 * `null` for an empty payload so callers can distinguish "no QR requested"
 * from a real generation failure.
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
