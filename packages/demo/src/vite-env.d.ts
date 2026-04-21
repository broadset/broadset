/// <reference types="vite/client" />

// Non-standard legacy property still emitted by Chrome and Safari for WheelEvent.
// Physical mouse wheels produce wheelDeltaY as non-zero multiples of ±120 regardless
// of OS-level scroll acceleration, making it the most reliable mouse-vs-trackpad
// discriminator for the canvas wheel handler. Firefox and other browsers fall back
// to deltaMode !== 0 or the pixel-magnitude heuristic for mouse-wheel detection.
interface WheelEvent {
  readonly wheelDeltaY?: number;
}
