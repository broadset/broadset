import { findDescendant, getAttr, type XmlElement } from '../ooxml/ast';
import type { PptxSourceElement } from '../project-model';

export interface PictureSourceRef {
  readonly path: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export interface PictureImportWarning {
  readonly code: 'unsupported-shape' | 'unsupported-content';
  readonly message: string;
  readonly detail?: string;
}

interface SrcRect {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

interface BuildPictureElementOptions {
  readonly shape: XmlElement;
  readonly name: string;
  readonly id: string;
  readonly mediaByRelId: ReadonlyMap<string, PictureSourceRef>;
  readonly createFallback: () => PptxSourceElement;
  readonly createImageBase: () => PptxSourceElement;
  readonly pushWarning: (warning: PictureImportWarning) => void;
}

export function buildPictureElement(options: BuildPictureElementOptions): PptxSourceElement {
  const blip = findDescendant(options.shape, 'a:blip');

  if (blip === null) {
    options.pushWarning({
      code: 'unsupported-content',
      message: `Picture shape "${options.name}" has no <a:blip> fill — rendered as transparent rectangle.`,
      detail: options.id,
    });

    return options.createFallback();
  }

  const relId = getAttr(blip, 'embed') ?? '';
  const media = options.mediaByRelId.get(relId);

  if (media === undefined) {
    options.pushWarning({
      code: 'unsupported-content',
      message: `Picture shape "${options.name}" references missing media (rel "${relId}") — rendered as transparent rectangle.`,
      detail: options.id,
    });

    return options.createFallback();
  }

  const base = options.createImageBase();
  const dataUri = `data:${media.mime};base64,${uint8ToBase64(media.bytes)}`;
  const srcRect = parseSrcRect(options.shape);

  if (srcRect === null) return { ...base, content: dataUri };

  // Apply the OOXML crop visually via `style.customClipPath` (CSS
  // `inset()` is the exact semantic match for `<a:srcRect>`) AND
  // preserve the raw srcRect on `extensions.pptx.srcRect` so a clean
  // round-trip re-emits the same crop.
  const clipPath = `inset(${formatPercent(srcRect.t)} ${formatPercent(srcRect.r)} ${formatPercent(srcRect.b)} ${formatPercent(srcRect.l)})`;
  const existingExt = (base.extensions['pptx'] as Record<string, unknown> | undefined) ?? {};

  return {
    ...base,
    content: dataUri,
    style: {
      ...base.style,
      customClipPath: clipPath,
    },
    extensions: {
      ...base.extensions,
      pptx: {
        ...existingExt,
        srcRect,
      },
    },
  };
}

function formatPercent(ooxmlValue: number): string {
  // OOXML srcRect uses 1/100000 units; CSS inset() takes percentages.
  return `${(ooxmlValue / 1000).toFixed(2)}%`;
}

function parseSrcRect(shape: XmlElement): SrcRect | null {
  const node = findDescendant(shape, 'a:srcRect');

  if (node === null) return null;

  const l = parseInt(getAttr(node, 'l') ?? '0', 10);
  const t = parseInt(getAttr(node, 't') ?? '0', 10);
  const r = parseInt(getAttr(node, 'r') ?? '0', 10);
  const b = parseInt(getAttr(node, 'b') ?? '0', 10);

  if (l === 0 && t === 0 && r === 0 && b === 0) return null;

  return { l, t, r, b };
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
