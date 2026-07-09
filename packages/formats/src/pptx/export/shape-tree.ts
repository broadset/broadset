import { type BroadsetElement } from '@broadset/model';

import { allocateShapeId, type SlideExportContext } from './context';
import { emitEllipseShape, emitPathShape, emitRectangleShape } from './geometry';
import { emitFallbackShape, emitGroupShape } from './group';
import { emitPictureShape, registerImageElement, registerSvgElement } from './picture';
import { readRawBlob } from './shape-common';
import { emitTextShape } from './text';

/** Emit the full `<p:spTree>` shape tree for a slide from a flat element list + parent map. */
export function emitShapeTree(ctx: SlideExportContext, elements: readonly BroadsetElement[]): string {
  const byGroupId = new Map<string, BroadsetElement[]>();
  const roots: BroadsetElement[] = [];

  for (const el of elements) {
    const gid = el.groupId;

    if (typeof gid === 'string' && gid.length > 0) {
      const arr = byGroupId.get(gid) ?? [];

      arr.push(el);
      byGroupId.set(gid, arr);
    } else {
      roots.push(el);
    }
  }

  return roots.map((el) => renderElement(ctx, el, byGroupId)).join('');
}

function renderElement(
  ctx: SlideExportContext,
  element: BroadsetElement,
  byGroupId: ReadonlyMap<string, readonly BroadsetElement[]>,
): string {
  const raw = readRawBlob(element);

  if (raw !== null) {
    ctx.shapeIdByElementId.set(element.id, allocateShapeId(ctx));

    return `<p:sp>${raw}</p:sp>`;
  }

  switch (element.type) {
    case 'text':
      return emitTextShape(ctx, element);
    case 'rectangle':
      return emitRectangleShape(ctx, element);
    case 'ellipse':
      return emitEllipseShape(ctx, element);
    case 'path':
      return emitPathShape(ctx, element);

    case 'group': {
      const children = byGroupId.get(element.id) ?? [];
      const childrenXml = children.map((child) => renderElement(ctx, child, byGroupId)).join('');

      return emitGroupShape(ctx, element, childrenXml);
    }

    case 'image': {
      const picRelId = registerImageElement(ctx, element, 'png');

      if (picRelId === null) return emitFallbackShape(ctx, element, 'image');

      return emitPictureShape(ctx, element, picRelId, 'image');
    }

    case 'svg': {
      const relId = registerSvgElement(ctx, element);

      if (relId === null) return emitFallbackShape(ctx, element, 'svg');

      return emitPictureShape(ctx, element, relId, 'svg');
    }

    case 'qrcode':
    case 'clock':
    case 'ticker':
    case 'video':
      return emitFallbackShape(ctx, element, element.type);
    default:
      return emitFallbackShape(ctx, element, element.type);
  }
}
