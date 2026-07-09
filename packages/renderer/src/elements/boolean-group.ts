import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveStyleColor, resolveStyleFillToSvgPaint } from '@broadset/model';

import type { ElementRendererFactory } from '../core/contracts';
import { computeBooleanPath } from './_util/boolean-path';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Boolean composite group renderer. Walks the current document for the
 * element's direct path children, applies the declared boolean operation
 * (`union` / `subtract` / `intersect` / `exclude`), and mounts a single
 * combined `<path>` inside the host. Stroke/fill inherit from the first
 * path child.
 *
 * Splitting this behavior out of the plain group renderer keeps two very
 * different responsibilities separate and matches the Phase 3.3 spec
 * split between Plain Group Element Rendering and Boolean Composite
 * Group Rendering.
 */
export function createBooleanGroupRenderer(): ElementRendererFactory {
  return ({ document: initialDoc, element, host }) => {
    function render(el: BroadsetElement, currentDoc: BroadsetDocument): void {
      if (el.booleanOperation === null) {
        host.textContent = '';

        return;
      }

      const children = currentDoc.elements.filter((child) => child.parentId === el.id);
      const combinedPath = computeBooleanPath(children, el.booleanOperation);

      if (combinedPath === null) {
        host.textContent = '';

        return;
      }

      const firstChild = children[0];
      const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
      const path = document.createElementNS(SVG_NAMESPACE, 'path');

      svg.setAttribute('viewBox', `0 0 ${String(Math.max(el.width, 1))} ${String(Math.max(el.height, 1))}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('overflow', 'visible');
      path.setAttribute('d', combinedPath);
      path.setAttribute('vector-effect', 'non-scaling-stroke');

      if (firstChild !== undefined) {
        applyChildStyle(path, firstChild);
      }

      svg.appendChild(path);
      host.replaceChildren(svg);
    }

    render(element, initialDoc);

    return {
      update(nextElement, nextDocument) {
        render(nextElement, nextDocument);
      },
      destroy() {
        host.replaceChildren();
        host.textContent = '';
      },
    };
  };
}

function applyChildStyle(path: SVGPathElement, firstChild: BroadsetElement): void {
  const childStyle = firstChild.style;

  path.setAttribute('stroke', resolveStyleColor(childStyle.stroke, { resolveTheme: false }) ?? 'none');
  path.setAttribute('stroke-width', String(childStyle.strokeWidth ?? DEFAULT_STROKE_WIDTH));
  path.setAttribute('fill', resolveStyleFillToSvgPaint(childStyle.fill, { resolveTheme: false }));

  if (childStyle.strokeOpacity !== undefined) {
    path.setAttribute('stroke-opacity', String(childStyle.strokeOpacity));
  }

  if (childStyle.fillOpacity !== undefined) {
    path.setAttribute('fill-opacity', String(childStyle.fillOpacity));
  }

  if (childStyle.strokeLinecap !== undefined) {
    path.setAttribute('stroke-linecap', childStyle.strokeLinecap);
  }

  if (childStyle.strokeLinejoin !== undefined) {
    path.setAttribute('stroke-linejoin', childStyle.strokeLinejoin);
  }

  if (childStyle.fillRule !== undefined) {
    path.setAttribute('fill-rule', childStyle.fillRule);
  }
}
