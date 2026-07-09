import { type BroadsetElement } from '@broadset/model';

import { escapeXmlAttribute } from '../ooxml/xml';
import { buildElementExt } from '../semantic/element-ext';
import { encodeShapeName } from '../semantic/shape-name';
import { type ElementMetaExtension } from '../types';
import { allocateShapeId, type SlideExportContext } from './context';
import { emitTransform } from './primitives';

/** Extract per-shape non-visual properties (`<p:cNvPr>` + `<p:extLst>`). */
export function emitNonVisualProps(
  ctx: SlideExportContext,
  element: BroadsetElement,
  kind: string,
  options?: { readonly isPicture?: boolean; readonly isGroup?: boolean },
): string {
  const id = allocateShapeId(ctx);

  ctx.shapeIdByElementId.set(element.id, id);

  const dataFieldName = readDataFieldName(element);
  const visibleWhen = readStringOrNull(element.visibleWhen);
  const repeaterField = readRepeaterField(element);
  const tag = dataFieldName !== null ? { id: element.id, kind, dataField: dataFieldName } : { id: element.id, kind };
  const name = encodeShapeName(tag);
  const escapedName = escapeXmlAttribute(name);
  const meta: ElementMetaExtension = {
    id: element.id,
    kind,
    dirty: readDirtyFlag(element),
    ...(dataFieldName !== null ? { dataField: dataFieldName } : {}),
    ...(visibleWhen !== null ? { visibleWhen } : {}),
    ...(repeaterField !== null ? { repeater: repeaterField } : {}),
    ...(kind !== element.type ? { originalKind: element.type } : {}),
  };
  const ext = buildElementExt(meta);
  const extLst = `<p:extLst>${ext}</p:extLst>`;
  const variant = selectVariant(options);

  return `<${variant.wrapper}><p:cNvPr id="${String(id)}" name="${escapedName}"/>${variant.spProps}<p:nvPr>${extLst}</p:nvPr></${variant.wrapper}>`;
}

function selectVariant(options: { readonly isPicture?: boolean; readonly isGroup?: boolean } | undefined): {
  readonly wrapper: string;
  readonly spProps: string;
} {
  if (options?.isPicture === true) return { wrapper: 'p:nvPicPr', spProps: '<p:cNvPicPr/>' };
  if (options?.isGroup === true) return { wrapper: 'p:nvGrpSpPr', spProps: '<p:cNvGrpSpPr/>' };

  return { wrapper: 'p:nvSpPr', spProps: '<p:cNvSpPr/>' };
}

function readDirtyFlag(element: BroadsetElement): boolean {
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return true;

  const record = extensions as Record<string, unknown>;
  const pptx = record['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return true;

  const pptxRecord = pptx as Record<string, unknown>;
  const dirty = pptxRecord['dirty'];

  return dirty === undefined ? true : Boolean(dirty);
}

function readDataFieldName(element: BroadsetElement): string | null {
  const value = element.dataField as unknown;

  if (typeof value !== 'object' || value === null) return null;

  const name = (value as Record<string, unknown>)['fieldName'];

  return typeof name === 'string' && name.length > 0 ? name : null;
}

function readStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRepeaterField(element: BroadsetElement): string | null {
  const value = element.repeater as unknown;

  if (typeof value !== 'object' || value === null) return null;

  const name = (value as Record<string, unknown>)['dataArrayField'];

  return typeof name === 'string' && name.length > 0 ? name : null;
}

/**
 * Pull the preserved raw OOXML blob from `extensions.pptx.raw` when
 * `dirty === false`.
 */
export function readRawBlob(element: BroadsetElement): string | null {
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return null;

  const pptx = (extensions as Record<string, unknown>)['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return null;

  const record = pptx as Record<string, unknown>;

  if (record['dirty'] !== false) return null;

  const raw = record['raw'];

  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Element-aware wrapper around emitTransform that includes
 * `flipH` / `flipV` flags read from `extensions.pptx`.
 */
export function emitElementXfrm(ctx: SlideExportContext, element: BroadsetElement): string {
  const flip = readFlipFlags(element);

  return emitTransform(ctx, {
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotationDegrees: element.rotation,
    flipH: flip.flipH,
    flipV: flip.flipV,
  });
}

/**
 * Extract OOXML flip flags from `extensions.pptx.flipH` / `flipV`.
 */
export function readFlipFlags(element: BroadsetElement): { readonly flipH: boolean; readonly flipV: boolean } {
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return { flipH: false, flipV: false };

  const pptx = (extensions as Record<string, unknown>)['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return { flipH: false, flipV: false };

  const record = pptx as Record<string, unknown>;

  return { flipH: record['flipH'] === true, flipV: record['flipV'] === true };
}
