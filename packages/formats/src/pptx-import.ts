/**
 * @module pptx-import
 * @description PPTX import — parses OOXML slide XML to recover elements.
 */
import PizZip from 'pizzip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EMU (English Metric Units) per millimetre: 914400 / 25.4 */
const EMU_PER_MM = 36000;

/** Convert EMU back to mm. */
function emuToMm(emu: number): number {
  return emu / EMU_PER_MM;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Imported element from PPTX. */
export interface ImportedPptxElement {
  readonly type: string;
  readonly content: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import elements from a PPTX file.
 *
 * @param data - Uint8Array of the PPTX zip archive
 * @returns Array of recovered elements
 */
export function importPptx(data: Uint8Array): readonly ImportedPptxElement[] {
  const zip = new PizZip(data);
  const results: ImportedPptxElement[] = [];

  const slideEntry = zip.file('ppt/slides/slide1.xml');

  if (!slideEntry) {
    return results;
  }

  const slideXml = slideEntry.asText();

  const relsEntry = zip.file('ppt/slides/_rels/slide1.xml.rels');
  const rIdToTarget = new Map<string, string>();

  if (relsEntry) {
    const relsXml = relsEntry.asText();
    const relPattern = /Relationship\s+Id="([^"]+)"\s+Type="[^"]+"\s+Target="([^"]+)"/g;
    let relMatch = relPattern.exec(relsXml);

    while (relMatch !== null) {
      const id = relMatch[1];
      const target = relMatch[2];

      if (id !== undefined && target !== undefined) {
        rIdToTarget.set(id, target);
      }

      relMatch = relPattern.exec(relsXml);
    }
  }

  parseShapes(slideXml, zip, rIdToTarget, results);

  return results;
}

// ---------------------------------------------------------------------------
// XML Parsers
// ---------------------------------------------------------------------------

/**
 * Parse shape elements from slide XML content and add to results.
 */
function parseShapes(
  xml: string,
  zip: PizZip,
  rIdToTarget: ReadonlyMap<string, string>,
  results: ImportedPptxElement[],
): void {
  parseGroups(xml, zip, rIdToTarget, results);
  parseNativeShapes(xml, results);
  parsePictureShapes(xml, zip, rIdToTarget, results);
}

/**
 * Parse group shapes from XML and recurse into children.
 */
function parseGroups(
  xml: string,
  zip: PizZip,
  rIdToTarget: ReadonlyMap<string, string>,
  results: ImportedPptxElement[],
): void {
  const grpPattern = /<p:grpSp>([\s\S]*?)<\/p:grpSp>/g;
  let grpMatch = grpPattern.exec(xml);

  while (grpMatch !== null) {
    const inner = grpMatch[1];

    if (inner !== undefined) {
      parseNativeShapes(inner, results);
      parsePictureShapes(inner, zip, rIdToTarget, results);
    }

    grpMatch = grpPattern.exec(xml);
  }
}

/**
 * Parse native shapes (p:sp) from XML.
 */
function parseNativeShapes(xml: string, results: ImportedPptxElement[]): void {
  const spPattern = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let spMatch = spPattern.exec(xml);

  while (spMatch !== null) {
    const spContent = spMatch[1] ?? '';
    const bounds = extractBounds(spContent);
    const textMatch = /<a:t>([^<]*)<\/a:t>/g.exec(spContent);

    if (textMatch) {
      results.push({
        type: 'text',
        content: unescapeXml(textMatch[1] ?? ''),
        ...bounds,
      });
    } else {
      results.push({
        type: 'rectangle',
        content: '',
        ...bounds,
      });
    }

    spMatch = spPattern.exec(xml);
  }
}

/**
 * Parse picture shapes (pic:pic) from XML.
 */
function parsePictureShapes(
  xml: string,
  zip: PizZip,
  rIdToTarget: ReadonlyMap<string, string>,
  results: ImportedPptxElement[],
): void {
  const picPattern = /<pic:pic[^>]*>([\s\S]*?)<\/pic:pic>/g;
  let picMatch = picPattern.exec(xml);

  while (picMatch !== null) {
    const picContent = picMatch[1] ?? '';
    const bounds = extractBounds(picContent);
    const embedMatch = /r:embed="([^"]+)"/.exec(picContent);
    const rId = embedMatch?.[1];
    const target = rId ? rIdToTarget.get(rId) : undefined;

    if (target !== undefined && target.endsWith('.svg')) {
      const mediaPath = target.replace(/^\.\.\//, 'ppt/');
      const mediaEntry = zip.file(mediaPath);

      if (mediaEntry) {
        const svgContent = mediaEntry.asText();

        results.push(attemptPathRecovery(svgContent, bounds));
      }
    } else if (target !== undefined) {
      const mediaPath = target.replace(/^\.\.\//, 'ppt/');
      const mediaEntry = zip.file(mediaPath);
      const content = mediaEntry ? encodeImageDataUri(mediaEntry) : '';

      results.push({
        type: 'image',
        content,
        ...bounds,
      });
    }

    picMatch = picPattern.exec(xml);
  }
}

// ---------------------------------------------------------------------------
// Bounds & Recovery Helpers
// ---------------------------------------------------------------------------

/**
 * Extract position and size bounds from an xfrm XML fragment.
 */
function extractBounds(xml: string): {
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
} {
  const offMatch = /<a:off\s+x="(\d+)"\s+y="(\d+)"/.exec(xml);
  const extMatch = /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/.exec(xml);
  const rotMatch = /<a:xfrm\s+rot="(-?\d+)"/.exec(xml);

  const x = offMatch?.[1] ? emuToMm(parseInt(offMatch[1], 10)) : 0;
  const y = offMatch?.[2] ? emuToMm(parseInt(offMatch[2], 10)) : 0;
  const width = extMatch?.[1] ? emuToMm(parseInt(extMatch[1], 10)) : 0;
  const height = extMatch?.[2] ? emuToMm(parseInt(extMatch[2], 10)) : 0;
  const rotation = rotMatch?.[1] ? parseInt(rotMatch[1], 10) / 60000 : 0;

  return { position: { x, y }, width, height, rotation };
}

/**
 * Attempt to recover a path element from SVG media content.
 *
 * High-confidence recovery: a single `<path>` element without complex fills,
 * filters, or multiple shapes. Otherwise preserve as SVG payload.
 */
function attemptPathRecovery(
  svgContent: string,
  bounds: {
    readonly position: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
  },
): ImportedPptxElement {
  const pathCount = (svgContent.match(/<path\b/g) ?? []).length;
  const otherShapeCount =
    (svgContent.match(/<rect\b/g) ?? []).length +
    (svgContent.match(/<circle\b/g) ?? []).length +
    (svgContent.match(/<ellipse\b/g) ?? []).length +
    (svgContent.match(/<line\b/g) ?? []).length +
    (svgContent.match(/<polyline\b|<polygon\b/g) ?? []).length;
  const foreignCount = (svgContent.match(/<foreignObject\b/g) ?? []).length;

  if (pathCount === 1 && otherShapeCount === 0 && foreignCount === 0) {
    const dMatch = /<path[^>]+d="([^"]+)"/.exec(svgContent);

    return {
      type: 'path',
      content: dMatch?.[1] ?? '',
      ...bounds,
    };
  }

  return {
    type: 'svg',
    content: svgContent,
    ...bounds,
  };
}

/** Encode a zip media entry as a data URI. */
function encodeImageDataUri(entry: { asArrayBuffer: () => ArrayBuffer }): string {
  const buf = entry.asArrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }

  const base64 = btoa(binary);

  return `data:image/png;base64,${base64}`;
}

/** Unescape basic XML entities. */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
