import { type BroadsetElement, resolveContentAsPlainString } from '@broadset/model';

import { allocateMediaIndex, type SlideExportContext } from './context';
import { emitEffects, emitStroke } from './primitives';
import { emitElementXfrm, emitNonVisualProps } from './shape-common';

/** Build a `<p:pic>` picture shape for image / svg elements. */
export function emitPictureShape(
  ctx: SlideExportContext,
  element: BroadsetElement,
  relId: string,
  kind: string,
): string {
  const nv = emitNonVisualProps(ctx, element, kind, { isPicture: true });
  const xfrm = emitElementXfrm(ctx, element);
  const stroke = emitStroke(element.style, ctx);
  const srcRect = readPreservedSrcRect(element);

  return `<p:pic>${nv}<p:blipFill><a:blip r:embed="${relId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${stroke}${emitEffects(element.style, ctx, element.id)}</p:spPr></p:pic>`;
}

function readPreservedSrcRect(element: BroadsetElement): string {
  const extensionsBag = element.extensions as Readonly<Record<string, unknown>> | undefined;
  const ext = extensionsBag?.['pptx'];

  if (typeof ext !== 'object' || ext === null) return '';

  const record = ext as Record<string, unknown>;

  if (record['dirty'] === true) return '';

  const srcRect = record['srcRect'];

  if (typeof srcRect !== 'object' || srcRect === null) return '';

  const rect = srcRect as Record<string, unknown>;
  const l = typeof rect['l'] === 'number' ? rect['l'] : 0;
  const t = typeof rect['t'] === 'number' ? rect['t'] : 0;
  const r = typeof rect['r'] === 'number' ? rect['r'] : 0;
  const b = typeof rect['b'] === 'number' ? rect['b'] : 0;

  if (l === 0 && t === 0 && r === 0 && b === 0) return '';

  const attrs = [
    l !== 0 ? `l="${String(l)}"` : '',
    t !== 0 ? `t="${String(t)}"` : '',
    r !== 0 ? `r="${String(r)}"` : '',
    b !== 0 ? `b="${String(b)}"` : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ');

  return `<a:srcRect ${attrs}/>`;
}

interface DecodedMedia {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** Decode a data URI into MIME + bytes. Returns undefined for malformed input. */
export function decodeDataUri(uri: string): DecodedMedia | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,([\s\S]*)$/);

  if (!match) return undefined;

  const mime = match[1] ?? '';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  try {
    if (encoding === 'base64') {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    }

    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(data)) };
  } catch {
    return undefined;
  }
}

export function extensionForMime(mime: string): string {
  const lower = mime.toLowerCase();

  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('svg')) return 'svg';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('bmp')) return 'bmp';

  return 'bin';
}

/** Allocate a media path + register the asset on the context. */
export function registerMedia(ctx: SlideExportContext, ext: string, bytes: Uint8Array): string {
  const index = allocateMediaIndex(ctx);
  const fileName = `media${String(index)}.${ext}`;
  const path = `ppt/media/${fileName}`;

  ctx.media.set(path, bytes);

  return path;
}

export function registerImageElement(
  ctx: SlideExportContext,
  element: BroadsetElement,
  defaultExt: string,
): string | null {
  const content = resolveContentAsPlainString(element.content);

  if (content.length === 0) return null;

  const decoded = decodeDataUri(content);

  if (decoded === undefined) return null;

  const mimeExt = extensionForMime(decoded.mime);
  const ext = mimeExt === 'bin' ? defaultExt : mimeExt;
  const path = registerMedia(ctx, ext, decoded.bytes);
  const target = `../media/${path.replace('ppt/media/', '')}`;

  return ctx.rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target);
}

export function registerSvgElement(ctx: SlideExportContext, element: BroadsetElement): string | null {
  const content = resolveContentAsPlainString(element.content);

  if (content.length === 0) return null;

  const bytes = new TextEncoder().encode(content);
  const path = registerMedia(ctx, 'svg', bytes);
  const target = `../media/${path.replace('ppt/media/', '')}`;

  return ctx.rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target);
}
