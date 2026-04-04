import type { BroadsetDocument, Page } from '@broadset/model';
import { broadsetDocumentSchema } from '@broadset/model';
import qrcode from 'qrcode-generator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Characters illegal in common file-system paths (Windows + macOS + Linux). */
const ILLEGAL_FS_CHARS = /[<>:"/\\|?*]/g;

/** Consecutive hyphens. */
const CONSECUTIVE_HYPHENS = /-{2,}/g;

// ---------------------------------------------------------------------------
// JSON Document Export / Import
// ---------------------------------------------------------------------------

/**
 * Serialise a BroadsetDocument to a JSON string.
 * The output is valid, schema-conformant JSON that can be re-parsed and
 * validated without loss.
 */
export function exportDocumentJson(doc: BroadsetDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Parse a JSON string into a validated BroadsetDocument.
 * Throws if the JSON is malformed or does not conform to the schema.
 */
export function importDocumentJson(json: string): BroadsetDocument {
  const raw: unknown = JSON.parse(json);
  const result = broadsetDocumentSchema.safeParse(raw);

  if (!result.success) {
    throw new Error(`Invalid BroadsetDocument JSON: ${result.error.message}`);
  }

  return result.data as BroadsetDocument;
}

// ---------------------------------------------------------------------------
// OGraf Package Generation
// ---------------------------------------------------------------------------

/** A single schema data-input entry in an OGraf manifest. */
interface OgrafSchemaEntry {
  readonly id: string;
  readonly type: 'text' | 'image';
  readonly label: string;
  readonly defaultValue: string;
}

/** OGraf manifest for one broadcast package. */
interface OgrafManifest {
  readonly elementId: string;
  readonly name: string;
  readonly schema: readonly OgrafSchemaEntry[];
  readonly realtime: false;
}

/** Runtime payload for a single OGraf package. */
interface OgrafRuntime {
  readonly elementId: string;
  readonly inlineSvg?: string | undefined;
}

/** A complete OGraf broadcast package. */
export interface OgrafPackage {
  readonly manifest: OgrafManifest;
  readonly runtime: OgrafRuntime;
}

/**
 * Resolve top-level elements from the first page of the document.
 * A top-level element has no parentId.
 */
function getTopLevelElements(doc: BroadsetDocument): readonly Page['elements'][number][] {
  const firstPage = doc.pages[0];

  if (!firstPage) {
    return [];
  }

  return firstPage.elements.filter((el) => el.parentId === null);
}

/**
 * Build OGraf schema entries for a single element.
 * - Text elements produce a text data input with their content as default.
 * - Image elements are NOT exposed as text data inputs.
 * - QR code elements are NOT exposed as text data inputs.
 */
function buildSchemaEntries(element: Page['elements'][number]): readonly OgrafSchemaEntry[] {
  if (element.type === 'text') {
    return [
      {
        id: element.id,
        type: 'text',
        label: element.id,
        defaultValue: element.content,
      },
    ];
  }

  // Image, QR, and other types are not text data inputs.
  return [];
}

/**
 * Build the runtime payload for a single element.
 * QR code elements get pre-rendered inline SVG.
 */
function buildRuntime(element: Page['elements'][number]): OgrafRuntime {
  if (element.type === 'qrcode' && element.content.length > 0) {
    const svg = generateQrSvgFragment(element.content);

    return {
      elementId: element.id,
      inlineSvg: svg ?? undefined,
    };
  }

  return { elementId: element.id };
}

/**
 * Generate one OGraf broadcast package per top-level element.
 * Each package includes a non-real-time manifest with runtime methods.
 */
export function generateOgrafPackages(doc: BroadsetDocument): readonly OgrafPackage[] {
  const topLevel = getTopLevelElements(doc);

  return topLevel.map((element) => ({
    manifest: {
      elementId: element.id,
      name: element.id,
      schema: [...buildSchemaEntries(element)],
      realtime: false as const,
    },
    runtime: buildRuntime(element),
  }));
}

// ---------------------------------------------------------------------------
// Video Export Support Detection
// ---------------------------------------------------------------------------

/** Check whether the current environment supports video export (WebCodecs). */
export function isVideoExportSupported(): boolean {
  return typeof (globalThis as Record<string, unknown>)['VideoEncoder'] !== 'undefined';
}

/**
 * Export the document as a video blob.
 * Rejects with an error if the environment does not support video export.
 */
export function exportVideoBlob(): Promise<Blob> {
  if (!isVideoExportSupported()) {
    return Promise.reject(
      new Error('Video export is not supported in this environment: VideoEncoder is not available'),
    );
  }

  // Actual video encoding implementation deferred to a future unit
  // when the full video export pipeline (MediaBunny integration) is ready.
  return Promise.reject(new Error('Video export is not yet implemented'));
}

// ---------------------------------------------------------------------------
// QR SVG Fragment Generation
// ---------------------------------------------------------------------------

/**
 * Generate an SVG fragment for a QR code.
 * Returns null for empty content.
 * The fragment includes a white background rectangle and dark QR modules.
 */
export function generateQrSvgFragment(content: string): string | null {
  if (content.length === 0) {
    return null;
  }

  const qr = qrcode(0, 'M');

  qr.addData(content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = 4;
  const size = moduleCount * cellSize;

  // Build SVG fragment with white background and dark modules
  const rects: string[] = [];

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const x = col * cellSize;
        const y = row * cellSize;

        rects.push(
          `<rect x="${String(x)}" y="${String(y)}" width="${String(cellSize)}" height="${String(cellSize)}"/>`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}">`,
    `<rect x="0" y="0" width="${String(size)}" height="${String(size)}" fill="#ffffff"/>`,
    `<g fill="#000000">`,
    ...rects,
    '</g>',
    '</svg>',
  ].join('');
}

// ---------------------------------------------------------------------------
// Filename Sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitise a string for use as a filename.
 * - Replaces spaces with hyphens
 * - Replaces illegal filesystem characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 * - Returns empty string for whitespace-only input
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(ILLEGAL_FS_CHARS, '-')
    .replace(CONSECUTIVE_HYPHENS, '-')
    .replace(/^-+|-+$/g, '');
}
