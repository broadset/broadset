import { type PDFPage, rgb } from '@libpdf/core';
import qrcode from 'qrcode-generator';

/**
 * Draw QR code modules as rectangles on a PDF page.
 * Empty content draws only the white background rectangle.
 */
export function drawQrOnPage(
  page: PDFPage,
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  if (content.trim() === '') {
    return;
  }

  const qr = qrcode(0, 'M');

  qr.addData(content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellW = width / moduleCount;
  const cellH = height / moduleCount;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: x + col * cellW,
          y: y + height - (row + 1) * cellH,
          width: cellW,
          height: cellH,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}
