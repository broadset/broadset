import { type BroadsetElement, resolveContentAsPlainString } from '@broadset/model';
import svgpath from 'svgpath';

import { type SlideExportContext } from './context';
import { emitEffects, emitElementFill, emitStroke } from './primitives';
import { emitElementXfrm, emitNonVisualProps } from './shape-common';

/** Build a `<p:sp>` for a rectangle. Uniform radius → roundRect preset; per-corner → custGeom. */
export function emitRectangleShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'rectangle');
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);
  const geom = emitRectangleGeometry(element);

  return `<p:sp>${nv}<p:spPr>${xfrm}${geom}${fill}${stroke}${emitEffects(element.style, ctx, element.id)}</p:spPr></p:sp>`;
}

function emitRectangleGeometry(element: BroadsetElement): string {
  const radii = element.style.borderRadius;

  if (radii === undefined) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const [tl, tr, br, bl] = radii;
  const uniform = tl === tr && tr === br && br === bl;

  if (uniform && tl > 0) {
    const shortEdge = Math.min(element.width, element.height) || 1;
    const percent = Math.round(Math.max(0, Math.min(0.5, tl / shortEdge)) * 100000);

    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${String(percent)}"/></a:avLst></a:prstGeom>`;
  }

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }

  return emitPerCornerCustGeom(element.width, element.height, radii);
}

function emitPerCornerCustGeom(width: number, height: number, radii: readonly number[]): string {
  const [tl = 0, tr = 0, br = 0, bl = 0] = radii;
  const w = 100000;
  const h = 100000;
  const scaleX = (v: number): number => Math.round((v / width) * w);
  const scaleY = (v: number): number => Math.round((v / height) * h);
  const tls = scaleX(tl);
  const trs = scaleX(tr);
  const brs = scaleX(br);
  const bls = scaleX(bl);
  const tlsY = scaleY(tl);
  const trsY = scaleY(tr);
  const brsY = scaleY(br);
  const blsY = scaleY(bl);

  const path = `<a:path w="${String(w)}" h="${String(h)}">
    <a:moveTo><a:pt x="0" y="${String(tlsY)}"/></a:moveTo>
    <a:arcTo wR="${String(tls)}" hR="${String(tlsY)}" stAng="10800000" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(w - trs)}" y="0"/></a:lnTo>
    <a:arcTo wR="${String(trs)}" hR="${String(trsY)}" stAng="16200000" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(w)}" y="${String(h - brsY)}"/></a:lnTo>
    <a:arcTo wR="${String(brs)}" hR="${String(brsY)}" stAng="0" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(bls)}" y="${String(h)}"/></a:lnTo>
    <a:arcTo wR="${String(bls)}" hR="${String(blsY)}" stAng="5400000" swAng="5400000"/>
    <a:close/>
  </a:path>`;

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${String(w)}" b="${String(h)}"/><a:pathLst>${path}</a:pathLst></a:custGeom>`;
}

export function emitEllipseShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'ellipse');
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  return `<p:sp>${nv}<p:spPr>${xfrm}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>${fill}${stroke}${emitEffects(element.style, ctx, element.id)}</p:spPr></p:sp>`;
}

/** Emit an SVG path element as OOXML `<a:custGeom>` — native editable path. */
export function emitPathShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'path');
  const xfrm = emitElementXfrm(ctx, element);
  const d = resolveContentAsPlainString(element.content);
  const geom = emitCustGeomFromD(d, element.width, element.height);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  return `<p:sp>${nv}<p:spPr>${xfrm}${geom}${fill}${stroke}${emitEffects(element.style, ctx, element.id)}</p:spPr></p:sp>`;
}

function emitCustGeomFromD(d: string, width: number, height: number): string {
  if (d.length === 0) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const w = 100000;
  const h = 100000;
  const scaleX = width === 0 ? 1 : w / width;
  const scaleY = height === 0 ? 1 : h / height;
  let path: string;

  try {
    const normalized = svgpath(d).abs().unarc().unshort();
    const ops: string[] = [];

    const pt = (v: unknown): number => (typeof v === 'number' ? v : 0);

    normalized.iterate((segment) => {
      const cmd = segment[0];

      if (cmd === 'M') {
        const x = pt(segment[1]) * scaleX;
        const y = pt(segment[2]) * scaleY;

        ops.push(`<a:moveTo><a:pt x="${String(Math.round(x))}" y="${String(Math.round(y))}"/></a:moveTo>`);
      } else if (cmd === 'L') {
        const x = pt(segment[1]) * scaleX;
        const y = pt(segment[2]) * scaleY;

        ops.push(`<a:lnTo><a:pt x="${String(Math.round(x))}" y="${String(Math.round(y))}"/></a:lnTo>`);
      } else if (cmd === 'C') {
        const c1x = pt(segment[1]) * scaleX;
        const c1y = pt(segment[2]) * scaleY;
        const c2x = pt(segment[3]) * scaleX;
        const c2y = pt(segment[4]) * scaleY;
        const ex = pt(segment[5]) * scaleX;
        const ey = pt(segment[6]) * scaleY;

        ops.push(
          `<a:cubicBezTo><a:pt x="${String(Math.round(c1x))}" y="${String(Math.round(c1y))}"/><a:pt x="${String(Math.round(c2x))}" y="${String(Math.round(c2y))}"/><a:pt x="${String(Math.round(ex))}" y="${String(Math.round(ey))}"/></a:cubicBezTo>`,
        );
      } else if (cmd === 'Q') {
        const cx = pt(segment[1]) * scaleX;
        const cy = pt(segment[2]) * scaleY;
        const ex = pt(segment[3]) * scaleX;
        const ey = pt(segment[4]) * scaleY;

        ops.push(
          `<a:quadBezTo><a:pt x="${String(Math.round(cx))}" y="${String(Math.round(cy))}"/><a:pt x="${String(Math.round(ex))}" y="${String(Math.round(ey))}"/></a:quadBezTo>`,
        );
      } else if (cmd === 'Z' || cmd === 'z') {
        ops.push('<a:close/>');
      }
    });
    path = ops.join('');
  } catch {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }

  if (path.length === 0) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const body = `<a:path w="${String(w)}" h="${String(h)}">${path}</a:path>`;

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${String(w)}" b="${String(h)}"/><a:pathLst>${body}</a:pathLst></a:custGeom>`;
}
