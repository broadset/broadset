import { initializeCanvas } from 'ag-psd';

let canvasInitialized = false;

export function ensureCanvasInitialized(): void {
  if (canvasInitialized) return;

  canvasInitialized = true;

  initializeCanvas(
    (width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);

      return {
        width,
        height,
        getContext: () => ({
          drawImage: () => {
            /* noop */
          },
          getImageData: () => ({ data, width, height }),
          putImageData: () => {
            /* noop */
          },
          canvas: { width, height },
          createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
          clearRect: () => {
            /* noop */
          },
          fillRect: () => {
            /* noop */
          },
          save: () => {
            /* noop */
          },
          restore: () => {
            /* noop */
          },
        }),
        toBuffer: () => new Uint8Array(0),
      } as unknown as HTMLCanvasElement;
    },
    (width: number, height: number) =>
      ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: 'srgb',
      }) as ImageData,
  );
}
