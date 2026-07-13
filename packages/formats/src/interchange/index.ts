import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetProject,
  getSolidFillColor,
  resolveContentAsPlainString,
  resolveStyleColor,
} from '@broadset/model';
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
  readonly renderRequirements: {
    readonly width: number;
    readonly height: number;
  };
  readonly stepCount: number;
  readonly customActions: readonly string[];
}

function buildElementStyle(element: BroadsetElement): string {
  const parts: string[] = [
    `position:absolute`,
    `left:${String(element.position.x)}px`,
    `top:${String(element.position.y)}px`,
    `width:${String(element.width)}px`,
    `height:${String(element.height)}px`,
  ];

  if (element.rotation !== 0) {
    parts.push(`transform:rotate(${String(element.rotation)}deg)`);
  }

  if (element.style.opacity !== 1) {
    parts.push(`opacity:${String(element.style.opacity)}`);
  }

  const backgroundCss = resolveStyleColor(getSolidFillColor(element.style.fill), { resolveTheme: false });

  if (backgroundCss !== undefined) {
    parts.push(`background:${backgroundCss}`);
  }

  if (element.style.fontFamily) {
    parts.push(`font-family:${element.style.fontFamily}`);
  }

  if (element.style.fontSize) {
    parts.push(`font-size:${String(element.style.fontSize)}px`);
  }

  const fontColorCss = resolveStyleColor(element.style.fontColor, { resolveTheme: false });

  if (fontColorCss !== undefined) {
    parts.push(`color:${fontColorCss}`);
  }

  return parts.join(';');
}

function buildOGrafRuntime(element: BroadsetElement): string {
  const style = buildElementStyle(element);

  const contentText = resolveContentAsPlainString(element.content);

  switch (element.type) {
    case 'qrcode': {
      const svg = generateQrSvgFragment(contentText);

      return svg !== null ? `<div style="${style}">${svg}</div>` : '';
    }

    case 'svg':
      return `<div style="${style}">${contentText}</div>`;
    case 'image':
    case 'video':
      return `<div data-element-id="${element.id}" data-type="${element.type}" data-asset="true" style="${style}"></div>`;
    default:
      return `<div data-element-id="${element.id}" data-type="${element.type}" style="${style}">${contentText}</div>`;
  }
}

function buildOGrafSchema(element: BroadsetElement): OGrafSchema {
  const defaults: Record<string, string> = {};
  const inputs: OGrafSchemaInput[] = [];

  // Text content binding
  if (element.type === 'text') {
    const key = `${element.id}-content`;
    const contentText = resolveContentAsPlainString(element.content);

    defaults[key] = contentText;
    inputs.push({ name: key, type: 'text', defaultValue: contentText });
  }

  // Data binding field
  if (element.dataField != null) {
    const key = `${element.id}-data`;
    const fieldName = element.dataField.fieldName;

    defaults[key] = fieldName;
    inputs.push({ name: key, type: 'text', defaultValue: fieldName });
  }

  return {
    defaults: Object.freeze(defaults),
    inputs: Object.freeze(inputs),
  };
}

/**
 * Generates one OGraf broadcast package per top-level element.
 * Text content is exposed as schema defaults.
 * Image elements are not exposed as text inputs.
 * QR elements are pre-rendered to inline SVG.
 * Includes renderRequirements (canvas dimensions), stepCount (from animations), and customActions.
 */
export function generateOGrafPackages(document: BroadsetDocument): readonly OGrafPackage[] {
  const { canvas } = document;

  return document.elements.map((element) => {
    // Count animation timelines for this element as step states
    const elementAnimations = document.animations.filter((a) => a.elementId === element.id);
    const totalKeyframes = elementAnimations.reduce(
      (sum, a) => sum + a.config.timelines.reduce((ts, tl) => ts + tl.keyframes.length, 0),
      0,
    );

    return {
      elementId: element.id,
      name: sanitizeFilename(element.name) || element.id,
      schema: buildOGrafSchema(element),
      runtime: buildOGrafRuntime(element),
      renderRequirements: { width: canvas.width, height: canvas.height },
      stepCount: totalKeyframes,
      customActions: totalKeyframes > 0 ? ['set-step'] : [],
    };
  });
}
