import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveStyleColor, resolveStyleFillToSvgPaint } from '@broadset/model';

import type { ElementRendererFactory } from '../core/contracts';
import { computeBooleanPath } from './_util/boolean-path';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Group renderer. Dispatches on `booleanOperation`:
 *
 * - When `booleanOperation` is `null`, the group is a plain structural
 *   container and the host is cleared so each child renders as its own
 *   positioned descendant (the controller walks the scene tree to mount
 *   child hosts inside this one).
 * - When `booleanOperation` is a supported op, the group emits a single
 *   combined SVG path computed from its direct path children. Stroke/fill
 *   attributes are inherited from the first path child.
 *
 * Splitting the two modes into separate behaviors (rather than smuggling
 * boolean-compositing into the plain group container) is a Phase 3.3
 * semantic-renderer goal already reflected in the spec — this file keeps
 * the dispatch centralized so callers don't have to branch on
 * `booleanOperation` themselves.
 */
export function createGroupRenderer(): ElementRendererFactory {
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
