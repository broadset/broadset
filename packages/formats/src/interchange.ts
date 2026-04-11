import type { BroadsetDocument, BroadsetElement, BroadsetProject } from '@broadset/model';
import qrcode from 'qrcode-generator';

/* ------------------------------------------------------------------ */
/*  JSON Export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Serializes a BroadsetProject to a JSON string.
 * The output is valid BroadsetProject JSON that can be parsed and validated
 * with broadsetProjectSchema.
 * Rejects with a descriptive error on serialization failure.
 */
export function exportProjectJson(project: BroadsetProject): string {
  try {
    return JSON.stringify(project, null, 2);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`JSON export failed: ${message}`, { cause: error });
  }
}

/* ------------------------------------------------------------------ */
/*  Filename Sanitization                                            */
/* ------------------------------------------------------------------ */

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const CONSECUTIVE_HYPHENS = /-{2,}/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;

/**
 * Sanitizes a string for use as a filename.
 * Replaces spaces with hyphens, strips illegal filesystem characters,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 * Returns empty string for whitespace-only input.
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(ILLEGAL_FILENAME_CHARS, '-')
    .replace(CONSECUTIVE_HYPHENS, '-')
    .replace(LEADING_TRAILING_HYPHENS, '');
}

/* ------------------------------------------------------------------ */
/*  QR SVG Fragment Generation                                       */
/* ------------------------------------------------------------------ */

const QR_CELL_SIZE_PX = 4;

/**
 * Generates an SVG fragment for a QR code.
 * Returns null for empty content.
 */
export function generateQrSvgFragment(content: string): string | null {
  if (content.trim() === '') {
    return null;
  }

  const qr = qrcode(0, 'M');

  qr.addData(content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = QR_CELL_SIZE_PX;
  const size = moduleCount * cellSize;
  const rects: string[] = [];

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        rects.push(
          `<rect x="${String(col * cellSize)}" y="${String(row * cellSize)}" width="${String(cellSize)}" height="${String(cellSize)}"/>`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}">`,
    `<rect width="${String(size)}" height="${String(size)}" fill="#ffffff"/>`,
    `<g fill="#000000">`,
    ...rects,
    `</g>`,
    `</svg>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Video Export Support Detection                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns true if VideoEncoder API is available in the current environment.
 */
export function isVideoExportSupported(): boolean {
  return typeof globalThis.VideoEncoder !== 'undefined';
}

/**
 * Exports video as a Blob. Rejects when VideoEncoder is unavailable.
 */
export function exportVideoBlob(): Promise<Blob> {
  if (!isVideoExportSupported()) {
    return Promise.reject(new Error('Video export is not supported: VideoEncoder API is unavailable'));
  }

  return Promise.reject(new Error('Video export is not yet implemented'));
}

/* ------------------------------------------------------------------ */
/*  OGraf Package Generation                                         */
/* ------------------------------------------------------------------ */

interface OGrafSchemaInput {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string;
}

interface OGrafSchema {
  readonly defaults: Readonly<Record<string, string>>;
  readonly inputs: readonly OGrafSchemaInput[];
}

interface OGrafPackage {
  readonly elementId: string;
  readonly name: string;
  readonly schema: OGrafSchema;
  readonly runtime: string;
}

function buildOGrafRuntime(element: BroadsetElement): string {
  switch (element.type) {
    case 'qrcode': {
      const svg = generateQrSvgFragment(element.content);

      return svg ?? '';
    }

    case 'svg':
      return element.content;
    case 'image':
    case 'video':
      return `<div data-element-id="${element.id}" data-type="${element.type}" data-asset="true"></div>`;
    default:
      return `<div data-element-id="${element.id}" data-type="${element.type}">${element.content}</div>`;
  }
}

function buildOGrafSchema(element: BroadsetElement): OGrafSchema {
  if (element.type === 'text') {
    const key = `${element.id}-content`;

    return {
      defaults: Object.freeze({ [key]: element.content }),
      inputs: Object.freeze([{ name: key, type: 'text', defaultValue: element.content }]),
    };
  }

  return { defaults: Object.freeze({}), inputs: Object.freeze([]) };
}

/**
 * Generates one OGraf broadcast package per top-level element.
 * Text content is exposed as schema defaults.
 * Image elements are not exposed as text inputs.
 * QR elements are pre-rendered to inline SVG.
 */
export function generateOGrafPackages(document: BroadsetDocument): readonly OGrafPackage[] {
  return document.elements.map((element) => ({
    elementId: element.id,
    name: sanitizeFilename(element.name) || element.id,
    schema: buildOGrafSchema(element),
    runtime: buildOGrafRuntime(element),
  }));
}
