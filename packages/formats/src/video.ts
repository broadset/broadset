import type { VideoEncodingConfig } from 'mediabunny';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';

interface VideoExportOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderFrame: (timeMs: number) => void | Promise<void>;
  readonly durationMs: number;
  readonly frameRate?: number;
  readonly alpha?: boolean;
  readonly quality?: number;
  readonly onProgress?: (progress: number, stage?: string) => void;
  readonly format?: 'webm' | 'mp4';
}

const MAX_VIDEO_BITRATE = 4_000_000;

export function isVideoExportSupported(): boolean {
  return typeof globalThis.VideoEncoder !== 'undefined';
}
export async function exportVideoBlob(options: VideoExportOptions): Promise<Blob> {
  const format = options.format ?? 'webm';

  if (!isVideoExportSupported()) throw new Error('Video export is not supported: VideoEncoder API is unavailable');

  const frameRate = options.frameRate ?? 30;
  const alpha = format === 'webm' ? (options.alpha ?? false) : false;
  const quality = options.quality ?? 0.8;

  if (frameRate <= 0) throw new Error('frameRate must be positive');

  if (options.durationMs <= 0 || !Number.isFinite(options.durationMs)) {
    throw new Error('durationMs must be a positive finite number');
  }

  if (quality < 0 || quality > 1) throw new Error('quality must be in range [0, 1]');

  options.onProgress?.(0, 'Initializing encoder');

  const encodingConfig: VideoEncodingConfig = {
    codec: format === 'mp4' ? 'avc' : 'vp9',
    bitrate: Math.round(quality * MAX_VIDEO_BITRATE),
    alpha: alpha ? 'keep' : 'discard',
  };
  const canvasSource = new CanvasSource(options.canvas, encodingConfig);
  const outputFormat = format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format: outputFormat, target });

  output.addVideoTrack(canvasSource);
  await output.start();

  const totalFrames = Math.ceil((options.durationMs / 1000) * frameRate);
  const frameDurationSeconds = 1 / frameRate;

  options.onProgress?.(0.1, 'Rendering frames');

  for (let frame = 0; frame < totalFrames; frame += 1) {
    await options.renderFrame((frame / frameRate) * 1000);
    await canvasSource.add(frame * frameDurationSeconds, frameDurationSeconds);
    options.onProgress?.(0.1 + 0.8 * ((frame + 1) / totalFrames), 'Rendering frames');
  }

  options.onProgress?.(0.9, 'Finalizing');
  await output.finalize();

  const buffer = target.buffer;

  if (buffer === null) throw new Error('Video export failed: output buffer is null after finalization');

  options.onProgress?.(1, 'Complete');

  return new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
}
