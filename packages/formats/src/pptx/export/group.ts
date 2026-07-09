import { type BroadsetElement } from '@broadset/model';

import { escapeXmlText } from '../ooxml/xml';
import { type SlideExportContext } from './context';
import { emitColorFill, emitElementFill, emitStroke, emitTransform } from './primitives';
import { emitElementXfrm, emitNonVisualProps, readFlipFlags } from './shape-common';

/** Build a `<p:grpSp>` group shape wrapping the given rendered-child XML. */
export function emitGroupShape(
  ctx: SlideExportContext,
  element: BroadsetElement,
  childrenXml: string,
): string {
  const nv = emitNonVisualProps(ctx, element, 'group', { isGroup: true });
  const flip = readFlipFlags(element);
  const xfrm = emitTransform(ctx, {
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotationDegrees: element.rotation,
    flipH: flip.flipH,
    flipV: flip.flipV,
    includeChildOffset: true,
  });

  return `<p:grpSp>${nv}<p:grpSpPr>${xfrm}</p:grpSpPr>${childrenXml}</p:grpSp>`;
}

/** Fallback shape for elements not mapped to OOXML natively. */
export function emitFallbackShape(
  ctx: SlideExportContext,
  element: BroadsetElement,
  originalKind: string,
): string {
  const nv = emitNonVisualProps(ctx, element, originalKind);
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  const label = escapeXmlText(element.name.length > 0 ? element.name : originalKind);
  const body = `<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200">${emitColorFill({ kind: 'rgb', hex: '#666666' })}</a:rPr><a:t>${label}</a:t></a:r></a:p></p:txBody>`;

  return `<p:sp>${nv}<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${stroke}</p:spPr>${body}</p:sp>`;
}
